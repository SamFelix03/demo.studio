import { writeFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { prefix, putObject, type Beat, type JobInput } from "@demo-studio/shared";
import { emitEvent } from "./control.js";
import { workDir } from "./workdir.js";
import { hostNarration, isControlResidue, requiredTools, tightenBeatGates, typedValueFromAction } from "./beat-gates.js";

type PlanStep = {
  id: number;
  instruction: string;
  narration_draft: string;
  targetText?: string;
  successText?: string;
};

function parseJsonObject(text: string): { steps: PlanStep[] } {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fenced */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return JSON.parse(fence[1].trim());
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("Could not parse plan JSON");
}

function beatsLookHosted(beats: Beat[]): boolean {
  return (
    beats.length >= 2 &&
    beats.every((b) => {
      const nar = (b.narration || "").trim();
      return nar.length >= 40 && /[.!]/.test(nar);
    })
  );
}

function beatsFromNumberedScript(input: JobInput): Beat[] | null {
  const matches = [...input.script.matchAll(/Step\s*(\d+)\s*:\s*([\s\S]*?)(?=Step\s*\d+\s*:|$)/gi)];
  if (matches.length < 2) return null;
  return matches.slice(0, 12).map((m, i) => {
    const instruction = m[2].replace(/\s+/g, " ").trim().replace(/[.,;]+$/, "");
    return skeletonFromAction(instruction, Number(m[1]) ? Number(m[1]) - 1 : i);
  });
}

function skeletonFromAction(instruction: string, i: number): Beat {
  const typed = typedValueFromAction(instruction);
  const click = requiredTools(instruction).includes("click");
  const labeled = instruction.match(/labeled\s+["']?([^"']+)["']?/i)?.[1];
  const target = (
    labeled ||
    instruction.match(/(?:click(?:\s+on)?|choose|type)\s+(.+?)(?:\s+in|\s+under|\s+next|$)/i)?.[1] ||
    instruction.slice(0, 40)
  )
    .replace(/^(the\s+)?button\s+labeled\s+/i, "")
    .trim();
  return {
    id: `beat-${i + 1}`,
    title: instruction.slice(0, 48),
    action: instruction,
    targetText: target.slice(0, 80),
    success: typed ? { visibleText: typed } : { elementState: click ? "changed" : "visible" },
    narration: instruction,
  };
}

function intentsFromInput(input: JobInput): string[] {
  const walk = (input.walkthrough ?? []).map((s) => s.trim()).filter(Boolean);
  if (walk.length) return walk.slice(0, 12);
  const numbered = beatsFromNumberedScript(input);
  if (numbered?.length) return numbered.map((b) => b.action);
  return [];
}

/** Drop model steps that are not mentioned in the user's brief. */
function entailedByBrief(instruction: string, script: string): boolean {
  const words = instruction
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !/^(this|that|with|from|into|your|page|click|type|open)$/.test(w));
  if (words.length < 2) return true;
  const blob = script.toLowerCase();
  const hit = words.filter((w) => blob.includes(w)).length;
  return hit / words.length >= 0.34;
}

function fallbackHostVoice(beats: Beat[]): Beat[] {
  return beats.map((b, i) => ({ ...b, narration: hostNarration(b, beats[i + 1]).slice(0, 180) }));
}

function toBeats(steps: PlanStep[], product?: string): Beat[] {
  return steps.slice(0, 12).map((s, i) => {
    const narration = (s.narration_draft || "").trim() || `${product ?? "This product"} in action.`;
    const instruction = (s.instruction || "").trim() || narration;
    const visible = s.successText || s.targetText || narration.split(" ").slice(0, 4).join(" ");
    return {
      id: `beat-${s.id || i + 1}`,
      title: (s.targetText || instruction).slice(0, 48),
      action: instruction,
      where: "header or hero",
      targetText: s.targetText,
      success: { visibleText: visible },
      narration,
    };
  });
}

function homepageFallback(input: JobInput, site: Record<string, string>): Beat[] {
  const product = input.product_name || "this product";
  const hero = site.hero_heading || site.page_title || product;
  return [
    {
      id: "beat-1",
      title: "Homepage",
      action: "Stay on the start URL and look at the hero headline and primary call to action.",
      targetText: hero.slice(0, 40),
      success: { visibleText: hero.split(" ").slice(0, 3).join(" ") },
      narration: `${product} opens on a clear homepage. ${hero}.`,
    },
  ];
}

