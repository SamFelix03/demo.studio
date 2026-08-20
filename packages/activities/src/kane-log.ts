import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getJob,
  getPool,
  loadConfig,
  prefix,
  putObject,
  updateJob,
  type Artifact,
} from "@demo-studio/shared";
import { workDir } from "./workdir.js";
import { emitEvent } from "./control.js";

const cfg = loadConfig();

export type KaneStepView = {
  tool: string;
  text: string;
  status?: string;
  step?: number;
  url?: string;
};

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function pickUrl(ev: Record<string, unknown>): string | undefined {
  const direct = str(ev.url || ev.page_url);
  if (direct.startsWith("http")) return direct;
  const state = ev.final_state as Record<string, unknown> | undefined;
  const fromState = str(state?.url || state?.page_url);
  if (fromState.startsWith("http")) return fromState;
  return undefined;
}

/** Turn one Kane CLI NDJSON event into a line a person can read. */
export function describeKaneEvent(ev: Record<string, unknown>): KaneStepView | null {
  const type = str(ev.type || ev.event).toLowerCase();
  if (type === "heartbeat" || type === "ping") return null;
  if (type === "recording_state" || type === "skill_update_available" || type === "bifurcation") return null;
  const remark = str(ev.remark || ev.message || ev.one_liner || ev.summary).replace(/\s+/g, " ").trim();
  const toolHint = remark.includes(":") ? remark.slice(0, remark.indexOf(":")).trim().toLowerCase() : "";
  const tool = (
    toolHint ||
    str(ev.tool || ev.name || ev.action).toLowerCase() ||
    type ||
    "kane"
  ).slice(0, 32);
  if (!remark && !type) return null;
  const text = remark || str(ev.instruction) || type;
  if (!text) return null;
  const status = str(ev.status) || undefined;
  const step = typeof ev.step === "number" ? ev.step : undefined;
  return { tool, text, status, step, url: pickUrl(ev) };
}

function logPaths(jobId: string) {
  const dir = workDir(jobId);
  mkdirSync(dir, { recursive: true });
  return {
    log: join(dir, "kane-actions.log"),
    jsonl: join(dir, "kane-actions.jsonl"),
  };
}

export function initKaneActionLog(jobId: string, meta: { url?: string; script?: string }) {
  const { log } = logPaths(jobId);
  if (existsSync(log)) return;
  const lines = [
    `# Kane CLI action log`,
    `# job: ${jobId}`,
    `# url: ${meta.url ?? ""}`,
    `# started: ${new Date().toISOString()}`,
    `#`,
    `# Each line is one event from Kane CLI (navigate, click, type, assert, wait, heal).`,
    `# This is what Kane actually did in the browser during the demo workflow.`,
    ``,
  ];
  if (meta.script) {
    lines.push(`# brief: ${meta.script.replace(/\n/g, " ").slice(0, 500)}`, ``);
  }
  appendFileSync(log, lines.join("\n"));
}

export function appendKaneAction(
  jobId: string,
  phase: string,
  extra: { beatId?: string; action?: string },
  ev: Record<string, unknown>,
  view: KaneStepView | null,
) {
  const { log, jsonl } = logPaths(jobId);
  appendFileSync(jsonl, `${JSON.stringify({ ts: new Date().toISOString(), phase, ...extra, event: ev })}\n`);
  if (!view) return;
  const time = new Date().toISOString().slice(11, 19);
  const beat = extra.beatId ? ` ${extra.beatId}` : "";
  const st = view.status ? ` [${view.status}]` : "";
  const url = view.url ? `  ${view.url}` : "";
  appendFileSync(log, `${time}  ${phase}${beat}  ${view.tool}${st}  ${view.text}${url}\n`);
}

export function kaneEventHandler(
  jobId: string,
  phase: string,
  extra: { beatId?: string; action?: string; index?: number } = {},
) {
  return (ev: Record<string, unknown>) => {
    const view = describeKaneEvent(ev);
    appendKaneAction(jobId, phase, extra, ev, view);
    if (!view) return;
    void emitEvent(jobId, "kane_step", {
      phase,
      beatId: extra.beatId,
      index: extra.index,
      action: extra.action,
      ...view,
    });
  };
}

export async function publishKaneLog(args: { jobId: string; mode: "kane" | "naive" }) {
  const { log, jsonl } = logPaths(args.jobId);
  if (!existsSync(log)) return { uploaded: false as const };
  const logKey = prefix(args.mode, args.jobId, "kane/kane-actions.log");
  const arts: Artifact[] = [{ type: "kane-log", object_key: logKey, mime_type: "text/plain" }];
  await putObject(logKey, readFileSync(log), "text/plain");
  if (existsSync(jsonl)) {
    const jsonlKey = prefix(args.mode, args.jobId, "kane/kane-actions.jsonl");
    await putObject(jsonlKey, readFileSync(jsonl), "application/x-ndjson");
    arts.push({ type: "kane-jsonl", object_key: jsonlKey, mime_type: "application/x-ndjson" });
  }
  const db = getPool(cfg.databaseUrl);
  const job = await getJob(db, args.jobId);
  const rest = (job?.artifacts ?? []).filter((a) => a.type !== "kane-log" && a.type !== "kane-jsonl");
  await updateJob(db, args.jobId, { artifacts: [...rest, ...arts] });
  await emitEvent(args.jobId, "phase", { phase: "kane_log", objectKey: logKey });
  return { uploaded: true as const, objectKey: logKey };
}
