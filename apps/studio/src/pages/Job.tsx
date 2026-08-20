import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

type Job = {
  id: string;
  mode: string;
  status: string;
  step: string | null;
  abort_code: string | null;
  error: string | null;
  artifacts: Array<{ type: string; url?: string; object_key?: string }>;
  input: { website_url: string; script: string; product_name?: string };
  parent_job_id?: string | null;
  kane_credits?: number | null;
  compare?: Job | null;
};

type Ev = { seq: number; kind: string; payload: Record<string, unknown>; ts: string };

const PHASES = [
  "health",
  "preflight",
  "understand",
  "generate",
  "plan",
  "tts",
  "author",
  "naive_record",
  "upload",
];

const TERMINAL = new Set(["completed", "failed", "aborted", "cancelled"]);

function Player({ jobId, mode, status, step, title }: { jobId: string; mode: string; status: string; step: string | null; title: string }) {
  const ready = status === "completed";
  return (
    <div className="card">
      <h3>
        {title} <span className={`badge ${mode}`}>{mode}</span>
      </h3>
      <p style={{ color: "var(--muted)" }}>
        {status}
        {step ? ` · ${step}` : ""}
      </p>
      {ready ? (
        <>
          <video src={`/v1/jobs/${jobId}/artifacts/video`} controls playsInline preload="metadata" />
          <p>
            <a href={`/v1/jobs/${jobId}/artifacts/video`}>Download MP4</a>
            {" · "}
            <a href={`/v1/jobs/${jobId}/artifacts/captions`}>Captions</a>
            {" · "}
            <a href={`/v1/jobs/${jobId}/artifacts/kane-log`}>Kane CLI log</a>
          </p>
        </>
      ) : (
        <p style={{ color: "var(--muted)" }}>No video yet.</p>
      )}
    </div>
  );
}

function fmtTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

function showEvent(e: Ev) {
  if (e.kind === "kane_cmd" || e.kind === "ndjson" || e.kind === "heal" || e.kind === "naive_step" || e.kind === "kane_step") return true;
  if (e.kind !== "phase") return false;
  const phase = String(e.payload?.phase ?? "");
  return phase !== "slot_acquired" && phase !== "slot_released";
}

function stepList(raw: unknown): Array<{ tool?: string; text?: string; status?: string; remark?: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === "string") return { text: item };
    if (item && typeof item === "object") return item as { tool?: string; text?: string; status?: string; remark?: string };
    return { text: String(item) };
  });
}

