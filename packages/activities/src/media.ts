import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import {
  loadConfig,
  prefix,
  putObject,
  updateJob,
  getPool,
  getJob,
  type Artifact,
  type Beat,
} from "@demo-studio/shared";
import { workDir } from "./workdir.js";
import { emitEvent } from "./control.js";
import { ApplicationFailure } from "@temporalio/activity";

const execFileAsync = promisify(execFile);
const cfg = loadConfig();

const WIDTH = 1440;
const HEIGHT = 900;
const FPS = 30;
const AR = 48000;

function findStills(dir: string): string[] {
  const acc: string[] = [];
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, name.name);
      if (name.isDirectory()) {
        if (name.name === "live" || name.name === "_raw" || name.name === "_testmd") continue;
        walk(p);
        continue;
      }
      if (/annotated/i.test(name.name)) continue;
      if (!/\.(jpg|jpeg|png)$/i.test(name.name)) continue;
      if (statSync(p).size < 16_000) continue;
      acc.push(p);
    }
  };
  walk(dir);
  return acc.sort();
}

async function ff(cmd: string, args: string[], opts?: { cwd?: string }) {
  return execFileAsync(cmd, args, { cwd: opts?.cwd, timeout: 180_000 });
}

async function probeDuration(path: string): Promise<number> {
  const { stdout } = await ff("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    path,
  ]).catch(() => ({ stdout: "0" }));
  return Number(stdout.trim()) || 0;
}

const SCALE = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS},format=yuv420p`;

type LiveRec = { t: number; file: string; url?: string };

function readLiveIndex(dir: string): LiveRec[] {
  const p = join(dir, "stills", "live", "index.jsonl");
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

async function pictureFromTimedJpegs(files: string[], stepSec: number[], seconds: number, outMp4: string) {
  if (!files.length) return false;
  const picked: { file: string; dur: number }[] = [];
  let acc = 0;
  for (let i = files.length - 1; i >= 0 && acc < seconds; i--) {
    const raw = i === files.length - 1 ? Math.max(1.5, stepSec[i] ?? 0.25) : Math.max(0.04, stepSec[i] ?? 0.25);
    const dur = Math.min(raw, seconds - acc);
    picked.unshift({ file: files[i], dur });
    acc += dur;
  }
  const d = seconds.toFixed(3);
  const list = outMp4.replace(/\.mp4$/, ".txt");
  const lines: string[] = [];
  let used = 0;
  for (let i = 0; i < picked.length; i++) {
    const escaped = picked[i].file.replace(/'/g, `'\\''`);
    const dur = i === picked.length - 1 ? Math.max(0.04, seconds - used) : picked[i].dur;
    lines.push(`file '${escaped}'`);
    lines.push(`duration ${dur.toFixed(3)}`);
    used += dur;
  }
  const last = picked[picked.length - 1].file.replace(/'/g, `'\\''`);
  lines.push(`file '${last}'`);
  writeFileSync(list, `${lines.join("\n")}\n`);
  await ff("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-vf",
    SCALE,
    "-t",
    d,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    outMp4,
  ]);
  return existsSync(outMp4) && statSync(outMp4).size > 1000;
}

function liveFilesForWindow(
  live: LiveRec[],
  t0: number,
  win: { startMs: number; endMs: number } | undefined,
  audioDur: number,
  carry?: string,
): { files: string[]; steps: number[]; lastUrl?: string } {
  if (!live.length) return { files: carry ? [carry] : [], steps: [] };
  const a = t0 + (win?.startMs ?? 0);
  const b = t0 + (win?.endMs ?? live[live.length - 1].t - t0 + 1);
  let inWin = live.filter((f) => f.t >= a && f.t <= b);
  if (!inWin.length) {
    const before = live.filter((f) => f.t <= b);
    if (before.length) inWin = [before[before.length - 1]];
    else if (carry) return { files: [carry], steps: [Math.max(1.5, audioDur)] };
    else inWin = [live[0]];
  }
  const tailStart = b - Math.max(audioDur, 1.5) * 1000;
  const tail = inWin.filter((f) => f.t >= tailStart);
  const use = tail.length ? tail : inWin.slice(-8);
  const files = use.map((f) => f.file);
  const steps = use.map((f, i) =>
    i + 1 < use.length ? Math.max(0.04, (use[i + 1].t - f.t) / 1000) : Math.max(1.5, audioDur),
  );
  return { files, steps, lastUrl: use[use.length - 1]?.url };
}

async function sliceScreen(src: string, startSec: number, seconds: number, outMp4: string) {
  const d = seconds.toFixed(3);
  await ff("ffmpeg", [
    "-y",
    "-ss",
    Math.max(0, startSec).toFixed(3),
    "-i",
    src,
    "-vf",
    `${SCALE},tpad=stop_mode=clone:stop_duration=${(seconds + 3).toFixed(3)},trim=duration=${d},setpts=PTS-STARTPTS`,
    "-an",
    "-t",
    d,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    outMp4,
  ]);
}

function findSessionVideo(dir: string): string | undefined {
  const acc: string[] = [];
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, name.name);
      if (name.isDirectory()) {
        if (name.name === "clips" || name.name === "out" || name.name === "audio") continue;
        walk(p);
        continue;
      }
      if (/\.(webm|mp4)$/i.test(name.name) && statSync(p).size > 40_000) acc.push(p);
    }
  };
  walk(join(dir, "pw-video"));
  walk(join(dir, "stills"));
  return acc.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}
async function pictureForDuration(pngs: string[], seconds: number, outMp4: string) {
  if (!pngs.length) return false;
  const shot = pngs[pngs.length - 1];
  const escaped = shot.replace(/'/g, `'\\''`);
  const list = outMp4.replace(/\.mp4$/, ".txt");
  const d = seconds.toFixed(3);
  writeFileSync(list, `file '${escaped}'\nduration ${d}\nfile '${escaped}'\n`);
  await ff("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-vf",
    SCALE,
    "-t",
    d,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    outMp4,
  ]);
  return true;
}

