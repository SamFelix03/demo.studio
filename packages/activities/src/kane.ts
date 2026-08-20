import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, copyFileSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  loadConfig,
  prefix,
  putObject,
  updateJob,
  getPool,
  type Beat,
  type JobInput,
  type KaneRunResult,
} from "@demo-studio/shared";
import { ApplicationFailure } from "@temporalio/activity";
import { abortFromRunEnd, emitEvent } from "./control.js";
import { spawnKane } from "./spawn.js";
import { initKaneActionLog, kaneEventHandler, publishKaneLog, describeKaneEvent } from "./kane-log.js";
import { requiredTools, tightenBeatGates, typedValueFromAction } from "./beat-gates.js";
import { runWithRecordedChrome } from "./chrome-session.js";
import { workDir } from "./workdir.js";

const execFileAsync = promisify(execFile);

const cfg = loadConfig();

function extraKaneFlags(): string[] {
  const flags: string[] = [];
  if (cfg.kaneWsEndpoint) flags.push("--ws-endpoint", cfg.kaneWsEndpoint);
  else if (process.env.KANE_CDP_ENDPOINT) flags.push("--cdp-endpoint", process.env.KANE_CDP_ENDPOINT);
  const wantHeadless = process.env.KANE_HEADED !== "1" && process.env.KANE_HEADLESS !== "0";
  if (wantHeadless && !process.env.KANE_CDP_ENDPOINT) flags.push("--headless");
  return flags;
}

function kaneFailureMessage(result: { exitCode: number; stderr: string; stdout: string }, phase: string) {
  const tail = (result.stderr || result.stdout).replace(/\s+/g, " ").trim().slice(-500);
  return `Kane ${phase} failed (exit ${result.exitCode})${tail ? `: ${tail}` : ""}`;
}

function redactArgv(argv: string[]) {
  const out = [...argv];
  for (let i = 0; i < out.length; i++) {
    if (out[i] === "--access-key" && out[i + 1]) out[i + 1] = "[redacted]";
    if (out[i] === "--username" && out[i + 1]) out[i + 1] = "[redacted]";
  }
  return out;
}

export async function kanePreflight(args: {
  jobId: string;
  mode: "kane" | "naive";
  input: JobInput;
  hasCredentials: boolean;
}) {
  initKaneActionLog(args.jobId, { url: args.input.website_url, script: args.input.script });
  const objective = `Go to the start URL.
If a cookie or consent banner is visible, dismiss Accept or Close.
Store the page title as 'page_title'.
Store the current URL as 'page_url'.
Store whether a CAPTCHA or I'm-not-a-robot challenge is visible as 'has_captcha'.
Store whether a Cloudflare or browser-check interstitial is visible as 'has_bot_challenge'.
Store whether a login or sign-in form is blocking the page as 'has_login_wall'.
Store whether a 2FA or verification-code prompt is visible as 'has_mfa'.
Store whether a paywall or subscribe-to-continue overlay is visible as 'has_paywall'.
Assert the main page content is visible unless one of those blockers is present.`;

  const argv = [
    "run",
    objective,
    "--agent",
    "--mode",
    "action",
    "--url",
    args.input.website_url,
    "--timeout",
    "60",
    "--max-steps",
    "15",
    ...extraKaneFlags(),
  ];
  await emitEvent(args.jobId, "kane_cmd", {
    argv: redactArgv(argv.filter((a) => a !== objective).concat(["<objective>"])),
  });
  const result = await spawnKane(argv, {
    timeoutMs: 120_000,
    cwd: workDir(args.jobId),
    onEvent: kaneEventHandler(args.jobId, "preflight"),
  });
  await emitEvent(args.jobId, "ndjson", {
    phase: "preflight",
    runEnd: result.runEnd,
    exitCode: result.exitCode,
    steps: result.progress.map((p) => describeKaneEvent(p as Record<string, unknown>)).filter(Boolean),
  });
  if (result.runEnd) {
    await putObject(
      prefix(args.mode, args.jobId, "kane/run_end.json"),
      JSON.stringify(result.runEnd, null, 2),
      "application/json",
    );
  }
  const abort = abortFromRunEnd(result.runEnd, args.hasCredentials);
  if (abort) {
    await updateJob(getPool(cfg.databaseUrl), args.jobId, {
      status: "aborted",
      abort_code: abort.code,
      error: `Demo can't be recorded: ${abort.message}`,
      error_code: abort.code,
      step: "preflight",
    });
    throw ApplicationFailure.create({
      message: `Demo can't be recorded: ${abort.message}`,
      type: abort.code,
      nonRetryable: true,
    });
  }
  if (result.exitCode !== 0 && !result.runEnd) {
    const msg = kaneFailureMessage(result, "preflight");
    const missingRunner = /v16-runner not found/i.test(result.stderr);
    throw ApplicationFailure.create({
      message: msg,
      type: missingRunner ? "kane_runtime" : "kane_preflight",
      nonRetryable: !missingRunner,
    });
  }
  return { runEnd: result.runEnd, exitCode: result.exitCode };
}

