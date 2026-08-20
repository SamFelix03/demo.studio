import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Job = {
  id: string;
  mode: string;
  status: string;
  input: { website_url?: string; product_name?: string };
  created_at: string;
  abort_code?: string | null;
};

export default function History() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [mode, setMode] = useState("");
  useEffect(() => {
    const q = mode ? `?mode=${mode}` : "";
    fetch(`/v1/jobs${q}`)
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? []));
  }, [mode]);
  return (
    <>
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${mode === "" ? "on" : ""}`} onClick={() => setMode("")}>
          All
        </button>
        <button className={`tab ${mode === "kane" ? "on" : ""}`} onClick={() => setMode("kane")}>
          Kane
        </button>
        <button className={`tab ${mode === "naive" ? "on" : ""}`} onClick={() => setMode("naive")}>
          Normal
        </button>
      </div>
      <div className="list">
        {jobs.map((j) => (
          <Link className="job-row" key={j.id} to={`/jobs/${j.id}`}>
            <span className={`badge ${j.mode}`}>{j.mode}</span>
            <div>
              <strong>{j.input.product_name || j.input.website_url}</strong>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>{j.input.website_url}</div>
            </div>
            <span>
              {j.status}
              {j.abort_code ? ` · ${j.abort_code}` : ""}
            </span>
          </Link>
        ))}
        {!jobs.length && <p style={{ color: "var(--muted)" }}>No demos yet.</p>}
      </div>
    </>
  );
}
