import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { KaneRun, KaneStatus, Observations } from "./types.ts";

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

export function parseNdjson(stdout: string): Json[] {
  const events: Json[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const record = asRecord(parsed);
      if (record) events.push(record);
    } catch {
      // Progress UI and stray CLI chatter share the stream.
    }
  }
  return events;
}

function harvestObservations(event: Json, into: Observations): void {
  const context = asRecord(event.context);

  const memory = asRecord(context?.memory);
  if (memory) {
    for (const [key, raw] of Object.entries(memory)) {
      const value = asString(asRecord(raw)?.extracted_value);
      if (value !== null) into[key] = value;
    }
  }

  const variables = asRecord(context?.variables);
  if (variables) {
    for (const [key, raw] of Object.entries(variables)) {
      const value = asString(asRecord(raw)?.value);
      if (value !== null) into[key] = value;
    }
  }

  const finalState = asRecord(event.final_state);
  if (finalState) {
    for (const [key, raw] of Object.entries(finalState)) {
      const value = asString(raw);
      if (value !== null) into[key] = value;
    }
  }
}

function normalizeStatus(raw: unknown): KaneStatus | null {
  const value = asString(raw)?.toLowerCase();
  if (!value) return null;
  if (value === "passed" || value === "pass" || value === "success" || value === "done") return "passed";
  if (value === "failed" || value === "fail") return "failed";
  if (value === "error" || value === "errored") return "error";
  return null;
}

/**
 * Fold a `kane-cli testmd run --agent` stream into a single result.
 *
 * `test_md_summary.overall_status` is the file verdict. The first `run_end` is only step one.
 * Exit 2/3 means infra, never "your UI broke".
 */
export function summarizeTestmdRun(stdout: string, exitCode: number): KaneRun {
  const events = parseNdjson(stdout);
  const observed: Observations = {};

  let status: KaneStatus | null = null;
  let runDir: string | null = null;
  let shareUrl: string | null = null;
  let durationS: number | null = null;
  let credits: number | null = null;
  let reason: string | null = null;
  let failedStep: string | null = null;
  let replayDecisions = 0;
  let authorDecisions = 0;
  let screenshot: string | null = null;

  const headings = new Map<string, string>();

  for (const event of events) {
    const type = asString(event.type);
    harvestObservations(event, observed);

    runDir = asString(event.run_dir) ?? runDir;
    shareUrl = asString(event.share_url) ?? asString(event.test_url) ?? shareUrl;

    if (typeof event.credits_consumed === "number") {
      credits = (credits ?? 0) + event.credits_consumed;
    }
    for (const source of [event, asRecord(event.steps)]) {
      if (!source) continue;
      if (typeof source.replay_decisions === "number") replayDecisions += source.replay_decisions;
      if (typeof source.author_decisions === "number") authorDecisions += source.author_decisions;
    }

    if (type === "test_md_step_start") {
      const index = asString(event.step_index);
      const heading = asString(event.heading);
      if (index && heading) headings.set(index, heading);
    }

    if (type === "step_end") {
      screenshot = asString(event.screenshot) ?? screenshot;
    }

    if (type === "test_md_step_end") {
      const stepStatus = normalizeStatus(event.status);
      if (stepStatus && stepStatus !== "passed" && !failedStep) {
        const index = asString(event.step_index);
        failedStep =
          (index ? headings.get(index) : null) ??
          asString(event.heading) ??
          (index ? `step ${index}` : null);
        reason = asString(event.reason) ?? asString(event.error) ?? asString(event.summary) ?? reason;
      }
    }

    if (type === "test_md_summary") {
      status = normalizeStatus(event.overall_status) ?? status;
      if (typeof event.duration_s === "number") durationS = event.duration_s;
      reason = asString(event.reason) ?? reason;
    }

    if (type === "run_end") {
      if (!status) status = normalizeStatus(event.status);
      if (durationS === null && typeof event.duration === "number") durationS = event.duration;
      const runReason = asString(event.reason);
      if (runReason && !reason) reason = runReason;
    }
  }

  const infraError =
    exitCode === 2
      ? "kane-cli exited 2 (infrastructure, auth, or parse failure)"
      : exitCode === 3
        ? "kane-cli exited 3 (run timed out)"
        : events.length === 0
          ? "kane-cli produced no NDJSON events"
          : null;

  if (!status) status = infraError ? "error" : exitCode === 0 ? "passed" : "failed";

  return {
    status: infraError ? "error" : status,
    observed,
    runDir,
    shareUrl,
    durationS,
    credits,
    replayed: replayDecisions > 0 && authorDecisions === 0,
    reason,
    failedStep,
    screenshot,
    exitCode,
    infraError,
  };
}

export type RunOptions = {
  variablesFile?: string;
  timeoutS: number;
  cwd?: string;
  logPath?: string;
  onLog?: (message: string) => void;
};

export function runTestmd(testPath: string, options: RunOptions): Promise<KaneRun> {
  const args = [
    "--local",
    "testmd",
    "run",
    testPath,
    "--agent",
    "--headless",
    "--timeout",
    String(options.timeoutS),
    "--max-steps",
    "24",
  ];
  if (options.variablesFile && existsSync(options.variablesFile)) {
    args.push("--variables-file", options.variablesFile);
  }

  options.onLog?.(`kane-cli ${args.join(" ")}`);

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn("kane-cli", args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const killTimer = setTimeout(() => {
      child.kill("SIGKILL");
    }, (options.timeoutS + 90) * 1000);

    const finish = (exitCode: number, fallbackError?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      const result = summarizeTestmdRun(stdout, exitCode);
      resolve(fallbackError ? { ...result, status: "error", infraError: fallbackError } : result);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error: Error) => {
      finish(2, `could not launch kane-cli: ${error.message}`);
    });

    child.on("close", (code: number | null, signal: string | null) => {
      if (options.logPath) {
        try {
          mkdirSync(dirname(options.logPath), { recursive: true });
          writeFileSync(options.logPath, `${stdout}\n--- stderr ---\n${stderr}`, "utf8");
        } catch {
          // Losing the transcript must never lose the verdict.
        }
      }
      if (signal === "SIGKILL") return finish(3, `kane-cli killed after ${options.timeoutS + 90}s`);
      finish(code ?? 2);
    });
  });
}