export async function kaneUnderstand(args: {
  jobId: string;
  mode: "kane" | "naive";
  input: JobInput;
}) {
  const objective = `Go to ${args.input.website_url}.
If a cookie or consent banner is visible, dismiss it.
Store the primary header nav labels as 'nav_items' (comma-separated exact labels).
Store the main hero heading as 'hero_heading'.
Store the primary CTA label in the hero as 'hero_cta'.
Store visible button labels as 'buttons' (comma-separated).
Store visible text field labels or placeholders as 'inputs' (comma-separated).
Store main section headings as 'headings'.
Store visible plan or feature names if any as 'offerings'.
Do not click through to checkout or signup unless the URL already is that page.`;
  const argv = [
    "run",
    objective,
    "--agent",
    "--mode",
    "action",
    "--url",
    args.input.website_url,
    "--timeout",
    "90",
    "--max-steps",
    "20",
    ...extraKaneFlags(),
  ];
  await emitEvent(args.jobId, "kane_cmd", { phase: "understand" });
  const result = await spawnKane(argv, {
    timeoutMs: 150_000,
    cwd: workDir(args.jobId),
    onEvent: kaneEventHandler(args.jobId, "understand"),
  });
  const state = (result.runEnd?.final_state ?? {}) as Record<string, string>;
  const dir = workDir(args.jobId);
  const context = `# Demo Studio site notes
Prefer header navigation over footer links.
Hero CTA: ${state.hero_cta ?? "unknown"}
Hero heading: ${state.hero_heading ?? "unknown"}
Nav: ${state.nav_items ?? "unknown"}
Buttons: ${state.buttons ?? "unknown"}
Inputs: ${state.inputs ?? "unknown"}
Headings: ${state.headings ?? "unknown"}
Never click chat widgets or cookie settings after dismiss.
Use exact visible labels from this list when clicking or typing.
`;
  writeFileSync(join(dir, "context.md"), context);
  const variables: Record<string, { value: string; secret?: boolean }> = {
    site: { value: JSON.stringify(state) },
  };
  if (args.input.credentials?.username) {
    variables.username = { value: args.input.credentials.username, secret: true };
  }
  if (args.input.credentials?.password) {
    variables.password = { value: args.input.credentials.password, secret: true };
  }
  writeFileSync(join(dir, "variables.json"), JSON.stringify(variables, null, 2));
  await putObject(prefix(args.mode, args.jobId, "context.md"), context, "text/markdown");
  await putObject(
    prefix(args.mode, args.jobId, "variables.json"),
    JSON.stringify(state, null, 2),
    "application/json",
  );
  await emitEvent(args.jobId, "phase", { phase: "site_map", final_state: state });
  return { final_state: state, contextPath: join(dir, "context.md") };
}

