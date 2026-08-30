#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { VerifyConfig } from "./types.ts";
import { loadConfig, loadFlowMap, loadBaseline, makeLogger, paths, writeJson, PROJECT_ROOT } from "./config.ts";
import { runBaseline } from "./baseline.ts";
import { runVerify, requireAppUp, blastRadius } from "./verify.ts";
import { changedFiles } from "./flow-map.ts";
import { formatBlockReason, formatSummary } from "./report.ts";
import { acquireVerifyLock } from "./lock.ts";

function flagValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function flagList(argv: string[], name: string): string[] | undefined {
  const value = flagValue(argv, name);
  return value ? value.split(",").map((entry) => entry.trim()).filter(Boolean) : undefined;
}

type AttemptState = { attempts: number };

function attemptPath(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, "") || "unknown";
  return join(paths.state, `attempts-${safe}.json`);
}

function readAttempts(sessionId: string): number {
  try {
    const raw = JSON.parse(readFileSync(attemptPath(sessionId), "utf8")) as AttemptState;
    return Number.isFinite(raw?.attempts) && raw.attempts >= 0 ? Math.floor(raw.attempts) : 0;
  } catch {
    return 0;
  }
}

function writeAttempts(sessionId: string, attempts: number): void {
  try {
    mkdirSync(paths.state, { recursive: true });
    writeJson(attemptPath(sessionId), { attempts });
  } catch {
    // Losing the counter costs one extra attempt, never correctness.
  }
}

function clearAttempts(sessionId: string): void {
  writeAttempts(sessionId, 0);
}

function loadDotEnv(): void {
  const envPath = join(PROJECT_ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function kaneLogin(log: (message: string) => void): void {
  const user = process.env.KANE_USERNAME;
  const key = process.env.KANE_ACCESS_KEY;
  if (!user || !key) return;
  const result = spawnSync("kane-cli", ["login", "--username", user, "--access-key", key], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    log(`warning: kane-cli login exited ${result.status}`);
  }
}

function allow(note?: string): never {
  if (note) {
    try {
      mkdirSync(paths.state, { recursive: true });
      writeJson(join(paths.state, "last-allow.json"), { at: new Date().toISOString(), note });
    } catch {
      // ignore
    }
  }
  process.stdout.write("{}\n");
  process.exit(0);
}

function followUp(reason: string): never {
  process.stdout.write(`${JSON.stringify({ followup_message: reason })}\n`);
  process.exit(0);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

type StopHookPayload = {
  session_id?: string;
  conversation_id?: string;
  stop_hook_active?: boolean;
  loop_count?: number;
  transcript_path?: string;
};

function lastUserRequest(transcriptPath: string | undefined): string {
  if (!transcriptPath || !existsSync(transcriptPath)) return "the requested change";
  try {
    const lines = readFileSync(transcriptPath, "utf8").trim().split("\n");
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const entry = JSON.parse(lines[index]) as {
        type?: string;
        message?: { role?: string; content?: unknown };
      };
      if (entry.type !== "user" && entry.message?.role !== "user") continue;
      const content = entry.message?.content;
      const text =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content
                .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : ""))
                .join(" ")
            : "";
      const cleaned = text.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (cleaned && !cleaned.startsWith("[") && cleaned.length > 8) return cleaned.slice(0, 200);
    }
  } catch {
    // Fall through.
  }
  return "the requested change";
}

/**
 * Cursor stop hook. Fail open on infra / no baseline / app down / lock / attempt cap.
 * Fail closed only on a real Kane behavioral failure — via followup_message so the agent continues.
 */
async function commandHook(): Promise<never> {
  const log = makeLogger(true);
  let sessionId = "unknown";

  try {
    const raw = await readStdin();
    const payload = (raw ? JSON.parse(raw) : {}) as StopHookPayload;
    sessionId = payload.session_id ?? payload.conversation_id ?? "unknown";

    if (payload.stop_hook_active) {
      log("hook: re-entered while already active — allowing to avoid a stop loop");
      return allow();
    }

    const config = loadConfig();
    const flowMap = loadFlowMap();
    const changed = changedFiles(PROJECT_ROOT);
    const radius = blastRadius(config, flowMap, changed);

    log(`hook: session ${sessionId}, ${changed.length} changed file(s), ${radius.flows.length} affected flow(s)`);

    if (radius.flows.length === 0) {
      log("hook: no behavior-relevant changes — allowing without a browser run");
      clearAttempts(sessionId);
      return allow();
    }

    const baseline = loadBaseline();
    if (!baseline || Object.keys(baseline.flows).length === 0) {
      log("hook: no trusted baseline — allowing with a warning");
      return allow(
        "Studio verify has no trusted baseline yet, so this change was not verified. Run `npm run verify:baseline` on a known-good build.",
      );
    }

    const attempts = readAttempts(sessionId);
    if (attempts >= config.maxAttempts) {
      log(`hook: attempt budget ${config.maxAttempts} spent — escalating to human review`);
      clearAttempts(sessionId);
      return allow(
        `Studio verify: HUMAN REVIEW REQUIRED. ${config.maxAttempts} repair attempts did not restore the protected behavior. See .studio-verify/last-verify.json and /verified.`,
      );
    }

    loadDotEnv();
    kaneLogin(log);

    if (!(await requireAppUp(config, log))) {
      return allow(
        `Studio verify could not run: Studio (${config.studioUrl}) or API (${config.apiUrl}) is not reachable. Start them and re-run \`npm run verify\`.`,
      );
    }

    const lock = acquireVerifyLock(`stop hook, session ${sessionId}`);
    if (!lock.acquired) {
      log(`hook: another verification is already running — ${lock.heldBy}`);
      return allow(
        `Studio verify skipped this change: a verification is already running (${lock.heldBy}). Re-run \`npm run verify\` when it finishes.`,
      );
    }

    let report;
    try {
      report = await runVerify({
        config,
        baseline,
        flowMap,
        changeRequest: lastUserRequest(payload.transcript_path),
        agent: "Cursor",
        attempt: attempts + 1,
        budgetS: config.hookBudgetS,
        log,
      });
    } finally {
      lock.release();
    }

    if (report.verdict === "blocked") {
      writeAttempts(sessionId, attempts + 1);
      const broken = report.flows.filter((flow) => flow.status === "failed").map((flow) => flow.flow);
      log(
        `hook: BLOCKED — ${report.unexpectedCount} unexpected delta(s)` +
          (broken.length ? `, ${broken.length} flow(s) failing in the browser: ${broken.join(", ")}` : ""),
      );
      return followUp(formatBlockReason(report, config));
    }

    clearAttempts(sessionId);

    if (report.verdict === "error") {
      const detail = report.flows.map((flow) => flow.infraError).filter(Boolean)[0] ?? "unknown";
      log(`hook: could not verify — ${detail}`);
      return allow(`Studio verify could not verify this change (${detail}). Protected behavior was NOT confirmed.`);
    }

    log(`hook: verified — ${report.affectedFlows.length} protected flow(s) unchanged`);
    return allow(
      `Studio verify: Kane replayed ${report.affectedFlows.length} protected flow(s) — no unexpected behavioral change.`,
    );
  } catch (error) {
    log(`hook: internal error — ${(error as Error).message}`);
    return allow();
  }
}