/**
 * One beat = one sealed MP4. Video is padded/trimmed to the WAV length.
 * Audio is atrimmed/apadded to the same length. No -shortest (that cuts speech).
 */
async function sealBeat(silentVideo: string, wav: string, seconds: number, outMp4: string) {
  const d = seconds.toFixed(3);
  await ff("ffmpeg", [
    "-y",
    "-i",
    silentVideo,
    "-i",
    wav,
    "-filter_complex",
    [
      `[0:v]${SCALE},tpad=stop_mode=clone:stop_duration=${(seconds + 3).toFixed(3)},trim=duration=${d},setpts=PTS-STARTPTS[v]`,
      `[1:a]aformat=sample_rates=${AR}:channel_layouts=mono,apad=pad_dur=2,atrim=0:${d},asetpts=PTS-STARTPTS[a]`,
    ].join(";"),
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ar",
    String(AR),
    "-ac",
    "1",
    "-t",
    d,
    "-movflags",
    "+faststart",
    outMp4,
  ]);
}

async function lmntSpeech(apiKey: string, voice: string, text: string, wavPath: string): Promise<boolean> {
  try {
    const headers = {
      "X-API-Key": apiKey.trim(),
      "lmnt-version": "1.2",
      "Content-Type": "application/json",
    };
    const body = JSON.stringify({ text: text.slice(0, 5000), voice, format: "mp3" });
    // Binary endpoint — /v1/ai/speech returns JSON+base64, not raw audio.
    let res = await fetch("https://api.lmnt.com/v1/ai/speech/bytes", {
      method: "POST",
      headers,
      body,
    });
    let buf: Buffer;
    if (res.ok) {
      buf = Buffer.from(await res.arrayBuffer());
    } else {
      res = await fetch("https://api.lmnt.com/v1/ai/speech", { method: "POST", headers, body });
      if (!res.ok) {
        console.error("lmnt speech failed", res.status, (await res.text()).slice(0, 400));
        return false;
      }
      const json = (await res.json()) as { audio?: string };
      if (!json.audio) return false;
      buf = Buffer.from(json.audio, "base64");
    }
    if (buf.length > 0 && buf[0] === 0x7b) {
      const json = JSON.parse(buf.toString("utf8")) as { audio?: string };
      if (!json.audio) return false;
      buf = Buffer.from(json.audio, "base64");
    }
    const mp3 = wavPath.replace(/\.wav$/, ".mp3");
    writeFileSync(mp3, buf);
    await execFileAsync("ffmpeg", ["-y", "-i", mp3, "-ar", String(AR), "-ac", "1", wavPath], {
      timeout: 30_000,
    });
    return true;
  } catch (err) {
    console.error("lmnt speech error", err);
    return false;
  }
}

/** Neural TTS via Microsoft Edge (much better than espeak on Linux). */
async function edgeTtsSpeech(text: string, wavPath: string): Promise<boolean> {
  const mp3 = wavPath.replace(/\.wav$/, ".edge.mp3");
  const voice = process.env.EDGE_TTS_VOICE || "en-US-JennyNeural";
  try {
    await execFileAsync(
      "edge-tts",
      ["--voice", voice, "--text", text, "--write-media", mp3],
      { timeout: 90_000 },
    );
    await execFileAsync("ffmpeg", ["-y", "-i", mp3, "-ar", String(AR), "-ac", "1", wavPath], {
      timeout: 30_000,
    });
    return true;
  } catch (err) {
    console.error("edge-tts failed", err);
    return false;
  }
}