export async function kaneGenerate(args: {
  jobId: string;
  mode: "kane" | "naive";
  input: JobInput;
}): Promise<{ markdown?: string; stdout: string }> {
  const dir = workDir(args.jobId);
  const outPath = join(dir, "generated_test.md");
  const prompt = `Write a Kane testmd walkthrough for ${args.input.product_name ?? "this product"}.
Start URL: ${args.input.website_url}
Script: ${args.input.script}
Prefer header nav. One H2 per beat, one verify per beat. Dismiss cookies first.`;
  const argv = ["generate", prompt, "--agent", "--url", args.input.website_url, ...extraKaneFlags()];
  await emitEvent(args.jobId, "kane_cmd", { phase: "generate" });
  const result = await spawnKane(argv, {
    timeoutMs: 180_000,
    cwd: dir,
    onEvent: kaneEventHandler(args.jobId, "generate"),
  });
  const reqId = String(
    result.runEnd?.request_id ?? result.runEnd?.req ?? result.runEnd?.id ?? "",
  );
  if (reqId && reqId !== "undefined") {
    await spawnKane(
      ["generate", "--save", "--req", reqId, "--out", dir, "--agent", ...extraKaneFlags()],
      { timeoutMs: 120_000, cwd: dir },
    );
  }
  await emitEvent(args.jobId, "ndjson", {
    phase: "generate",
    exitCode: result.exitCode,
    runEnd: result.runEnd,
    reqId,
  });
  const saved = walkFiles(dir).find((f) => /_test\.md$/.test(f) && !f.includes("demo_test.md"));
  const path = existsSync(outPath) ? outPath : saved;
  if (path && existsSync(path)) {
    const markdown = readFileSync(path, "utf8");
    await putObject(
      prefix(args.mode, args.jobId, "generated_test.md"),
      markdown,
      "text/markdown",
    );
    return { markdown, stdout: result.stdout };
  }
  return { stdout: result.stdout };
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) walkFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

async function unzipEvidence(jobId: string): Promise<{ files: string[]; notes: string }> {
  const dir = workDir(jobId);
  const dest = join(dir, "evidence");
  mkdirSync(dest, { recursive: true });
  const archives = walkFiles(dir).filter((f) => f.endsWith(".zip") || f.endsWith(".evidence"));
  for (const zip of archives) {
    await execFileAsync("unzip", ["-o", "-q", zip, "-d", dest]).catch(() => undefined);
  }
  const files = walkFiles(dest);
  const textish = files.filter((f) => /\.(md|txt|json|log|ya?ml)$/i.test(f)).slice(0, 12);
  const notes = textish
    .map((f) => {
      try {
        return `${f}:\n${readFileSync(f, "utf8").slice(0, 2000)}`;
      } catch {
        return "";
      }
    })
    .join("\n");
  return { files, notes };
}