async function commandBaseline(argv: string[]): Promise<number> {
  const log = makeLogger(false);
  loadDotEnv();
  kaneLogin(log);
  const config = loadConfig();
  if (!(await requireAppUp(config, log))) return 2;
  await runBaseline({ config, flows: flagList(argv, "--flow"), log });
  return 0;
}

async function commandVerify(argv: string[]): Promise<number> {
  const log = makeLogger(false);
  loadDotEnv();
  kaneLogin(log);
  const config = loadConfig();
  const baseline = loadBaseline();
  if (!baseline) {
    log("no baseline yet — run `npm run verify:baseline` against a known-good build first");
    return 2;
  }
  if (!(await requireAppUp(config, log))) return 2;

  const flows = argv.includes("--all") ? Object.keys(baseline.flows) : flagList(argv, "--flow");

  const report = await runVerify({
    config,
    baseline,
    flowMap: loadFlowMap(),
    changeRequest: flagValue(argv, "--request") ?? "the requested change",
    agent: flagValue(argv, "--agent-name") ?? "Cursor",
    attempt: 1,
    budgetS: Number(flagValue(argv, "--budget") ?? config.hookBudgetS),
    flows,
    log,
  });

  process.stdout.write(formatSummary(report, config));
  return report.verdict === "blocked" ? 1 : report.verdict === "error" ? 2 : 0;
}

function commandStatus(): number {
  const config: VerifyConfig = loadConfig();
  const baseline = loadBaseline();
  const changed = changedFiles(PROJECT_ROOT);
  const radius = blastRadius(config, loadFlowMap(), changed);

  const lines = [
    "",
    `  studio             ${config.studioUrl}`,
    `  api                ${config.apiUrl}`,
    `  trusted baseline   ${baseline ? `${Object.keys(baseline.flows).length} flow(s) @ ${baseline.commit}` : "none — run `npm run verify:baseline`"}`,
    `  changed files      ${changed.length} (${radius.changed.length} behavior-relevant)`,
    `  blast radius       ${radius.flows.join(", ") || "none"}`,
    `  unmapped files     ${radius.unmapped.join(", ") || "none"}`,
  ];

  if (baseline) {
    lines.push("", "  protected observables, as a real browser last saw them:");
    for (const [name, flow] of Object.entries(baseline.flows)) {
      const protectedKeys = config.flows[name]?.protect ?? [];
      const shown = protectedKeys.map((key) => `${key}=${flow.state[key] ?? "?"}`).join("  ");
      lines.push(`    ${(config.flows[name]?.label ?? name).padEnd(16)} ${shown}`);
    }
  }

  process.stdout.write(`${lines.join("\n")}\n\n`);
  return 0;
}

const USAGE = `
studio-verify — Kane replays Studio TestMD. Cursor may stop only when protected observables match.

  verify baseline [--flow a,b]     record the trusted build's real browser behavior
  verify         [--flow a,b]     replay affected flows and compare against the baseline
                 [--all]          replay every trusted flow, whatever the diff says
                 [--request "…"]  the change request, for the report
  verify hook                     Cursor stop hook (reads the hook payload on stdin)
  verify status                   what this working tree would trigger
`;

async function main(): Promise<void> {
  const [command, ...argv] = process.argv.slice(2);
  switch (command) {
    case "hook":
      await commandHook();
      return;
    case "baseline":
      process.exit(await commandBaseline(argv));
      break;
    case "verify":
      process.exit(await commandVerify(argv));
      break;
    case "status":
      process.exit(commandStatus());
      break;
    default:
      process.stdout.write(USAGE);
      process.exit(command ? 1 : 0);
  }
}

void main();