export async function synthesizeBeats(args: {
  jobId: string;
  mode: "kane" | "naive";
  beats: Beat[];
  engine?: string;
}): Promise<{ seconds: number[]; wavs: string[] }> {
  const dir = join(workDir(args.jobId), "audio");
  mkdirSync(dir, { recursive: true });
  const seconds: number[] = [];
  const wavs: string[] = [];
  const engines: string[] = [];
  for (let i = 0; i < args.beats.length; i++) {
    const raw = join(dir, `beat-${i}-raw.wav`);
    const wav = join(dir, `beat-${i}.wav`);
    const text = args.beats[i].narration;
    try {
      const lmntOk = cfg.lmntApiKey
        ? await lmntSpeech(cfg.lmntApiKey, process.env.LMNT_VOICE || cfg.lmntVoice, text, raw)
        : false;
      let engine = lmntOk ? "lmnt" : "";
      if (!lmntOk) {
        if (await edgeTtsSpeech(text, raw)) {
          engine = "edge-tts";
        } else if (process.platform === "darwin") {
          await ff("say", ["-o", raw, "--data-format=LEF32@22050", text]);
          engine = "say";
        } else {
          writeFileSync(raw.replace(/\.wav$/, ".txt"), text);
          const spoken = await ff("espeak-ng", ["-w", raw, text])
            .catch(() => ff("espeak", ["-w", raw, text]))
            .catch(() => null);
          if (spoken) {
            engine = "espeak";
          } else {
            await ff("ffmpeg", [
              "-f",
              "lavfi",
              "-i",
              `anullsrc=r=${AR}:cl=mono`,
              "-t",
              "3",
              "-y",
              raw,
            ]);
            engine = "silence";
          }
        }
      }
      engines.push(engine);
      await ff("ffmpeg", [
        "-y",
        "-i",
        raw,
        "-ar",
        String(AR),
        "-ac",
        "1",
        wav,
      ]);
      const dur = await probeDuration(wav);
      seconds.push(dur > 0 ? dur : 3);
      wavs.push(wav);
      await putObject(
        prefix(args.mode, args.jobId, `audio/beat-${i}.wav`),
        await import("node:fs/promises").then((fs) => fs.readFile(wav)),
        "audio/wav",
      );
    } catch {
      seconds.push(3);
      wavs.push(wav);
      engines.push("error");
    }
  }
  await emitEvent(args.jobId, "phase", { phase: "tts", seconds, engines });
  return { seconds, wavs };
}