function orderedKaneScreenshots(root: string): string[] {
  const files = walkFiles(root).filter((f) => {
    if (/annotated/i.test(f)) return false;
    if (!/screenshot\.(jpg|jpeg|png)$/i.test(f)) return false;
    try {
      return statSync(f).size >= 16_000;
    } catch {
      return false;
    }
  });
  const idx = (p: string) => {
    const m = p.match(/steps\/(\d+)/i) || p.match(/\/(\d+)-\d+-\d+\//);
    return m ? Number(m[1]) : 0;
  };
  return files.sort((a, b) => {
    const d = idx(a) - idx(b);
    return d !== 0 ? d : a.localeCompare(b);
  });
}

function findSessionDir(
  runEnd: Record<string, unknown> | null,
  progress?: KaneRunResult["progress"],
) {
  const from = (o: Record<string, unknown> | null | undefined) => {
    if (!o) return "";
    if (typeof o.session_dir === "string") return o.session_dir;
    const ctx = o.context as Record<string, unknown> | undefined;
    if (ctx && typeof ctx.session_dir === "string") return ctx.session_dir;
    return "";
  };
  const first = from(runEnd);
  if (first && existsSync(first)) return first;
  for (const ev of [...(progress ?? [])].reverse()) {
    const d = from(ev as Record<string, unknown>);
    if (d && existsSync(d)) return d;
  }
  return "";
}

export async function harvestKaneVisuals(
  jobId: string,
  runEnd: Record<string, unknown> | null,
  dest?: string,
  progress?: KaneRunResult["progress"],
  copyAll = false,
) {
  const dir = dest ?? join(workDir(jobId), "stills");
  mkdirSync(dir, { recursive: true });
  const sessionDir = findSessionDir(runEnd, progress);
  if (!sessionDir || !existsSync(sessionDir)) return { stillCount: 0 };
  const raw = join(dir, "_raw");
  mkdirSync(raw, { recursive: true });
  let n = 0;
  for (const f of walkFiles(sessionDir)) {
    if (!/\.(evidence|zip)$/i.test(f) && !/screenshot\.(jpg|jpeg|png)$/i.test(f)) continue;
    const name = `${String(n++).padStart(3, "0")}-${f.split("/").pop() || "file"}`;
    copyFileSync(f, join(raw, name));
  }
  for (const zip of walkFiles(raw).filter((f) => /\.(zip|evidence)$/i.test(f))) {
    await execFileAsync("unzip", ["-o", "-q", zip, "-d", raw]).catch(() => undefined);
  }
  const shots = orderedKaneScreenshots(raw);
  if (copyAll) {
    shots.forEach((f, i) => {
      const ext = f.toLowerCase().endsWith(".png") ? "png" : "jpg";
      copyFileSync(f, join(dir, `${String(i).padStart(3, "0")}.${ext}`));
    });
    return { stillCount: shots.length };
  }
  const last = shots[shots.length - 1];
  if (last) {
    const ext = last.toLowerCase().endsWith(".png") ? "png" : "jpg";
    copyFileSync(last, join(dir, `000.${ext}`));
  }
  return { stillCount: last ? 1 : 0 };
}

function eventHasTool(ev: Record<string, unknown>, tool: "click" | "type"): boolean {
  const view = describeKaneEvent(ev);
  const blob = `${view?.tool ?? ""} ${view?.text ?? ""} ${JSON.stringify(ev)}`.toLowerCase();
  if (tool === "type") return /\btype\b|\bfill\b/.test(blob);
  return /\bclick\b/.test(blob);
}

function assignBeatWindows(
  beats: Beat[],
  stamped: Array<{ t: number; ev: Record<string, unknown> }>,
  t0: number,
  tEnd: number,
): Array<{ beatIndex: number; startMs: number; endMs: number }> {
  const ends = stamped.filter(({ ev }) => {
    const type = String(ev.type ?? "").toLowerCase();
    const view = describeKaneEvent(ev);
    return type === "run_end" || view?.tool === "run_end";
  });
  const span = Math.max(1, tEnd - t0);
  if (ends.length >= beats.length) {
    const use = ends.slice(-beats.length);
    let prev = 0;
    return beats.map((_, i) => {
      const endMs = Math.max(prev + 800, use[i].t - t0);
      const startMs = prev;
      prev = endMs;
      return { beatIndex: i, startMs, endMs: i === beats.length - 1 ? span : endMs };
    });
  }
  const starts = beats.map(() => -1);
  for (const { t, ev } of stamped) {
    const view = describeKaneEvent(ev);
    const blob = `${view?.text ?? ""} ${JSON.stringify(ev)}`.toLowerCase();
    for (let i = 0; i < beats.length; i++) {
      if (starts[i] >= 0) continue;
      const title = beats[i].title.toLowerCase().replace(/[^\w]+/g, " ").trim();
      const needle = title.slice(0, Math.min(28, title.length));
      if (needle.length >= 5 && blob.includes(needle)) {
        starts[i] = t;
        break;
      }
    }
  }
  let next = 0;
  for (const { t, ev } of stamped) {
    while (next < beats.length && starts[next] >= 0) next++;
    if (next >= beats.length) break;
    const need = requiredTools(beats[next].action)[0];
    if (!need) continue;
    if (eventHasTool(ev, need)) starts[next] = t;
  }
  let last = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] < 0) starts[i] = last;
    last = starts[i];
  }
  return beats.map((_, i) => {
    const startMs = Math.max(0, starts[i] - t0);
    const nextStart = i + 1 < starts.length ? Math.max(0, starts[i + 1] - t0) : span;
    const endMs = Math.max(startMs + 400, nextStart);
    return { beatIndex: i, startMs, endMs };
  });
}