function ConsoleRow({ e }: { e: Ev }) {
  const p = e.payload ?? {};
  if (e.kind === "kane_step") {
    const tool = String(p.tool ?? "kane");
    const status = String(p.status ?? "");
    const bad = /fail/i.test(status);
    const ok = /pass|ok|success/i.test(status);
    return (
      <article className="log-row kane-cli">
        <header>
          <span className={`log-kind ${bad ? "bad" : ok ? "ok" : ""}`}>Kane CLI</span>
          <span className="log-phase">{tool}{p.beatId ? ` · ${String(p.beatId)}` : ""}</span>
          <time>{fmtTime(e.ts)}</time>
        </header>
        <p>{String(p.text ?? p.action ?? "")}</p>
        {p.url ? <p className="log-meta">{String(p.url)}</p> : null}
      </article>
    );
  }
  if (e.kind === "kane_cmd") {
    const argv = Array.isArray(p.argv) ? (p.argv as string[]) : [];
    const phase = String(p.phase ?? argv[0] ?? "command");
    const cmd = String(p.action ?? argv.filter((a) => !a.startsWith("/") && a !== "--agent").slice(0, 8).join(" "));
    return (
      <article className="log-row">
        <header>
          <span className="log-kind">Kane start</span>
          <span className="log-phase">{phase}</span>
          <time>{fmtTime(e.ts)}</time>
        </header>
        <p>{cmd || "kane-cli run — Kane is driving the browser for this step."}</p>
      </article>
    );
  }
  if (e.kind === "ndjson") {
    const runEnd = (p.runEnd ?? {}) as Record<string, unknown>;
    const status = String(runEnd.status ?? (p.exitCode === 0 ? "ok" : `exit ${p.exitCode ?? "?"}`));
    const summary = String(runEnd.one_liner || runEnd.summary || "").split("\n")[0];
    const steps = stepList(p.steps ?? p.remarks ?? p.remark);
    return (
      <article className="log-row">
        <header>
          <span className={`log-kind ${String(status).includes("pass") || status === "ok" ? "ok" : ""}`}>
            Kane run
          </span>
          <span className="log-phase">{status}{p.stills != null ? ` · ${p.stills} stills` : ""}</span>
          <time>{fmtTime(e.ts)}</time>
        </header>
        {summary ? <p>{summary}</p> : p.url ? <p className="log-meta">{String(p.url)}</p> : null}
        {steps.length > 0 && (
          <ol className="log-steps">
            {steps.map((r, i) => (
              <li key={i}>
                <span className={`dot ${/fail/i.test(String(r.status)) ? "bad" : "ok"}`} />
                <strong>{r.tool ? `${r.tool}: ` : ""}</strong>
                {String(r.text ?? r.remark ?? r.status ?? "step")}
              </li>
            ))}
          </ol>
        )}
      </article>
    );
  }
  if (e.kind === "phase") {
    const phase = String(p.phase ?? "");
    if (phase === "plan") {
      const narrations = Array.isArray(p.narrations) ? (p.narrations as string[]) : [];
      const actions = Array.isArray(p.actions) ? (p.actions as string[]) : [];
      const rows = Math.max(narrations.length, actions.length);
      return (
        <article className="log-row">
          <header>
            <span className="log-kind">Plan</span>
            <span className="log-phase">{String(p.source ?? "script")}</span>
            <time>{fmtTime(e.ts)}</time>
          </header>
          <p>Kane will perform each line as one browser action. Voiceover describes the screen after that action.</p>
          <ol className="log-steps">
            {Array.from({ length: rows }, (_, i) => (
              <li key={i}>
                {actions[i] ? <><strong>Kane: </strong>{actions[i]}<br /></> : null}
                {narrations[i] ? <><strong>Voice: </strong>{narrations[i]}</> : null}
              </li>
            ))}
          </ol>
        </article>
      );
    }
    if (phase === "site_map") {
      const state = (p.final_state ?? {}) as Record<string, string>;
      return (
        <article className="log-row">
          <header>
            <span className="log-kind">Kane map</span>
            <span className="log-phase">understand</span>
            <time>{fmtTime(e.ts)}</time>
          </header>
          <p>Kane read the live page and stored labels it can click or type into.</p>
          <ul className="log-steps">
            {state.nav_items ? <li>Nav: {state.nav_items}</li> : null}
            {state.hero_cta ? <li>Hero CTA: {state.hero_cta}</li> : null}
            {state.inputs ? <li>Fields: {state.inputs}</li> : null}
            {state.buttons ? <li>Buttons: {state.buttons}</li> : null}
          </ul>
        </article>
      );
    }
    if (phase === "kane_log") {
      return (
        <article className="log-row">
          <header>
            <span className="log-kind ok">Kane log</span>
            <time>{fmtTime(e.ts)}</time>
          </header>
          <p>Full Kane CLI action log is attached to this job.</p>
        </article>
      );
    }
    if (phase === "tts") {
      const secs = Array.isArray(p.seconds) ? (p.seconds as number[]) : [];
      return (
        <article className="log-row">
          <header>
            <span className="log-kind">Voice</span>
            <span className="log-phase">{secs.length} lines</span>
            <time>{fmtTime(e.ts)}</time>
          </header>
          <p>{secs.map((s, i) => `Line ${i + 1}: ${Number(s).toFixed(1)}s`).join(" · ")}</p>
        </article>
      );
    }
    if (phase === "completed" || phase === "failed" || phase === "aborted") {
      return (
        <article className="log-row">
          <header>
            <span className={`log-kind ${phase === "completed" ? "ok" : "bad"}`}>{phase}</span>
            <time>{fmtTime(e.ts)}</time>
          </header>
          {p.error ? <p>{String(p.error)}</p> : <p>Demo file is ready.</p>}
        </article>
      );
    }
    if (phase === "slot_acquired" || phase === "slot_released") return null;
    return (
      <article className="log-row">
        <header>
          <span className="log-kind">Step</span>
          <span className="log-phase">{phase.replace(/_/g, " ")}</span>
          <time>{fmtTime(e.ts)}</time>
        </header>
      </article>
    );
  }
  if (e.kind === "heal") {
    return (
      <article className="log-row">
        <header>
          <span className="log-kind">Heal</span>
          <time>{fmtTime(e.ts)}</time>
        </header>
        <p>
          {String(p.before ?? "").slice(0, 140)}
          <br />
          → {String(p.after ?? "").slice(0, 140)}
        </p>
      </article>
    );
  }
  if (e.kind === "naive_step") {
    return (
      <article className="log-row">
        <header>
          <span className="log-kind">Click</span>
          <span className="log-phase">{String(p.beatId ?? "")}</span>
          <time>{fmtTime(e.ts)}</time>
        </header>
        <p>{String(p.clicked ?? "")}</p>
      </article>
    );
  }
  return null;
}

