import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clapperboard, LayoutGrid } from "lucide-react";
import type { Job } from "../types";

export default function Gallery() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    fetch("/v1/jobs?limit=100")
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? []));
  }, []);

  return (
    <div className="page-gallery">
      <div className="gallery-head">
        <div>
          <p className="panel-kicker">Library</p>
          <h1 className="gallery-title">Demo Gallery</h1>
        </div>
      </div>

      {jobs.length ? (
        <div className="assets-grid">
          {jobs.map((j) => (
            <Link className="asset-tile" key={j.id} to={`/jobs/${j.id}`}>
              <div className="showcase-media">
                {j.status === "completed" ? (
                  <video src={`/v1/jobs/${j.id}/artifacts/video`} muted playsInline preload="metadata" />
                ) : (
                  <div className={`media-fallback ${j.status === "running" || j.status === "queued" ? "glowing" : ""}`}>
                    <Clapperboard className="h-5" />
                    <span>{j.status}</span>
                  </div>
                )}
              </div>
              <div className="asset-tile-head">
                <span className="asset-kind">Kane</span>
                <span className={`status-chip ${j.status}`}>{j.status}</span>
              </div>
              <strong className="tile-title">{j.input.product_name || j.input.website_url}</strong>
              <p className="asset-prompt">{j.input.website_url}</p>
              <div className="asset-tile-foot">
                <span>{j.created_at ? new Date(j.created_at).toLocaleString() : ""}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="sidebar-empty">
          <LayoutGrid className="h-5" />
          <p>No demos yet. Generate one and it will land here.</p>
        </div>
      )}
    </div>
  );
}