function liveFrames(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /\.(jpg|jpeg|png)$/i.test(n))
    .map((n) => join(dir, n))
    .sort();
}

type LiveRec = { t: number; file: string };

function readLiveIndex(framesDir: string): LiveRec[] {
  const p = join(framesDir, "index.jsonl");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const rec = JSON.parse(line) as LiveRec;
        return rec.file && existsSync(rec.file) ? [rec] : [];
      } catch {
        return [];
      }
    });
}

function copyWindowStills(frames: string[], dest: string) {
  mkdirSync(dest, { recursive: true });
  const use = frames.length ? frames : [];
  use.forEach((f, i) => {
    const ext = f.toLowerCase().endsWith(".png") ? "png" : "jpg";
    copyFileSync(f, join(dest, `${String(i).padStart(3, "0")}.${ext}`));
  });
  return use.length;
}

function framesInWindow(index: LiveRec[], t0: number, startMs: number, endMs: number, carry?: string): string[] {
  const a = t0 + startMs;
  const b = t0 + endMs;
  const inWin = index.filter((f) => f.t >= a && f.t < b).map((f) => f.file);
  if (inWin.length) return inWin;
  const before = index.filter((f) => f.t <= b);
  if (before.length) return [before[before.length - 1].file];
  if (carry) return [carry];
  return index.slice(0, 1).map((f) => f.file);
}

export async function compileTestMd(args: {
  jobId: string;
  input: JobInput;
  beats: Beat[];
  audioSeconds?: number[];
}) {
  const dir = workDir(args.jobId);
  const helpers = join(dir, "helpers");
  mkdirSync(helpers, { recursive: true });
  writeFileSync(
    join(helpers, "dismiss_chrome.md"),
    `If a cookie, consent, newsletter, or chat widget is visible, dismiss it.\nVerify the main page is usable.\nDo not navigate away from the start URL.\n`,
  );
  const beats = tightenBeatGates(args.beats);
  const beatsMd = beats
    .map((b) => {
      const checks: string[] = [];
      if (b.success.urlContains) checks.push(`Verify the URL contains "${b.success.urlContains}".`);
      if (b.success.titleContains) checks.push(`Verify the page title contains "${b.success.titleContains}".`);
      if (b.success.visibleText) checks.push(`Verify text "${b.success.visibleText}" is visible.`);
      if (b.success.headingContains) checks.push(`Verify a heading contains "${b.success.headingContains}".`);
      const value = typedValueFromAction(b.action);
      const tools = requiredTools(b.action);
      let body: string;
      if (value) {
        const rest = b.action.replace(/\b(?:type|fill|enter)\s+.+?\s+into\s+[^.]+[.]?/i, "").replace(/^then\s+/i, "").trim();
        body = `Select the field${b.targetText && !tools.includes("click") ? ` labeled ${b.targetText}` : ""}.
Replace its contents with exactly this value, then stop typing. Type the value once. Do not type quotation marks, brackets, or anything after it.

${value}

If the field already shows that value, do not type again.${rest ? `\nThen ${rest}` : ""}`;
      } else if (tools.includes("click")) {
        body = `${b.action}${b.targetText ? ` (control: ${b.targetText})` : ""}
Click once. Do not type. Stay in this browser tab.`;
      } else {
        body = `${b.action}${b.targetText ? ` (control: ${b.targetText})` : ""}`;
      }
      return `## ${b.title}

${body}
${checks.join("\n")}
`;
    })
    .join("\n");

  const md = `---
mode: action
url: ${args.input.website_url}
max_steps: 24
tags: [demo]
---

# ${args.input.product_name ?? "Product demo"}

## Dismiss blockers
\`\`\`yaml
optional: true
\`\`\`
@import ./helpers/dismiss_chrome.md

${beatsMd}
`;
  const path = join(dir, "demo_test.md");
  writeFileSync(path, md);
  await putObject(prefix("kane", args.jobId, "demo_test.md"), md, "text/markdown");
  return { path, markdown: md, beats };
}

