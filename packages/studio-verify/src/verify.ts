import { join } from "node:path";
import type {
  TimelineEntry,
  TimelineKind,
  VerifiedFlow,
  VerifyConfig,
  VerifyReport,
} from "./types.ts";
import { runTestmd, type RunOptions } from "./kane.ts";
import { blockingDeltas, compareFlow } from "./comparator.ts";
import { changedFiles, mapFilesToFlows, matchesGlob, type FlowMap } from "./flow-map.ts";
import { PROJECT_ROOT, paths, writeJson, isUrlReachable } from "./config.ts";

export type VerifyOptions = {
  config: VerifyConfig;
  baseline: import("./types.ts").Baseline;
  flowMap: FlowMap;
  changeRequest: string;
  agent: string;
  attempt: number;
  budgetS: number;
  flows?: string[];
  log: (message: string) => void;
  runner?: (testPath: string, options: RunOptions) => Promise<import("./types.ts").KaneRun>;
  persist?: boolean;
};

export type BlastRadiusResult = {
  changed: string[];
  flows: string[];
  unmapped: string[];
};

export function blastRadius(config: VerifyConfig, flowMap: FlowMap, files: string[]): BlastRadiusResult {
  const relevant = files.filter((file) => !config.ignore.some((glob) => matchesGlob(file, glob)));
  const { flows, unmapped } = mapFilesToFlows(relevant, flowMap);

  const selected = new Set(flows);
  if (unmapped.length && config.flows[config.fallbackFlow]) selected.add(config.fallbackFlow);

  return { changed: relevant, flows: [...selected].sort(), unmapped };
}

function riskOrder(config: VerifyConfig, flow: string): number {
  const risk = config.flows[flow]?.risk;
  return risk === "HIGH" ? 0 : risk === "MED" ? 1 : 2;
}

export async function runVerify(options: VerifyOptions): Promise<VerifyReport> {
  const { config, baseline, flowMap, log } = options;
  const startedAt = new Date();
  const timeline: TimelineEntry[] = [];
  const note = (label: string, kind: TimelineKind) => {
    timeline.push({ at: new Date().toISOString(), label, kind });
    log(`${kind}: ${label}`);
  };

  const changed = changedFiles(PROJECT_ROOT);
  const radius = blastRadius(config, flowMap, changed);
  note(`${options.agent} changed ${radius.changed.length} file(s)`, "change");

  if (radius.unmapped.length) {
    log(`warning: no flow map entry for ${radius.unmapped.join(", ")} — falling back to ${config.fallbackFlow}`);
  }

  const requested = options.flows?.length ? options.flows : radius.flows;
  const selected = requested
    .filter((flow) => config.flows[flow] && baseline.flows[flow])
    .sort((a, b) => riskOrder(config, a) - riskOrder(config, b));

  const untrusted = requested.filter((flow) => config.flows[flow] && !baseline.flows[flow]);
  if (untrusted.length) log(`warning: no baseline for ${untrusted.join(", ")} — cannot verify those`);

  note(`Blast radius: ${selected.length} protected flow(s)`, "impact");

  const flows: VerifiedFlow[] = [];
  const skippedFlows: string[] = [];
  const deadline = startedAt.getTime() + options.budgetS * 1000;

  for (const name of selected) {
    const flow = config.flows[name];
    const remainingS = Math.floor((deadline - Date.now()) / 1000);

    if (remainingS < 60) {
      skippedFlows.push(name);
      flows.push({
        flow: name,
        status: "error",
        shareUrl: null,
        runDir: null,
        reason: `skipped: only ${Math.max(remainingS, 0)}s left of the ${options.budgetS}s budget`,
        failedStep: null,
        deltas: [],
        infraError: "verification budget exhausted before this flow ran",
      });
      log(`warning: skipped ${name} — verification budget exhausted`);
      continue;
    }

    note(`Kane replaying ${flow.label.toLowerCase()} in a real browser`, "verify");

    const replay = options.runner ?? runTestmd;
    const kaneOptions = {
      cwd: PROJECT_ROOT,
      variablesFile: join(PROJECT_ROOT, config.variablesFile),
      timeoutS: Math.min(config.perTestTimeoutS, remainingS),
      logPath: join(paths.runs, `verify-${name}.ndjson`),
      onLog: log,
    };

    let run = await replay(join(PROJECT_ROOT, flow.test), kaneOptions);

    if (run.status === "failed" && !run.infraError) {
      log(`retry: ${name} failed at "${run.failedStep ?? "an unnamed step"}" — replaying once more`);
      const second = await replay(join(PROJECT_ROOT, flow.test), kaneOptions);
      if (second.status === "passed") {
        log(`retry: ${name} passed on the second replay — treating the first as a flake`);
        run = second;
      } else {
        log(`retry: ${name} failed twice — this is not a flake`);
        run = second;
      }
    }

    const trusted = baseline.flows[name];
    const deltas =
      run.infraError || run.status === "error"
        ? []
        : compareFlow(trusted.state, run.observed, [...flow.protect, ...flow.observe], {
            expectedChanges: flow.observe,
          });

    flows.push({
      flow: name,
      status: run.status,
      shareUrl: run.shareUrl,
      runDir: run.runDir,
      reason: run.reason,
      failedStep: run.failedStep,
      deltas,
      infraError: run.infraError,
    });

    const blocking = blockingDeltas(deltas);
    if (run.infraError) {
      log(`error: ${name} could not be verified — ${run.infraError}`);
    } else if (blocking.length) {
      for (const delta of blocking) {
        note(`${flow.label}: ${delta.key} moved ${delta.baseline} → ${delta.candidate}`, "fail");
      }
    } else if (run.status !== "passed") {
      note(`${flow.label} failed in the browser${run.failedStep ? ` at "${run.failedStep}"` : ""}`, "fail");
    } else {
      note(`${flow.label} still behaves like the trusted build`, "proof");
    }
  }

  const unexpectedCount = flows.reduce((total, flow) => total + blockingDeltas(flow.deltas).length, 0);
  const behavioralFailure = flows.some(
    (flow) => flow.status === "failed" || blockingDeltas(flow.deltas).length > 0,
  );
  const incomplete = flows.some((flow) => flow.status === "error") || skippedFlows.length > 0;
  const couldNotTell = flows.length === 0 || incomplete;

  const verdict: VerifyReport["verdict"] = behavioralFailure
    ? "blocked"
    : couldNotTell && selected.length > 0
      ? "error"
      : "passed";

  if (verdict === "passed" && selected.length) note("Protected behavior verified — safe to ship", "proof");

  const report: VerifyReport = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    verdict,
    changeRequest: options.changeRequest,
    agent: options.agent,
    attempt: options.attempt,
    maxAttempts: config.maxAttempts,
    changedFiles: radius.changed,
    affectedFlows: selected,
    unmappedFiles: radius.unmapped,
    skippedFlows,
    flows,
    unexpectedCount,
    timeline,
  };

  if (options.persist !== false) writeJson(paths.lastVerify, report);
  return report;
}

export async function requireAppUp(config: VerifyConfig, log: (message: string) => void): Promise<boolean> {
  const studio = await isUrlReachable(config.studioUrl);
  if (!studio) {
    log(`error: ${config.studioUrl} is not reachable — start Studio before verifying`);
    return false;
  }
  const api = await isUrlReachable(config.apiUrl);
  if (!api) {
    log(`error: ${config.apiUrl} is not reachable — start the API before verifying`);
    return false;
  }
  return true;
}