export default function Job() {
  const { id } = useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);

  useEffect(() => {
    if (!id) return;
    let after = 0;
    let stop = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const poll = async () => {
      const j = (await fetch(`/v1/jobs/${id}`).then((r) => r.json())) as Job;
      if (stop) return;
      setJob((prev) => {
        if (
          prev &&
          prev.status === j.status &&
          prev.step === j.step &&
          prev.error === j.error &&
          prev.compare?.status === j.compare?.status
        ) {
          return prev;
        }
        return j;
      });
      const ev = await fetch(`/v1/jobs/${id}/events?after=${after}`).then((r) => r.json());
      const list: Ev[] = ev.events ?? [];
      if (list.length) {
        after = list[list.length - 1].seq;
        setEvents((prev) => [...prev, ...list]);
      }
      if (TERMINAL.has(j.status) && (!j.compare || TERMINAL.has(j.compare.status))) {
        stop = true;
        if (timer) clearInterval(timer);
      }
    };
    void poll();
    timer = setInterval(() => void poll(), 1500);
    return () => {
      stop = true;
      if (timer) clearInterval(timer);
    };
  }, [id]);

  if (!job) return <p>Loading…</p>;
  const log = events.filter(showEvent);

  return (
    <>
      <div className="card">
        <span className={`badge ${job.mode}`}>{job.mode}</span>
        <h2 style={{ margin: "8px 0 4px" }}>{job.input.product_name ?? "Demo"}</h2>
        <p style={{ color: "var(--muted)" }}>{job.input.website_url}</p>
        <p>
          Status <strong>{job.status}</strong>
          {job.step ? ` · ${job.step}` : ""}
          {job.kane_credits != null ? ` · credits ${job.kane_credits}` : ""}
        </p>
        <div className="timeline">
          {PHASES.map((p) => (
            <span key={p} className={`phase ${job.step === p ? "now" : ""}`}>
              {p}
            </span>
          ))}
        </div>
        {(job.status === "aborted" || job.status === "failed") && (
          <div className="abort">{job.error ?? `Demo can't be recorded: ${job.abort_code}`}</div>
        )}
      </div>

      <div className="card">
        <h3>Run console</h3>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          Live Kane CLI actions (click, type, assert, heal). Kane is the browser agent — each line is what it did, not the voiceover.
        </p>
        <p>
          <a href={`/v1/jobs/${job.id}/artifacts/kane-log`}>Download full Kane action log</a>
          {" · "}
          <a href={`/v1/jobs/${job.id}/artifacts/kane-jsonl`}>Raw NDJSON</a>
        </p>
        <div className="console">
          {log.length ? log.map((e) => <ConsoleRow key={e.seq} e={e} />) : <p className="console-empty">Waiting for the first Kane event…</p>}
        </div>
      </div>

      {job.compare ? (
        <div className="compare">
          <Player jobId={job.id} mode={job.mode} status={job.status} step={job.step} title="Kane" />
          <Player
            jobId={job.compare.id}
            mode={job.compare.mode}
            status={job.compare.status}
            step={job.compare.step}
            title="Normal"
          />
        </div>
      ) : (
        <Player jobId={job.id} mode={job.mode} status={job.status} step={job.step} title="Output" />
      )}

      {job.parent_job_id && (
        <p>
          <Link to={`/jobs/${job.parent_job_id}`}>Open parent Kane job</Link>
        </p>
      )}

      <div className="card">
        <h3>Brief</h3>
        <p>{job.input.script}</p>
      </div>
    </>
  );
}