export async function kaneTestmdRun(args: {
  jobId: string;
  mode: "kane" | "naive";
  beats: Beat[];
  replay?: boolean;
  timeoutSec?: number;
  cdpPort?: number;
}) {
  const dir = workDir(args.jobId);
  const testPath = join(dir, "demo_test.md");
  const beats = tightenBeatGates(args.beats);
  await emitEvent(args.jobId, "kane_cmd", { phase: args.replay ? "replay" : "author", argv: ["testmd", "run"] });
  const stamped: Array<{ t: number; ev: Record<string, unknown> }> = [];
  const t0 = Date.now();
  const onEvent = (ev: Record<string, unknown>) => {
    stamped.push({ t: Date.now(), ev });
    kaneEventHandler(args.jobId, args.replay ? "replay" : "author")(ev);
  };
  const run = async () => {
    const argv = [
      "testmd",
      "run",
      testPath,
      "--agent",
      "--name",
      `demo-${args.jobId.slice(0, 8)}`,
      "--timeout",
      String(args.timeoutSec ?? 180),
      "--max-steps",
      "20",
      ...extraKaneFlags(),
    ];
    if (existsSync(join(dir, "context.md"))) argv.push("--local-context", join(dir, "context.md"));
    if (existsSync(join(dir, "variables.json"))) argv.push("--variables-file", join(dir, "variables.json"));
    return spawnKane(argv, { timeoutMs: 900_000, cwd: dir, onEvent });
  };
  let result;
  let capturePath: string | undefined;
  let framesDir = join(dir, "stills", "live");
  if (args.cdpPort && !cfg.kaneWsEndpoint) {
    const rec = await runWithRecordedChrome({ jobId: args.jobId, port: args.cdpPort, fn: run });
    result = rec.result;
    capturePath = rec.videoPath;
    framesDir = rec.framesDir;
  } else {
    result = await run();
  }
  const tEnd = Date.now();
  const windows = assignBeatWindows(beats, stamped, t0, tEnd);
  writeFileSync(join(dir, "beat-timeline.json"), JSON.stringify({ capturePath, windows, t0, tEnd }, null, 2));

  const stillsRoot = join(dir, "stills");
  mkdirSync(stillsRoot, { recursive: true });
  const index = readLiveIndex(framesDir);
  const harvested = await harvestKaneVisuals(
    args.jobId,
    result.runEnd,
    join(stillsRoot, "_testmd"),
    result.progress,
    true,
  );
  let carry: string | undefined;
  windows.forEach((w) => {
    const dest = join(stillsRoot, `beat-${w.beatIndex}`);
    if (index.length) {
      const files = framesInWindow(index, t0, w.startMs, w.endMs, carry);
      carry = files[files.length - 1];
      copyWindowStills(files, dest);
      return;
    }
    const shots = liveFrames(join(stillsRoot, "_testmd"));
    if (!shots.length) return;
    const i0 = Math.floor((w.beatIndex / Math.max(1, beats.length)) * shots.length);
    const i1 = Math.max(i0, Math.floor(((w.beatIndex + 1) / Math.max(1, beats.length)) * shots.length) - 1);
    const slice = shots.slice(i0, i1 + 1);
    copyWindowStills(slice.length ? slice : [shots[shots.length - 1]], dest);
  });

  const missing: string[] = [];
  const sessionClick = stamped.some((s) => eventHasTool(s.ev, "click"));
  const sessionType = stamped.some((s) => eventHasTool(s.ev, "type"));
  if (beats.some((b) => requiredTools(b.action).includes("click")) && !sessionClick) {
    missing.push("Kane never clicked");
  }
  if (beats.some((b) => requiredTools(b.action).includes("type")) && !sessionType) {
    missing.push("Kane never typed");
  }
  const finalUrl = String(
    (result.runEnd?.final_state as Record<string, string> | undefined)?.url ||
      (result.runEnd?.final_state as Record<string, string> | undefined)?.page_url ||
      "",
  );
  if (beats.some((b) => /create it free/i.test(`${b.action} ${b.targetText ?? ""}`))) {
    const clickedCreate = stamped.some((s) => /create it free/i.test(JSON.stringify(s.ev)));
    if (!clickedCreate && !/\/edit|\/a\//i.test(finalUrl)) {
      missing.push("Create it free: Kane never opened the form builder");
    }
  }

  await emitEvent(args.jobId, "ndjson", {
    phase: "author",
    exitCode: result.exitCode,
    runEnd: result.runEnd,
    stills: harvested.stillCount,
    capturePath,
    windows,
    missing,
    steps: result.progress.map((p) => describeKaneEvent(p as Record<string, unknown>)).filter(Boolean),
  });
  if (result.runEnd) {
    await putObject(
      prefix(args.mode, args.jobId, "kane/run_end.json"),
      JSON.stringify(result.runEnd, null, 2),
      "application/json",
    );
  }
  await publishKaneLog({ jobId: args.jobId, mode: args.mode });
  if (capturePath) {
    await putObject(
      prefix(args.mode, args.jobId, `kane/session${capturePath.toLowerCase().endsWith(".mp4") ? ".mp4" : ".webm"}`),
      readFileSync(capturePath),
      capturePath.toLowerCase().endsWith(".mp4") ? "video/mp4" : "video/webm",
    );
  }
  if (missing.length) {
    throw ApplicationFailure.create({
      message: `Demo can't be recorded: Kane skipped required actions (${missing.join("; ")}).`,
      type: "unsupported_ui",
      nonRetryable: true,
    });
  }
  return { ...result, capturePath, windows };
}