export async function assembleDemo(args: {
  jobId: string;
  mode: "kane" | "naive";
  beats: Beat[];
  seconds: number[];
  videoPath?: string;
  productName?: string;
  websiteUrl: string;
}): Promise<{ objectKey: string; captionsKey: string; timelineKey: string }> {
  const dir = workDir(args.jobId);
  const outDir = join(dir, "out");
  mkdirSync(outDir, { recursive: true });
  const audioDir = join(dir, "audio");
  const clipsDir = join(dir, "clips");
  mkdirSync(clipsDir, { recursive: true });

  const durations: number[] = [];
  for (let i = 0; i < args.beats.length; i++) {
    const wav = join(audioDir, `beat-${i}.wav`);
    const probed = existsSync(wav) ? await probeDuration(wav) : 0;
    durations.push(probed || args.seconds[i] || 3);
  }

  const srtLines: string[] = [];
  let t = 0;
  const timeline = args.beats.map((b, i) => {
    const d = durations[i];
    const start = t;
    t += d;
    const fmt = (s: number) => {
      const ms = Math.floor((s % 1) * 1000);
      const sec = Math.floor(s) % 60;
      const min = Math.floor(s / 60);
      const pad = (n: number, w = 2) => String(n).padStart(w, "0");
      return `00:${pad(min)}:${pad(sec)},${String(ms).padStart(3, "0")}`;
    };
    srtLines.push(`${i + 1}\n${fmt(start)} --> ${fmt(start + d)}\n${b.narration}\n`);
    return { beatId: b.id, videoStartMs: start * 1000, videoEndMs: (start + d) * 1000, audioDurationMs: d * 1000 };
  });
  writeFileSync(join(outDir, "captions.srt"), srtLines.join("\n"));
  writeFileSync(join(dir, "timeline.json"), JSON.stringify({ timeline, durations }, null, 2));

  const outMp4 = join(outDir, "demo.mp4");

  try {
    const missingWav = args.beats.some((_, i) => !existsSync(join(audioDir, `beat-${i}.wav`)));
    if (missingWav) {
      throw ApplicationFailure.create({
        message: "No narration audio was generated.",
        type: "capture_failed",
        nonRetryable: true,
      });
    }
    let windows: Array<{ beatIndex: number; startMs: number; endMs: number }> = [];
    let captureT0 = 0;
    const tlPath = join(dir, "beat-timeline.json");
    if (existsSync(tlPath)) {
      try {
        const parsed = JSON.parse(readFileSync(tlPath, "utf8")) as {
          windows?: typeof windows;
          t0?: number;
        };
        if (Array.isArray(parsed.windows)) windows = parsed.windows;
        if (typeof parsed.t0 === "number") captureT0 = parsed.t0;
      } catch {
        /* ignore */
      }
    }
    const live = readLiveIndex(dir);
    const screen =
      live.length > 0
        ? undefined
        : (args.videoPath && existsSync(args.videoPath) ? args.videoPath : undefined) || findSessionVideo(dir);
    const screenOk = screen ? (await probeDuration(screen)) > 0.4 : false;

    if (
      !live.length &&
      !screenOk &&
      !args.beats.every((_, i) => findStills(join(dir, "stills", `beat-${i}`)).length > 0)
    ) {
      throw ApplicationFailure.create({
        message: "No browser video or screenshots were captured, so a demo video cannot be built.",
        type: "capture_failed",
        nonRetryable: true,
      });
    }

    const clipFiles: string[] = [];
    let carry: string | undefined;

    for (let i = 0; i < args.beats.length; i++) {
      const audioDur = durations[i];
      const wav = join(audioDir, `beat-${i}.wav`);
      const silent = join(clipsDir, `v-${i}.mp4`);
      const muxed = join(clipsDir, `m-${i}.mp4`);
      let made = false;
      const win = windows.find((w) => w.beatIndex === i) ?? windows[i];
      if (live.length) {
        const picked = liveFilesForWindow(live, captureT0, win, audioDur, carry);
        carry = picked.files[picked.files.length - 1];
        try {
          made = await pictureFromTimedJpegs(picked.files, picked.steps, audioDur, silent);
        } catch {
          made = false;
        }
      }
      if (!made && screenOk && screen) {
        const startSec = win ? win.startMs / 1000 : 0;
        try {
          await sliceScreen(screen, startSec, audioDur, silent);
          made = existsSync(silent) && statSync(silent).size > 1000;
        } catch {
          made = false;
        }
      }
      if (!made) {
        const beatShots = findStills(join(dir, "stills", `beat-${i}`));
        made = await pictureForDuration(beatShots, audioDur, silent);
      }
      if (!made) {
        throw ApplicationFailure.create({
          message: `No video or screenshots for beat ${i + 1}. Kane did not capture that step.`,
          type: "capture_failed",
          nonRetryable: true,
        });
      }

      await sealBeat(silent, wav, audioDur, muxed);
      clipFiles.push(muxed);
    }

    const list = join(dir, "cliplist.txt");
    writeFileSync(list, clipFiles.map((f) => `file '${f.replace(/'/g, `'\\''`)}'`).join("\n"));
    await ff("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      list,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-ar",
      String(AR),
      "-ac",
      "1",
      "-movflags",
      "+faststart",
      outMp4,
    ]);
  } catch (err) {
    writeFileSync(join(outDir, "assemble-error.txt"), String(err));
    throw err;
  }

  const fs = await import("node:fs/promises");
  const mp4 = await fs.readFile(outMp4);
  const srt = await fs.readFile(join(outDir, "captions.srt"));
  const tl = await fs.readFile(join(dir, "timeline.json"));
  const objectKey = prefix(args.mode, args.jobId, "out/demo.mp4");
  const captionsKey = prefix(args.mode, args.jobId, "out/captions.srt");
  const timelineKey = prefix(args.mode, args.jobId, "timeline.json");
  await putObject(objectKey, mp4, "video/mp4");
  await putObject(captionsKey, srt, "text/plain");
  await putObject(timelineKey, tl, "application/json");

  const db = getPool(cfg.databaseUrl);
  const prior = ((await getJob(db, args.jobId))?.artifacts ?? []).filter(
    (a) => a.type === "kane-log" || a.type === "kane-jsonl",
  );
  const artifacts: Artifact[] = [
    ...prior,
    { type: "video", object_key: objectKey, mime_type: "video/mp4" },
    { type: "captions", object_key: captionsKey, mime_type: "text/plain" },
    { type: "timeline", object_key: timelineKey, mime_type: "application/json" },
  ];
  await updateJob(getPool(cfg.databaseUrl), args.jobId, {
    status: "completed",
    step: "upload",
    artifacts,
    error: null,
  });
  await emitEvent(args.jobId, "phase", { phase: "completed", objectKey });
  return { objectKey, captionsKey, timelineKey };
}
