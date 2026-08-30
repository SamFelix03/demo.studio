import { useEffect, useState } from "react";

type FlowDelta = {
  key: string;
  baseline: string | null;
  candidate: string | null;
  verdict: string;
};

type VerifiedFlow = {
  flow: string;
  status: string;
  reason: string | null;
  failedStep: string | null;
  deltas: FlowDelta[];
  infraError: string | null;
  shareUrl: string | null;
};

type VerifyReport = {
  verdict: "passed" | "blocked" | "error";
  changeRequest: string;
  agent: string;
  attempt: number;
  maxAttempts: number;
  startedAt: string;
  finishedAt: string;
  changedFiles: string[];
  affectedFlows: string[];
  unexpectedCount: number;
  flows: VerifiedFlow[];
  timeline: { at: string; label: string; kind: string }[];
};

type Payload = {
  live: VerifyReport | null;
  blocked: VerifyReport | null;
  verified: VerifyReport | null;
  baseline: { commit?: string; createdAt?: string; flows?: Record<string, unknown> } | null;
  source: "live" | "snapshot";
};

function verdictLabel(verdict: string): string {
  if (verdict === "passed") return "SAFE TO SHIP";
  if (verdict === "blocked") return "BLOCKED";
  return "COULD NOT VERIFY";
}

function ReportCard({ title, report }: { title: string; report: VerifyReport }) {
  return (
    <article className={`verified-card ${report.verdict}`}>
      <header className="verified-card-head">
        <p className="panel-kicker">{title}</p>
        <p className={`verified-stamp ${report.verdict}`}>{verdictLabel(report.verdict)}</p>
      </header>
      <p className="verified-request">“{report.changeRequest}”</p>
      <dl className="verified-meta">
        <div>
          <dt>Agent</dt>
          <dd>{report.agent}</dd>
        </div>
        <div>
          <dt>Attempt</dt>
          <dd>
            {report.attempt} / {report.maxAttempts}
          </dd>
        </div>
        <div>
          <dt>Flows</dt>
          <dd>{report.affectedFlows.join(", ") || "none"}</dd>
        </div>
        <div>
          <dt>Unexpected</dt>
          <dd>{report.unexpectedCount}</dd>
        </div>
      </dl>
      {report.changedFiles.length > 0 ? (
        <p className="verified-files">Changed: {report.changedFiles.join(", ")}</p>
      ) : null}
      <ul className="verified-flows">
        {report.flows.map((flow) => (
          <li key={flow.flow}>
            <strong>
              {flow.flow} [{flow.status}]
            </strong>
            {flow.failedStep ? <span> · {flow.failedStep}</span> : null}
            {flow.reason ? <p>{flow.reason}</p> : null}
            {flow.deltas.map((delta) => (
              <p key={delta.key} className={`verified-delta ${delta.verdict.toLowerCase()}`}>
                {delta.key}: {delta.baseline ?? "∅"} → {delta.candidate ?? "∅"} ({delta.verdict})
              </p>
            ))}
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function Verified() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/v1/verified");
        if (res.ok) {
          const json = (await res.json()) as Payload;
          if (json.live || json.blocked || json.verified) {
            if (!cancelled) setData(json);
            return;
          }
        }
      } catch {
        // Fall through to static snapshots baked into the Studio build.
      }
      try {
        const [blocked, verified] = await Promise.all([
          fetch("/verified/blocked-run.json").then((r) => (r.ok ? r.json() : null)),
          fetch("/verified/verified-run.json").then((r) => (r.ok ? r.json() : null)),
        ]);
        if (!cancelled) {
          setData({
            live: null,
            blocked,
            verified,
            baseline: null,
            source: "snapshot",
          });
        }
      } catch (caught) {
        if (!cancelled) setErr(String(caught));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const featured = data?.live ?? data?.blocked ?? data?.verified ?? null;

  return (
    <div className="page-verified">
      <p className="panel-kicker">Closed loop</p>
      <h1 className="pixel-hero">Kane caught it.</h1>
      <p className="verified-lead">
        Cursor builds Studio. A stop hook maps the git diff to committed TestMD. Kane CLI replays those
        flows in Chrome. If a protected observable moved, Cursor is not allowed to end the turn.
      </p>

      {err ? <p className="error-banner">{err}</p> : null}
      {!data && !err ? <p className="verified-lead">Loading the last Kane report…</p> : null}

      {featured ? (
        <p className={`verified-banner ${featured.verdict}`}>
          {verdictLabel(featured.verdict)}
          <span>
            {data?.source === "live" ? "live last-verify.json" : "committed snapshot"}
            {data?.baseline?.commit ? ` · baseline ${data.baseline.commit}` : ""}
          </span>
        </p>
      ) : null}

      <div className="verified-grid">
        {data?.live ? <ReportCard title="Live (this machine)" report={data.live} /> : null}
        {data?.blocked ? <ReportCard title="Kane blocked Cursor" report={data.blocked} /> : null}
        {data?.verified ? <ReportCard title="Kane allowed Cursor to finish" report={data.verified} /> : null}
      </div>

      <section className="verified-notes">
        <h2>What Kane already proved</h2>
        <ul>
          <li>
            21 Aug: Continue on Access used to submit Generate. Committed TestMD caught it. Fixed. See{" "}
            <a href="https://github.com/SamFelix03/demo.studio/blob/main/docs/kane-runs/studio-e2e/RESULTS.md">
              studio-e2e RESULTS
            </a>
            .
          </li>
          <li>
            Scoring drill: plant Continue as <code>type=&quot;submit&quot;</code> without <code>onClick=next</code>, stop the
            agent, Kane fails Access → Launch, Cursor restores the button. Artifacts in{" "}
            <code>docs/kane-runs/verify/</code>.
          </li>
          <li>
            Lane 3 is unchanged: Kane is still the hands on a third-party site. This page is the gate on{" "}
            <em>Studio itself</em>.
          </li>
        </ul>
      </section>
    </div>
  );
}
