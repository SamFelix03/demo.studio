import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Captions, FileText, Square } from "lucide-react";
import { ArtifactCard, PipelineStage } from "../components/PipelineStage";
import { KaneConsole } from "../components/KaneConsole";
import type { Ev, Job } from "../types";

const TERMINAL = new Set(["completed", "failed", "aborted", "cancelled"]);

export default function JobPage() {
  const { id } = useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!id) return;
    let after = 0;
    let stop = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const poll = async () => {
      const j = (await fetch(`/v1/jobs/${id}`).then((r) => r.json())) as Job;
      if (stop) return;
      setJob(j);
      const ev = await fetch(`/v1/jobs/${id}/events?after=${after}`).then((r) => r.json());
      const list: Ev[] = ev.events ?? [];
      if (list.length) {
        after = list[list.length - 1].seq;
        setEvents((prev) => [...prev, ...list]);
      }
      if (TERMINAL.has(j.status)) {
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

  async function cancel() {
    if (!job) return;
    setCancelling(true);
    await fetch(`/v1/jobs/${job.id}/cancel`, { method: "POST" }).catch(() => undefined);
    setCancelling(false);
  }

  if (!job) {
    return (
      <div className="pipeline-stage pipeline-skeleton">
        <div className="glow-bar" />
        <p className="pipeline-name">Loading run…</p>
      </div>
    );
  }

  const live = !TERMINAL.has(job.status);

  return (
    <div className="page-job">
      <div className="job-toolbar">
        <Link to="/jobs" className="btn-ghost-pill">
          <ArrowLeft className="h-4" />
          Gallery
        </Link>
        {live ? (
          <button type="button" className="btn-ghost-pill" onClick={() => void cancel()} disabled={cancelling}>
            <Square className="h-4" />
            {cancelling ? "Stopping…" : "Stop"}
          </button>
        ) : null}
      </div>

      <div className="job-layout">
        <PipelineStage job={job} title={job.input.product_name ?? "Kane run"} />
      </div>

      {job.status === "completed" ? (
        <div className="job-layout">
          <ArtifactCard jobId={job.id} title="Demo video" kind="video" href={`/v1/jobs/${job.id}/artifacts/video`} />
        </div>
      ) : null}

      <section className="panel-card console-panel">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Kane CLI</p>
            <h2 className="panel-title">Run console</h2>
          </div>
          <div className="panel-header-actions">
            <a className="icon-btn" href={`/v1/jobs/${job.id}/artifacts/kane-log`} title="Action log">
              <FileText className="h-4" />
            </a>
            <a className="icon-btn" href={`/v1/jobs/${job.id}/artifacts/captions`} title="Captions">
              <Captions className="h-4" />
            </a>
          </div>
        </header>
        <KaneConsole events={events} />
      </section>

      {job.input.script ? (
        <section className="panel-card brief-card">
          <p className="panel-kicker">Brief</p>
          <p className="brief-copy">{job.input.script}</p>
        </section>
      ) : null}
    </div>
  );
}