export async function rewriteFailedBeat(args: {
  jobId: string;
  beats: Beat[];
  lastResult: { exitCode: number; runEnd: Record<string, unknown> | null; progress: Array<{ remark?: string; status?: string }> };
}): Promise<{ beats: Beat[]; rewritten: boolean; before?: string; after?: string }> {
  const evidence = await unzipEvidence(args.jobId);
  const failed = args.lastResult.progress.find((p) => p.status === "failed");
  const yamlFile = evidence.files.find((f) => /failure\.ya?ml$/i.test(f));
  let yamlText = "";
  if (yamlFile && existsSync(yamlFile)) yamlText = readFileSync(yamlFile, "utf8");
  const remark =
    failed?.remark ||
    yamlText.match(/remark:\s*[\"']?(.+)/i)?.[1]?.trim() ||
    String(args.lastResult.runEnd?.reason ?? "") ||
    evidence.notes.slice(0, 400) ||
    "failed";
  const rc = Number(args.lastResult.runEnd?.result_code ?? 0);
  let idx = args.beats.findIndex((b) => remark.toLowerCase().includes(b.title.toLowerCase().slice(0, 12)));
  if (idx < 0) {
    const heading = yamlText.match(/title:\s*[\"']?(.+)/i)?.[1]?.trim();
    idx = heading ? args.beats.findIndex((b) => heading.toLowerCase().includes(b.title.toLowerCase().slice(0, 12))) : 0;
  }
  idx = Math.max(0, idx);
  const beat = args.beats[idx];
  if (!beat) return { beats: args.beats, rewritten: false };
  const before = beat.action;
  let extra = " Click the labeled control in the hero or header navigation, not the footer.";
  if (rc === 320) extra = " Use a different navigation path; do not repeat the same click.";
  if (/cookie|consent/i.test(remark + yamlText)) extra = " Dismiss the banner first, then retry the action.";
  if (/not found|no such|missing/i.test(remark + yamlText)) extra = " Use the exact visible label in the header.";
  const after = `${beat.action} Be specific: ${beat.targetText ?? beat.title}.${extra} Wait until the page changes.`;
  const next = args.beats.map((b, i) => (i === idx ? { ...b, action: after } : b));
  await emitEvent(args.jobId, "heal", {
    before,
    after,
    remark,
    result_code: rc,
    beatId: beat.id,
    evidenceFiles: evidence.files.length,
  });
  return { beats: next, rewritten: true, before, after };
}

export async function persistTestMd(jobId: string, mode: "kane" | "naive", markdown: string) {
  const dir = workDir(jobId);
  writeFileSync(join(dir, "demo_test.md"), markdown);
  await putObject(prefix(mode, jobId, "demo_test.md"), markdown, "text/markdown");
}

function beatObjective(beat: Beat, url: string, input: JobInput) {
  const creds = [];
  if (input.credentials?.username) creds.push(`If a username or email field is part of this step, type "${input.credentials.username}".`);
  if (input.credentials?.password) creds.push("If a password field is part of this step, type the provided password.");
  const label = beat.targetText ? ` Use the exact visible control labeled "${beat.targetText}".` : "";
  const check = beat.success.visibleText
    ? ` After the action, confirm text "${beat.success.visibleText}" is visible if it should be.`
    : "";
  return `You are already on ${url}.
${beat.action}.${label}
${creds.join(" ")}
${check}
One action only. Prefer header navigation over the footer. Dismiss a cookie banner first if it is blocking the click.
Do not restart from a different website.`;
}

export async function kaneRecordBeats(args: {
  jobId: string;
  mode: "kane" | "naive";
  input: JobInput;
  beats: Beat[];
}) {
  const dir = workDir(args.jobId);
  const stillsRoot = join(dir, "stills");
  rmSync(stillsRoot, { recursive: true, force: true });
  mkdirSync(stillsRoot, { recursive: true });
  let url = args.input.website_url;
  const results: Array<{ beatId: string; exitCode: number; url: string; stills: number }> = [];

  for (let i = 0; i < args.beats.length; i++) {
    const beat = args.beats[i];
    const dest = join(stillsRoot, `beat-${i}`);
    mkdirSync(dest, { recursive: true });
    const objective = beatObjective(beat, url, args.input);
    const argv = [
      "run",
      objective,
      "--agent",
      "--mode",
      "action",
      "--url",
      url,
      "--timeout",
      "180",
      "--max-steps",
      "16",
      ...extraKaneFlags(),
    ];
    if (existsSync(join(dir, "variables.json"))) {
      argv.push("--variables-file", join(dir, "variables.json"));
    }
    await emitEvent(args.jobId, "kane_cmd", {
      phase: "record",
      beatId: beat.id,
      index: i,
      action: beat.action,
    });
    const result = await spawnKane(argv, {
      timeoutMs: 240_000,
      cwd: dir,
      onEvent: kaneEventHandler(args.jobId, "record", {
        beatId: beat.id,
        action: beat.action,
        index: i,
      }),
    });
    const harvested = await harvestKaneVisuals(args.jobId, result.runEnd, dest, result.progress);
    const nextUrl = String(
      (result.runEnd?.final_state as Record<string, string> | undefined)?.url ||
        (result.runEnd?.final_state as Record<string, string> | undefined)?.page_url ||
        url,
    );
    if (nextUrl.startsWith("http")) url = nextUrl;
    results.push({
      beatId: beat.id,
      exitCode: result.exitCode,
      url,
      stills: harvested.stillCount,
    });
    await emitEvent(args.jobId, "ndjson", {
      phase: "record",
      beatId: beat.id,
      index: i,
      exitCode: result.exitCode,
      stills: harvested.stillCount,
      url,
      steps: result.progress.map((p) => describeKaneEvent(p as Record<string, unknown>)).filter(Boolean),
    });
  }

  await publishKaneLog({ jobId: args.jobId, mode: args.mode });

  const failed = results.filter((r) => r.exitCode === 1).length;
  if (failed === results.length && results.length) {
    throw ApplicationFailure.create({
      message: "Demo can't be recorded: Kane could not complete any planned step.",
      type: "unsupported_ui",
      nonRetryable: true,
    });
  }
  return { results, url };
}

export function readWorkTestMd(jobId: string) {
  return readFileSync(join(workDir(jobId), "demo_test.md"), "utf8");
}

export { workDir } from "./workdir.js";
export { publishKaneLog } from "./kane-log.js";
