import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { prefix, putObject, type Beat, type JobInput } from "@demo-studio/shared";
import { emitEvent } from "./control.js";
import { workDir } from "./workdir.js";
import { tightenBeatGates } from "./beat-gates.js";

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

function beatsFromNumberedScript(input: JobInput): Beat[] | null {
  const matches = [...input.script.matchAll(/Step\s*(\d+)\s*:\s*([\s\S]*?)(?=Step\s*\d+\s*:|$)/gi)];
  if (matches.length < 2) return null;
  return matches.slice(0, 12).map((m, i) => {
    const instruction = m[2].replace(/\s+/g, " ").trim().replace(/[.,;]+$/, "");
    const target =
      instruction.match(/labeled ["']([^"']+)["']/i)?.[1] ||
      instruction.match(/(?:click(?:\s+on)?|choose|type)\s+(.+?)(?:\s+in|\s+under|\s+next|$)/i)?.[1] ||
      instruction.slice(0, 40);
    const narration = instruction
      .replace(/^(click on|click|type|choose|hit|select)\s+/i, "")
      .replace(/\s+in the .+? text box/i, "")
      .trim();
    return {
      id: `beat-${m[1] || i + 1}`,
      title: instruction.slice(0, 48),
      action: instruction,
      targetText: target.slice(0, 80),
      success: { visibleText: target.split(" ").slice(0, 4).join(" ") },
      narration: narration.slice(0, 180) || instruction,
    };
  });
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

function siteLabels(value: string | undefined): string[] {
  if (!value) return [];
  const t = value.trim();
  if (t.startsWith("[")) {
    try {
      const parsed = JSON.parse(t) as unknown;
      if (Array.isArray(parsed)) return parsed.map((x) => String(x).replace(/^["'\[]+|["'\]]+$/g, "").trim()).filter(Boolean);
    } catch {
      /* fall through */
    }
  }
  return t
    .split(/[,|]/)
    .map((s) => s.replace(/[\[\]"]/g, "").trim())
    .filter(Boolean);
}

function heuristicPlan(input: JobInput, site: Record<string, string>): Beat[] {
  const product = input.product_name || "this product";
  const hero = site.hero_heading || site.page_title || product;
  const cta = site.hero_cta || "Learn more";
  const nav = siteLabels(site.nav_items || "Features, Pricing").slice(0, 6);
  const wants = input.script.toLowerCase();
  const beats: Beat[] = [
    {
      id: "beat-1",
      title: "Homepage",
      action: "Stay on the start URL and look at the hero headline and primary call to action.",
      targetText: hero.slice(0, 40),
      success: { visibleText: hero.split(" ").slice(0, 3).join(" ") },
      narration: `${product} opens on a clear homepage. ${hero}.`,
    },
  ];
  const featureNav = nav.find((n) => /feature/i.test(n));
  if (featureNav && /feature/i.test(wants)) {
    beats.push({
      id: "beat-2",
      title: "Features",
      action: `Click the ${featureNav} link in the header navigation.`,
      targetText: featureNav,
      success: { visibleText: featureNav },
      narration: `Features is where ${product} shows what the product actually does.`,
    });
  }
  const pricingNav = nav.find((n) => /pric|plan/i.test(n));
  if (pricingNav && /pric|plan|business/i.test(wants)) {
    beats.push({
      id: `beat-${beats.length + 1}`,
      title: "Pricing",
      action: `Click the ${pricingNav} link in the header navigation.`,
      targetText: pricingNav,
      success: { visibleText: pricingNav },
      narration: `Pricing puts the plans on the table so you can pick a starting point.`,
    });
  }
  const contactNav = nav.find((n) => /contact/i.test(n)) || (wants.includes("contact") ? "Contact" : "");
  if (contactNav) {
    beats.push({
      id: `beat-${beats.length + 1}`,
      title: "Contact",
      action: `Click the ${contactNav} link in the header navigation.`,
      targetText: contactNav,
      success: { visibleText: "Book a walkthrough" },
      narration: `Contact is where you leave details so the team can follow up.`,
    });
  }
  if (/email|textbox|fill|type|form|company/i.test(wants) && (contactNav || site.inputs)) {
    beats.push({
      id: `beat-${beats.length + 1}`,
      title: "Work email",
      action: 'Type an email into the field labeled "Work email".',
      targetText: "Work email",
      success: { visibleText: "Work email" },
      narration: "Work email is the field that identifies who is asking for a walkthrough.",
    });
    if (/company/i.test(wants)) {
      beats.push({
        id: `beat-${beats.length + 1}`,
        title: "Company name",
        action: 'Type a company into the field labeled "Company name".',
        targetText: "Company name",
        success: { visibleText: "Company name" },
        narration: "Company name sits under the email so the walkthrough is booked for the right team.",
      });
    }
  }
  if (/business/i.test(wants)) {
    beats.push({
      id: `beat-${beats.length + 1}`,
      title: "Business plan",
      action: 'Find the plan or card labeled "Business" and scroll it into view.',
      targetText: "Business",
      success: { visibleText: "Business" },
      narration: "The Business plan is the one built for teams that need room to grow.",
    });
  }
  if (cta && beats.length < 3) {
    beats.push({
      id: `beat-${beats.length + 1}`,
      title: "Primary CTA",
      action: `Click the primary call to action labeled "${cta}".`,
      targetText: cta,
      success: { visibleText: cta },
      narration: `From here, ${cta} is the next step if you want to try ${product}.`,
    });
  }
  return beats.slice(0, 8);
}

async function geminiPlan(input: JobInput, site: Record<string, string>): Promise<PlanStep[] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const preferred = process.env.GEMINI_TEXT_MODEL || "gemini-2.0-flash";
  const models = [...new Set([preferred, "gemini-2.0-flash", "gemini-2.5-flash"])];
  const prompt = `You are planning a narrated product demo video (same role as FounderBlaze APD planning).

Target website: ${input.website_url}
Product name: ${input.product_name ?? "the product"}
What we already observed on the live page (JSON):
${JSON.stringify(site).slice(0, 4000)}

User brief (INTENT only — never read it aloud):
"""${input.script}"""
${input.credentials?.username ? "Login credentials ARE available. Include type/fill steps for username and password when a form is required." : "No login credentials. Do not plan login/signup unless the page is already authenticated."}

Break this into 4–10 ATOMIC browser steps, in the order a customer would actually walk the product.

Rules:
- instruction: exactly one action (click one labeled control, type into one field, scroll once, or observe the current view). Never combine clicks.
- If the brief lists Step 1, Step 2, … follow those steps in that exact order. One instruction per listed step. Do not skip type, dropdown, checkbox, or save steps.
- Only add a homepage-observe first step when the brief is a tour, not when it already starts with a type/click instruction.
- Click and type using EXACT labels from the inventory above when they match the brief. If the brief names a control that is not in the homepage inventory (it appears after a click), still use the brief's label.
- If the brief mentions a form, textbox, email, or filling a field, include a type/fill step using the exact field label from the inventory or the page you just opened.
- narration_draft: spoken voiceover for THAT screen after the action. 8–18 words, present tense, demo-host voice. Never "click", "show", "assert", "store". The picture for this line is the page AFTER the action, so describe what is now on screen.
- targetText: the exact visible label for clicks/fields.
- successText: text that should be on screen after the step.
- Do not add an "open the URL" step.

Return JSON only: { "steps": [ { "id": 1, "instruction": "...", "narration_draft": "...", "targetText": "...", "successText": "..." } ] }`;

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
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

export async function planDemoBeats(args: {
  jobId: string;
  mode: "kane" | "naive";
  input: JobInput;
  site?: Record<string, string>;
}): Promise<{ beats: Beat[]; source: "provided" | "gemini" | "heuristic" }> {
  if (args.input.beats?.length) {
    await emitEvent(args.jobId, "phase", {
      phase: "plan",
      source: "provided",
      beatCount: args.input.beats.length,
      narrations: args.input.beats.map((b) => b.narration),
      actions: args.input.beats.map((b) => b.action),
    });
    return { beats: tightenBeatGates(args.input.beats), source: "provided" };
  }
  const numbered = beatsFromNumberedScript(args.input);
  if (numbered) {
    const dir = workDir(args.jobId);
    writeFileSync(join(dir, "plan.json"), JSON.stringify({ source: "script", beats: numbered }, null, 2));
    await putObject(
      prefix(args.mode, args.jobId, "plan.json"),
      JSON.stringify({ source: "script", beats: numbered }, null, 2),
      "application/json",
    );
    await emitEvent(args.jobId, "phase", {
      phase: "plan",
      source: "script",
      beatCount: numbered.length,
      narrations: numbered.map((b) => b.narration),
      actions: numbered.map((b) => b.action),
    });
    return { beats: tightenBeatGates(numbered), source: "provided" };
  }
  const site = args.site ?? {};
  let source: "gemini" | "heuristic" = "heuristic";
  let beats: Beat[];
  try {
    const steps = await geminiPlan(args.input, site);
    if (steps && steps.length >= 2) {
      beats = toBeats(steps, args.input.product_name);
      source = "gemini";
    } else {
      beats = heuristicPlan(args.input, site);
    }
  } catch {
    beats = heuristicPlan(args.input, site);
  }
  const dir = workDir(args.jobId);
  writeFileSync(join(dir, "plan.json"), JSON.stringify({ source, beats }, null, 2));
  await putObject(
    prefix(args.mode, args.jobId, "plan.json"),
    JSON.stringify({ source, beats }, null, 2),
    "application/json",
  );
  await emitEvent(args.jobId, "phase", {
    phase: "plan",
    source,
    beatCount: beats.length,
    narrations: beats.map((b) => b.narration),
  });
  return { beats: tightenBeatGates(beats), source };
}
