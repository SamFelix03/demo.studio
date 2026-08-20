import { AlertTriangle, Check, Circle, Download, Film, Mic2, Scan, Sparkles, Wand2 } from "lucide-react";
import type { Job, PipelineStep } from "../types";

const ICONS = [Scan, Wand2, Film, Mic2, Sparkles, Check] as const;
type StepState = "pending" | "active" | "done" | "failed";

const PIPELINE_STEPS: PipelineStep[] = [
  { key: "health", label: "Chrome slot", detail: "Lease a local browser for this run." },
  { key: "preflight", label: "Preflight", detail: "Open the URL and check for walls or CAPTCHAs." },
  { key: "understand", label: "Understand", detail: "Read live labels, fields, and buttons." },
  { key: "plan", label: "Plan", detail: "Turn the brief into one action per beat." },
  { key: "tts", label: "Voiceover", detail: "Synthesize narration to the beat length." },
  { key: "author", label: "Kane author", detail: "Kane clicks and types in one shared session." },
  { key: "upload", label: "Seal", detail: "Mux picture to voice and store the MP4." },
];

export function stepIndexForJob(steps: PipelineStep[], job: Pick<Job, "status" | "step">): number {
  if (job.status === "completed") return steps.length;
  if (!job.step) return 0;
  const i = steps.findIndex((s) => s.key === job.step);
  if (i >= 0) return i;
  if (job.step === "generate") return Math.max(0, steps.findIndex((s) => s.key === "plan"));
  return 0;
}

function StepRow({
  step,
  index,
  state,
  isLast,
}: {
  step: PipelineStep;
  index: number;
  state: StepState;
  isLast: boolean;
}) {
  const Icon = ICONS[index % ICONS.length];
  const statusText =
    state === "pending" ? "Waiting" : state === "active" ? "In progress" : state === "failed" ? "Failed" : "Done";
  return (
    <li className={`pipeline-step pipeline-step--${state}`}>
      <div className="pipeline-rail" aria-hidden>
        <span className="pipeline-rail-node">
          {state === "done" ? (
            <Check className="pipeline-rail-check" strokeWidth={2.5} />
          ) : state === "failed" ? (
            <AlertTriangle className="pipeline-rail-check" strokeWidth={2.5} />
          ) : state === "active" ? (
            <Circle className="pipeline-rail-active" strokeWidth={2.5} />
          ) : (
            <span className="pipeline-rail-pending" />
          )}
        </span>
        {!isLast ? <span className="pipeline-rail-line" /> : null}
      </div>
      <div className="pipeline-step-body">
        <div className="pipeline-step-head">
          <span className="pipeline-step-icon" aria-hidden>
            <Icon className="h-4" strokeWidth={1.75} />
          </span>
          <div className="pipeline-step-copy">
            <p className="pipeline-step-label">
              <span className="pipeline-step-num">{String(index + 1).padStart(2, "0")}</span>
              {step.label}
            </p>
            <p className="pipeline-step-detail">{step.detail}</p>
          </div>
          <span className="pipeline-step-status">{statusText}</span>
        </div>
      </div>
    </li>
  );
}

export function PipelineStage({ job, title }: { job: Job; title?: string }) {
  const steps = PIPELINE_STEPS;
  const done = job.status === "completed";
  const failed = job.status === "failed" || job.status === "cancelled" || job.status === "aborted";
  const stepIndex = stepIndexForJob(steps, job);
  const statusLabel = done
    ? "Completed"
    : failed
      ? job.status
      : steps[Math.min(stepIndex, steps.length - 1)]?.label ?? job.status;

  return (
    <section className="pipeline-stage">
      <header className="pipeline-head">
        <div className="pipeline-titles">
          <p className="pipeline-name">{title ?? job.input.product_name ?? "Demo"}</p>
          <p className="pipeline-prompt-inline" title={job.input.website_url}>
            {job.input.website_url}
          </p>
        </div>
        <div className="pipeline-status-chip">
          <span className={done || failed ? "live-dot live-dot--static" : "live-dot"} />
          <span>{statusLabel}</span>
        </div>
      </header>
      <ol className="pipeline-steps">
        {steps.map((s, i) => {
          let state: StepState = "pending";
          if (failed && i === stepIndex) state = "failed";
          else if (done || i < stepIndex) state = "done";
          else if (i === stepIndex) state = "active";
          return <StepRow key={s.key} step={s} index={i} state={state} isLast={i === steps.length - 1} />;
        })}
      </ol>
      {failed ? (
        <div className="pipeline-error">
          <AlertTriangle className="h-4" />
          <span>{job.error ?? `Demo can't be recorded${job.abort_code ? `: ${job.abort_code}` : ""}`}</span>
        </div>
      ) : null}
    </section>
  );
}

export function ArtifactCard({
  jobId,
  title,
  kind,
  href,
}: {
  jobId: string;
  title: string;
  kind: "video" | "file";
  href: string;
}) {
  return (
    <div className="artifact-card">
      <div className="artifact-head">
        <p className="artifact-title">{title}</p>
        <span className="artifact-pill">Ready</span>
        <a href={href} className="artifact-dl" title="Download">
          <Download className="h-4" />
        </a>
      </div>
      {kind === "video" ? (
        <div className="artifact-media">
          <video src={`/v1/jobs/${jobId}/artifacts/video`} controls playsInline preload="metadata" />
        </div>
      ) : null}
    </div>
  );
}
