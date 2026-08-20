import type { Ev } from "../types";

function fmtTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

export function showEvent(e: Ev) {
  if (e.kind === "kane_cmd" || e.kind === "ndjson" || e.kind === "heal" || e.kind === "kane_step") {
    return true;
  }
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
      <article className={`log-row ${bad ? "bad" : ok ? "ok" : ""}`}>
        <header>
          <span className={`log-kind ${bad ? "bad" : ok ? "ok" : ""}`}>Kane CLI</span>
          <span className="log-phase">
            {tool}
            {p.beatId ? ` · ${String(p.beatId)}` : ""}
          </span>
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
    const cmd = String(
      p.action ?? argv.filter((a) => !String(a).startsWith("/") && a !== "--agent").slice(0, 8).join(" "),
    );
    return (
      <article className="log-row">
        <header>
          <span className="log-kind">Kane start</span>
          <span className="log-phase">{phase}</span>
          <time>{fmtTime(e.ts)}</time>
        </header>
        <p>{cmd || "Kane is driving the browser for this step."}</p>
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
          <span className={`log-kind ${String(status).includes("pass") || status === "ok" ? "ok" : ""}`}>Kane run</span>
          <span className="log-phase">
            {status}
            {p.stills != null ? ` · ${p.stills} stills` : ""}
          </span>
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
          <ol className="log-steps">
            {Array.from({ length: rows }, (_, i) => (
              <li key={i}>
                {actions[i] ? (
                  <>
                    <strong>Kane: </strong>
                    {actions[i]}
                    <br />
                  </>
                ) : null}
                {narrations[i] ? (
                  <>
                    <strong>Voice: </strong>
                    {narrations[i]}
                  </>
                ) : null}
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
            <time>{fmtTime(e.ts)}</time>
          </header>
          <ul className="log-steps">
            {state.nav_items ? <li>Nav: {state.nav_items}</li> : null}
            {state.hero_cta ? <li>Hero CTA: {state.hero_cta}</li> : null}
            {state.inputs ? <li>Fields: {state.inputs}</li> : null}
            {state.buttons ? <li>Buttons: {state.buttons}</li> : null}
          </ul>
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
    if (phase === "slot_acquired" || phase === "slot_released" || phase === "kane_log") return null;
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
          <br />→ {String(p.after ?? "").slice(0, 140)}
        </p>
      </article>
    );
  }
  return null;
}

export function KaneConsole({ events }: { events: Ev[] }) {
  const log = events.filter(showEvent);
  return (
    <div className="console">
      {log.length ? log.map((e) => <ConsoleRow key={e.seq} e={e} />) : <p className="console-empty">Waiting for the first Kane event…</p>}
    </div>
  );
}
