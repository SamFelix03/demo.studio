import { proxyActivities, ApplicationFailure, defineSignal, setHandler, condition } from "@temporalio/workflow";
import type * as activities from "../../activities/src/index";
import type { Beat, JobInput } from "../../shared/src/types";
import { TASK_QUEUES } from "./queues";

const control = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  heartbeatTimeout: "2 minutes",
  retry: { maximumAttempts: 3 },
  taskQueue: TASK_QUEUES.control,
});

const kaneA = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minutes",
  heartbeatTimeout: "2 minutes",
  retry: { maximumAttempts: 2 },
  taskQueue: TASK_QUEUES.kane,
});

const media = proxyActivities<typeof activities>({
  startToCloseTimeout: "15 minutes",
  heartbeatTimeout: "30 seconds",
  retry: { maximumAttempts: 2 },
  taskQueue: TASK_QUEUES.media,
});

export const confirmScriptSignal = defineSignal<[Beat[]]>("confirmScript");

const ABORT_TYPES = new Set([
  "captcha",
  "paywall",
  "cloudflare_challenge",
  "mfa",
  "login_required",
  "unreachable",
  "unsupported_ui",
  "script_unconfirmed",
]);

function failureInfo(err: unknown): { message: string; type: string } {
  let cur: unknown = err;
  for (let i = 0; i < 8 && cur; i++) {
    if (cur instanceof ApplicationFailure) {
      return { message: cur.message, type: cur.type || "failed" };
    }
    if (typeof cur === "object" && cur) {
      const rec = cur as { type?: string; message?: string; failure?: { message?: string }; cause?: unknown };
      if (typeof rec.type === "string" && rec.type && rec.type !== "ActivityFailure" && rec.message) {
        return { message: rec.message, type: rec.type };
      }
      cur = rec.cause ?? rec.failure;
      continue;
    }
    break;
  }
  return { message: String(err), type: "failed" };
}

async function persistFailure(jobId: string, err: unknown) {
  try {
    await control.publishKaneLog({ jobId, mode: "kane" });
  } catch {
    /* log is best-effort */
  }
  const { message, type } = failureInfo(err);
  const aborted = ABORT_TYPES.has(type);
  await control.markJobTerminal({
    jobId,
    status: aborted ? "aborted" : "failed",
    error: message,
    error_code: type,
    abort_code: aborted ? type : undefined,
  });
}

function deriveBeats(input: JobInput, hero?: string): Beat[] {
  if (input.beats?.length) return input.beats;
  return input.script
    .split(/[.\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((s, i) => ({
      id: `beat-${i + 1}`,
      title: s.slice(0, 48) || `Step ${i + 1}`,
      action: s,
      where: "header nav",
      success: { visibleText: hero || s.split(" ").slice(0, 3).join(" ") },
      narration: s,
    }));
}

export async function KaneDemoWorkflow(args: {
  jobId: string;
  input: JobInput;
  hasCredentials: boolean;
}): Promise<{ status: string }> {
  let slotId: string | undefined;
  const release = async (id: string) => {
    await control.releaseChromeSlot(id, args.jobId);
  };
  try {
    await control.setJobStep(args.jobId, "health");
    await control.toolingHealth();

    const slot = await control.acquireChromeSlot(args.jobId);
    slotId = slot.slot_id;
    await control.setJobStep(args.jobId, "preflight");
    await kaneA.kanePreflight({
      jobId: args.jobId,
      mode: "kane",
      input: args.input,
      hasCredentials: args.hasCredentials,
    });
    await control.setJobStep(args.jobId, "understand");
    const site = await kaneA.kaneUnderstand({
      jobId: args.jobId,
      mode: "kane",
      input: args.input,
    });
    await release(slot.slot_id);
    slotId = undefined;

    await control.setJobStep(args.jobId, "plan");
    const planned = await control.planDemoBeats({
      jobId: args.jobId,
      mode: "kane",
      input: args.input,
      site: site.final_state,
    });
    let beats = planned.beats;
    if (args.input.require_script_confirm) {
      let confirmed: Beat[] | null = null;
      setHandler(confirmScriptSignal, (next) => {
        confirmed = next;
      });
      await control.setJobStep(args.jobId, "await_script");
      const ok = await condition(() => confirmed !== null, "30 minutes");
      if (!ok || !confirmed) {
        throw ApplicationFailure.create({
          message: "Demo can't be recorded: script was not confirmed.",
          type: "script_unconfirmed",
          nonRetryable: true,
        });
      }
      beats = confirmed;
    }

    await control.setJobStep(args.jobId, "tts");
    const tts = await media.synthesizeBeats({
      jobId: args.jobId,
      mode: "kane",
      beats,
      engine: args.input.voice?.engine,
    });

    const slot2 = await control.acquireChromeSlot(args.jobId);
    slotId = slot2.slot_id;
    try {
      await control.setJobStep(args.jobId, "author");
      await kaneA.compileTestMd({
        jobId: args.jobId,
        input: args.input,
        beats,
        audioSeconds: tts.seconds,
      });
      const rec = await kaneA.kaneTestmdRun({
        jobId: args.jobId,
        mode: "kane",
        beats,
        timeoutSec: 180,
        cdpPort: slot2.port,
      });
      await media.assembleDemo({
        jobId: args.jobId,
        mode: "kane",
        beats,
        seconds: tts.seconds,
        videoPath: rec.capturePath,
        websiteUrl: args.input.website_url,
        productName: args.input.product_name,
      });
    } finally {
      await release(slot2.slot_id);
      slotId = undefined;
    }

    return { status: "completed" };
  } catch (err) {
    if (slotId) {
      try {
        await release(slotId);
      } catch {
        /* ignore */
      }
    }
    await persistFailure(args.jobId, err);
    throw err;
  }
}