type GeminiPart = { text?: string; inline_data?: { mime_type: string; data: string } };

function imagePart(imagePath?: string): GeminiPart | undefined {
  if (!imagePath || !existsSync(imagePath)) return undefined;
  try {
    if (statSync(imagePath).size < 8_000 || statSync(imagePath).size > 4_500_000) return undefined;
  } catch {
    return undefined;
  }
  const buf = readFileSync(imagePath);
  const mime = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return { inline_data: { mime_type: mime, data: buf.toString("base64") } };
}

async function geminiJson(prompt: string, imagePath?: string): Promise<PlanStep[] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const preferred = process.env.GEMINI_TEXT_MODEL || "gemini-2.0-flash";
  const models = [...new Set([preferred, "gemini-2.5-flash", "gemini-2.0-flash"])];
  const parts: GeminiPart[] = [{ text: prompt }];
  const img = imagePart(imagePath);
  if (img) parts.push(img);
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.15 },
      }),
    });
    if (!res.ok) continue;
    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") || "";
    if (!text) continue;
    try {
      const parsed = parseJsonObject(text);
      const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
      const ok = steps.filter((s) => s && (s.instruction || s.narration_draft));
      if (ok.length) return ok;
    } catch {
      continue;
    }
  }
  return null;
}

function mergeLockedGemini(beats: Beat[], steps: PlanStep[]): Beat[] {
  return beats.map((b, i) => {
    const s = steps[i];
    if (!s) return b;
    const narration = (s.narration_draft || b.narration).replace(/\s+/g, " ").trim().slice(0, 180);
    const successText = (s.successText || "").trim();
    const success = { ...b.success };
    if (successText && !isControlResidue(successText, b)) success.visibleText = successText;
    const grounded = (s.targetText || "").trim();
    return {
      ...b,
      action: b.action,
      narration: narration || b.narration,
      targetText: (grounded || b.targetText)?.slice(0, 80),
      success,
    };
  });
}

async function geminiNarrateLocked(
  input: JobInput,
  beats: Beat[],
  site: Record<string, string>,
  screenshotPath?: string,
): Promise<PlanStep[] | null> {
  const locked = beats.map((b, i) => ({
    id: i + 1,
    instruction: b.action,
    targetText: b.targetText,
  }));
  return geminiJson(
    `You ground a product-demo walkthrough onto a live page. A screenshot of the START URL is attached when present.

Target website: ${input.website_url}
Product name: ${input.product_name ?? "the product"}
Accessibility/text inventory (may be incomplete; prefer the screenshot):
${JSON.stringify(site).slice(0, 3500)}

LOCKED walkthrough — copy instruction verbatim. Do not add, remove, or reorder steps. Do not click Sign up, Log in, Pricing, Features, or any control the user did not list.
${JSON.stringify(locked, null, 2)}

For each locked step return targetText, successText, narration_draft.
Rules:
- instruction: EXACT copy of the locked instruction. Never rewrite it.
- targetText: if that control is visible on THIS screenshot, use its exact visible label (resolve fuzzy names). If it only appears after an earlier step, keep the user's wording — do not substitute a different homepage control.
- successText: text on the destination screen AFTER the action. Typed value for type steps. For clicks, a field/heading on the new screen, never the clicked button's label.
- narration_draft: 8–18 words, present tense, demo-host. Describe the screen after the action. Never say click, type, show, or assert.

Return JSON only: { "steps": [ { "id": 1, "instruction": "<verbatim>", "narration_draft": "...", "targetText": "...", "successText": "..." } ] }`,
    screenshotPath,
  );
}

