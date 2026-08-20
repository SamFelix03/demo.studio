import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import {
  evaluateSuccess,
  prefix,
  putObject,
  type Beat,
  type JobInput,
} from "@demo-studio/shared";
import { emitEvent } from "./control.js";
import { workDir } from "./workdir.js";


export async function naiveRecord(args: {
  jobId: string;
  input: JobInput;
  beats: Beat[];
}) {
  const dir = workDir(args.jobId);
  mkdirSync(join(dir, "naive"), { recursive: true });
  const videoDir = join(dir, "naive", "video");
  mkdirSync(videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: args.input.headless !== false });
  const [w, h] = (args.input.viewport ?? "1440x900").split("x").map(Number);
  const context = await browser.newContext({
    viewport: { width: w, height: h },
    recordVideo: { dir: videoDir, size: { width: w, height: h } },
  });
  const page = await context.newPage();
  const log: Array<Record<string, unknown>> = [];
  const timeline: Array<{ beatId: string; startMs: number; endMs: number; passed: boolean }> = [];
  const t0 = Date.now();

    await page.goto(args.input.website_url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  try {
    await page.getByText(/accept|agree|got it|allow all/i).first().click({ timeout: 2500 });
  } catch {
    /* optional */
  }

  const stillsRoot = join(dir, "stills");
  mkdirSync(stillsRoot, { recursive: true });

  for (let i = 0; i < args.beats.length; i++) {
    const beat = args.beats[i];
    const dest = join(stillsRoot, `beat-${i}`);
    mkdirSync(dest, { recursive: true });
    const startMs = Date.now() - t0;
    const name = beat.targetText || beat.action.split(" ").slice(0, 4).join(" ");
    let clicked = "not found";
    try {
      if (/type|fill|enter|email|password|username/i.test(beat.action + (beat.targetText ?? ""))) {
        const value = /pass/i.test(beat.action)
          ? args.input.credentials?.password || "demo-password"
          : args.input.credentials?.username || "demo@example.com";
        const box = page.getByLabel(new RegExp(name, "i")).or(page.getByPlaceholder(new RegExp(name, "i"))).or(page.getByRole("textbox"));
        await box.first().fill(value, { timeout: 5000 });
        clicked = `typed into ${name}`;
      } else {
        const loc = page.getByRole("button", { name: new RegExp(name, "i") }).or(
          page.getByRole("link", { name: new RegExp(name, "i") }),
        ).or(page.getByText(new RegExp(name, "i")));
        await loc.first().click({ timeout: 5000 });
        clicked = name;
      }
    } catch {
      clicked = "not found";
    }
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: join(dest, "000.jpg"), type: "jpeg", quality: 80 });
    const gate = evaluateSuccess(
      {
        url: page.url(),
        title: await page.title(),
        text: (await page.locator("body").innerText().catch(() => "")) ?? "",
      },
      beat.success,
    );
    const endMs = Date.now() - t0;
    timeline.push({ beatId: beat.id, startMs, endMs, passed: gate.passed });
    log.push({ beatId: beat.id, clicked, gate });
    await emitEvent(args.jobId, "naive_step", { beatId: beat.id, clicked, gate });
  }

  const video = page.video();
  await context.close();
  await browser.close();
  const videoPath = video ? await video.path() : "";
  writeFileSync(join(dir, "naive-log.json"), JSON.stringify({ log, timeline }, null, 2));
  await putObject(
    prefix("naive", args.jobId, "naive-log.json"),
    JSON.stringify({ log, timeline }, null, 2),
    "application/json",
  );
  return { videoPath, log, timeline, gatesPassed: log.filter((l) => (l.gate as { passed?: boolean }).passed).length };
}
