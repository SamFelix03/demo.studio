import {
  ABORT_MESSAGES,
  acquireSlot,
  appendEvent,
  evaluateSuccess,
  getPool,
  heartbeatSlot,
  loadConfig,
  releaseSlot,
  RESULT_ABORT_CODES,
  type Beat,
  type JobInput,
} from "@demo-studio/shared";
import { ApplicationFailure } from "@temporalio/activity";
import { spawnKane } from "./spawn.js";

const cfg = loadConfig();

function db() {
  return getPool(cfg.databaseUrl);
}

export async function toolingHealth(): Promise<{
  whoami: string;
  balance: string;
  kaneOk: boolean;
}> {
  try {
    let who = await spawnKane(["whoami"], { timeoutMs: 20_000 });
    if (who.exitCode !== 0 && cfg.kaneUsername && cfg.kaneAccessKey) {
      const loginArgs = [
        "login",
        "--username",
        cfg.kaneUsername,
        "--access-key",
        cfg.kaneAccessKey,
      ];
      if (process.env.KANE_PROJECT_ID) {
        loginArgs.push("--project-id", process.env.KANE_PROJECT_ID);
      }
      const login = await spawnKane(loginArgs, { timeoutMs: 60_000 });
      if (login.exitCode !== 0) {
        throw ApplicationFailure.create({
          message: `Kane CLI login failed: ${(login.stderr || login.stdout).slice(-400)}`,
          type: "controller_auth",
          nonRetryable: true,
        });
      }
      who = await spawnKane(["whoami"], { timeoutMs: 20_000 });
    }
    const bal = await spawnKane(["balance"], { timeoutMs: 30_000 });
    await spawnKane(["config", "show"], { timeoutMs: 15_000 });
    await spawnKane(["config", "set-window", "1440x900"], { timeoutMs: 15_000 });
    const ok = who.exitCode === 0;
    if (!ok) {
      throw ApplicationFailure.create({
        message: "Kane CLI is not authenticated. Set KANE_USERNAME and KANE_ACCESS_KEY, or run kane-cli login.",
        type: "controller_auth",
        nonRetryable: true,
      });
    }
    return { whoami: who.stdout, balance: bal.stdout, kaneOk: true };
  } catch (err) {
    if (err instanceof ApplicationFailure) throw err;
    throw ApplicationFailure.create({
      message: `kane-cli not available: ${String(err)}`,
      type: "controller_auth",
      nonRetryable: true,
    });
  }
}

export async function acquireChromeSlot(jobId: string) {
  for (let i = 0; i < 30; i++) {
    const slot = await acquireSlot(db(), jobId, cfg.workerIdentity);
    if (slot) {
      await appendEvent(db(), jobId, "phase", {
        phase: "slot_acquired",
        port: slot.port,
      });
      return slot;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw ApplicationFailure.create({
    message: "No Chrome slot available",
    type: "queue_busy",
    nonRetryable: false,
  });
}

export async function heartbeatChromeSlot(slotId: string, jobId: string) {
  await heartbeatSlot(db(), slotId, jobId);
}

export async function releaseChromeSlot(slotId: string, jobId: string) {
  await releaseSlot(db(), slotId);
  await appendEvent(db(), jobId, "phase", { phase: "slot_released", slotId });
}

export async function emitEvent(
  jobId: string,
  kind: string,
  payload: Record<string, unknown>,
) {
  await appendEvent(db(), jobId, kind, payload);
}

export async function setJobStep(jobId: string, step: string) {
  const { updateJob } = await import("@demo-studio/shared");
  await updateJob(db(), jobId, { status: "running", step });
  await appendEvent(db(), jobId, "phase", { phase: step });
}

export async function markJobTerminal(args: {
  jobId: string;
  status: "failed" | "aborted";
  error: string;
  error_code?: string;
  abort_code?: string;
}) {
  const { updateJob } = await import("@demo-studio/shared");
  await updateJob(db(), args.jobId, {
    status: args.status,
    error: args.error,
    error_code: args.error_code ?? null,
    abort_code: args.abort_code ?? null,
  });
  await appendEvent(db(), args.jobId, "phase", {
    phase: args.status,
    error: args.error,
    error_code: args.error_code,
  });
}

export function abortFromRunEnd(
  runEnd: Record<string, unknown> | null,
  hasCredentials: boolean,
): { code: string; message: string } | null {
  if (!runEnd) return null;
  const rc = Number(runEnd.result_code ?? runEnd.resultCode ?? 0);
  if (rc === 660 && hasCredentials) return null;
  const mapped = RESULT_ABORT_CODES[rc];
  if (mapped) {
    return { code: mapped, message: ABORT_MESSAGES[mapped] ?? mapped };
  }
  const state = (runEnd.final_state ?? {}) as Record<string, string>;
  const truthy = (v: unknown) =>
    String(v).toLowerCase() === "true" || String(v).toLowerCase() === "yes";
  if (truthy(state.has_captcha)) {
    return { code: "captcha", message: ABORT_MESSAGES.captcha };
  }
  if (truthy(state.has_bot_challenge)) {
    return {
      code: "cloudflare_challenge",
      message: ABORT_MESSAGES.cloudflare_challenge,
    };
  }
  if (truthy(state.has_mfa)) {
    return { code: "mfa", message: ABORT_MESSAGES.mfa };
  }
  if (truthy(state.has_paywall)) {
    return { code: "paywall", message: ABORT_MESSAGES.paywall };
  }
  if (truthy(state.has_login_wall) && !hasCredentials) {
    return { code: "login_required", message: ABORT_MESSAGES.login_required };
  }
  return null;
}

export function beatsFromScript(input: JobInput, site?: Record<string, string>): Beat[] {
  if (input.beats?.length) return input.beats;
  const sentences = input.script
    .split(/[.\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  return sentences.map((s, i) => ({
    id: `beat-${i + 1}`,
    title: s.slice(0, 48),
    action: s,
    where: "header nav",
    success: {
      visibleText: site?.hero_heading || s.split(" ").slice(0, 3).join(" "),
    },
    narration: s,
  }));
}

export { evaluateSuccess };