async function geminiPlan(
  input: JobInput,
  site: Record<string, string>,
  screenshotPath?: string,
): Promise<PlanStep[] | null> {
  const prompt = `You plan a narrated product demo from a user brief and a screenshot of the start URL.

Target website: ${input.website_url}
Product name: ${input.product_name ?? "the product"}
Inventory JSON:
${JSON.stringify(site).slice(0, 3500)}

User brief:
"""${input.script}"""
${input.credentials?.username ? "Login credentials ARE available. Include type/fill for username/password only if the brief requires login." : "No login. Do not plan login/signup."}

Rules:
- Every instruction must be something the brief asked for. No extra Features/Pricing/Contact/Sign up tours.
- If the brief lists Step 1, Step 2, … those ARE the only steps, in that order.
- One atomic action per step. Use exact visible labels from the screenshot when they match the brief.
- If a control is not on this screenshot (it appears after a click), keep the brief's label; do not replace it with a homepage control.
- narration_draft: 8–18 words, screen AFTER the action.
- successText: destination text, never the clicked control's label.
- Do not add an "open the URL" step.

Return JSON only: { "steps": [ { "id": 1, "instruction": "...", "narration_draft": "...", "targetText": "...", "successText": "..." } ] }`;
  return geminiJson(prompt, screenshotPath);
}

async function persistPlan(
  args: { jobId: string; mode: "kane" | "naive" },
  source: string,
  beats: Beat[],
  extra?: Record<string, unknown>,
) {
  const dir = workDir(args.jobId);
  const payload = { source, beats, ...extra };
  writeFileSync(join(dir, "plan.json"), JSON.stringify(payload, null, 2));
  await putObject(prefix(args.mode, args.jobId, "plan.json"), JSON.stringify(payload, null, 2), "application/json");
  await emitEvent(args.jobId, "phase", {
    phase: "plan",
    source,
    beatCount: beats.length,
    vision: Boolean(extra?.vision),
    narrations: beats.map((b) => b.narration),
    actions: beats.map((b) => b.action),
  });
}

async function enrichLockedWalk(args: {
  jobId: string;
  mode: "kane" | "naive";
  input: JobInput;
  site: Record<string, string>;
  skeleton: Beat[];
  source: "script" | "provided";
  screenshotPath?: string;
}): Promise<Beat[]> {
  let beats = tightenBeatGates(args.skeleton);
  try {
    const steps = await geminiNarrateLocked(args.input, beats, args.site, args.screenshotPath);
    if (steps && steps.length >= 1) beats = tightenBeatGates(mergeLockedGemini(beats, steps));
    else beats = tightenBeatGates(fallbackHostVoice(beats));
  } catch {
    beats = tightenBeatGates(fallbackHostVoice(beats));
  }
  beats = beats.map((b, i) => ({ ...b, action: args.skeleton[i]?.action ?? b.action }));
  await persistPlan(args, args.source, beats, { vision: Boolean(args.screenshotPath) });
  return beats;
}

export async function planDemoBeats(args: {
  jobId: string;
  mode: "kane" | "naive";
  input: JobInput;
  site?: Record<string, string>;
  screenshotPath?: string;
}): Promise<{ beats: Beat[]; source: "provided" | "gemini" | "heuristic" | "script" }> {
  const site = args.site ?? {};
  const shot = args.screenshotPath;
  if (args.input.beats?.length && beatsLookHosted(args.input.beats)) {
    const beats = tightenBeatGates(args.input.beats);
    await persistPlan(args, "provided", beats);
    return { beats, source: "provided" };
  }
  const intents = intentsFromInput(args.input);
  if (args.input.beats?.length || intents.length) {
    const skeleton = args.input.beats?.length
      ? args.input.beats
      : intents.map((a, i) => skeletonFromAction(a, i));
    const beats = await enrichLockedWalk({
      ...args,
      site,
      screenshotPath: shot,
      skeleton,
      source: args.input.beats?.length ? "provided" : "script",
    });
    return { beats, source: args.input.beats?.length ? "provided" : "script" };
  }
  let source: "gemini" | "heuristic" = "heuristic";
  let beats: Beat[];
  try {
    const steps = await geminiPlan(args.input, site, shot);
    const kept = (steps ?? []).filter((s) => entailedByBrief(s.instruction || "", args.input.script));
    if (kept.length >= 2) {
      beats = toBeats(kept, args.input.product_name);
      source = "gemini";
    } else {
      beats = homepageFallback(args.input, site);
    }
  } catch {
    beats = homepageFallback(args.input, site);
  }
  beats = tightenBeatGates(beats);
  await persistPlan(args, source, beats, { vision: Boolean(shot) });
  return { beats, source };
}
