import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Baseline, VerifyConfig, VerifyReport } from "./types.ts";
import type { FlowMap } from "./flow-map.ts";

function findRoot(): string {
  const env = process.env.CURSOR_PROJECT_DIR ?? process.env.CLAUDE_PROJECT_DIR;
  if (env && existsSync(join(env, "kane", "run-suite.sh"))) return env;
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "kane", "run-suite.sh"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export const PROJECT_ROOT = findRoot();

export const paths = {
  config: join(PROJECT_ROOT, ".studio-verify", "config.json"),
  flowMap: join(PROJECT_ROOT, ".studio-verify", "flow-map.json"),
  baseline: join(PROJECT_ROOT, ".studio-verify", "baseline.json"),
  lastVerify: join(PROJECT_ROOT, ".studio-verify", "last-verify.json"),
  blockedSnapshot: join(PROJECT_ROOT, "docs", "kane-runs", "verify", "blocked-run.json"),
  verifiedSnapshot: join(PROJECT_ROOT, "docs", "kane-runs", "verify", "verified-run.json"),
  runs: join(PROJECT_ROOT, ".studio-verify", "runs"),
  state: join(PROJECT_ROOT, ".studio-verify", "state"),
  hookLog: join(PROJECT_ROOT, ".studio-verify", "state", "hook.log"),
};

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function loadConfig(): VerifyConfig {
  const config = readJson<VerifyConfig>(paths.config);
  if (!config) throw new Error(`missing or malformed ${paths.config}`);
  return config;
}

export function loadFlowMap(): FlowMap {
  return readJson<FlowMap>(paths.flowMap) ?? {};
}

export function loadBaseline(): Baseline | null {
  return readJson<Baseline>(paths.baseline);
}

export function loadLastVerify(): VerifyReport | null {
  return readJson<VerifyReport>(paths.lastVerify);
}

export function loadVerifySnapshot(kind: "blocked" | "verified"): VerifyReport | null {
  return readJson<VerifyReport>(kind === "blocked" ? paths.blockedSnapshot : paths.verifiedSnapshot);
}

/**
 * Progress goes to a file in hook mode. Stdout is Cursor's JSON channel;
 * a stray log line in front of followup_message would break the gate.
 */
export function makeLogger(toFile: boolean): (message: string) => void {
  if (!toFile) return (message: string) => process.stderr.write(`${message}\n`);
  mkdirSync(paths.state, { recursive: true });
  return (message: string) => {
    try {
      const stamp = new Date().toISOString();
      writeFileSync(paths.hookLog, `${stamp} ${message}\n`, { encoding: "utf8", flag: "a" });
    } catch {
      // Logging must never be the reason a verification run dies.
    }
  };
}

export async function isUrlReachable(url: string, timeoutMs = 4000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    return response.ok || response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
