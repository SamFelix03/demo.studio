import pg from "pg";
import type { Artifact, JobEvent, JobInput, JobMode, JobRecord, JobStatus } from "./types.js";

let pool: pg.Pool | undefined;

export function getPool(connectionString: string): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString, max: 10 });
  }
  return pool;
}

function rowToJob(row: pg.QueryResultRow): JobRecord {
  return {
    id: String(row.id),
    service: row.service,
    mode: row.mode,
    status: row.status,
    step: row.step,
    input: row.input,
    artifacts: row.artifacts ?? [],
    events_cursor: Number(row.events_cursor ?? 0),
    abort_code: row.abort_code,
    kane_credits: row.kane_credits != null ? Number(row.kane_credits) : null,
    error: row.error,
    error_code: row.error_code,
    idempotency_key: row.idempotency_key,
    workflow_id: row.workflow_id,
    parent_job_id: row.parent_job_id ? String(row.parent_job_id) : null,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

export async function findByIdempotency(
  db: pg.Pool,
  service: string,
  key: string,
): Promise<JobRecord | null> {
  const r = await db.query(
    `SELECT * FROM jobs WHERE service = $1 AND idempotency_key = $2 LIMIT 1`,
    [service, key],
  );
  return r.rows[0] ? rowToJob(r.rows[0]) : null;
}

export async function insertJob(
  db: pg.Pool,
  args: {
    id: string;
    mode: JobMode;
    input: JobInput;
    idempotency_key?: string;
    parent_job_id?: string;
  },
): Promise<JobRecord> {
  const r = await db.query(
    `INSERT INTO jobs (id, service, mode, status, input, idempotency_key, parent_job_id)
     VALUES ($1, 'demo-studio', $2, 'queued', $3::jsonb, $4, $5)
     RETURNING *`,
    [
      args.id,
      args.mode,
      JSON.stringify(args.input),
      args.idempotency_key ?? null,
      args.parent_job_id ?? null,
    ],
  );
  return rowToJob(r.rows[0]);
}

export async function getJob(db: pg.Pool, id: string): Promise<JobRecord | null> {
  const r = await db.query(`SELECT * FROM jobs WHERE id = $1`, [id]);
  return r.rows[0] ? rowToJob(r.rows[0]) : null;
}

export async function listChildJobs(db: pg.Pool, parentId: string): Promise<JobRecord[]> {
  const r = await db.query(
    `SELECT * FROM jobs WHERE parent_job_id = $1 ORDER BY created_at ASC`,
    [parentId],
  );
  return r.rows.map(rowToJob);
}

export async function listJobs(
  db: pg.Pool,
  filters: { mode?: JobMode; status?: JobStatus; limit?: number },
): Promise<JobRecord[]> {
  const clauses: string[] = [];
  const vals: unknown[] = [];
  if (filters.mode) {
    vals.push(filters.mode);
    clauses.push(`mode = $${vals.length}`);
  }
  if (filters.status) {
    vals.push(filters.status);
    clauses.push(`status = $${vals.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  vals.push(filters.limit ?? 50);
  const r = await db.query(
    `SELECT * FROM jobs ${where} ORDER BY created_at DESC LIMIT $${vals.length}`,
    vals,
  );
  return r.rows.map(rowToJob);
}

export async function updateJob(
  db: pg.Pool,
  id: string,
  patch: Partial<{
    status: JobStatus;
    step: string | null;
    artifacts: Artifact[];
    abort_code: string | null;
    kane_credits: number | null;
    error: string | null;
    error_code: string | null;
    workflow_id: string | null;
    input: JobInput;
  }>,
): Promise<JobRecord | null> {
  const sets: string[] = ["updated_at = NOW()"];
  const vals: unknown[] = [];
  const add = (col: string, val: unknown) => {
    vals.push(val);
    sets.push(`${col} = $${vals.length}`);
  };
  if (patch.status !== undefined) add("status", patch.status);
  if (patch.step !== undefined) add("step", patch.step);
  if (patch.artifacts !== undefined) add("artifacts", JSON.stringify(patch.artifacts));
  if (patch.abort_code !== undefined) add("abort_code", patch.abort_code);
  if (patch.kane_credits !== undefined) add("kane_credits", patch.kane_credits);
  if (patch.error !== undefined) add("error", patch.error);
  if (patch.error_code !== undefined) add("error_code", patch.error_code);
  if (patch.workflow_id !== undefined) add("workflow_id", patch.workflow_id);
  if (patch.input !== undefined) add("input", JSON.stringify(patch.input));
  vals.push(id);
  const r = await db.query(
    `UPDATE jobs SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`,
    vals,
  );
  return r.rows[0] ? rowToJob(r.rows[0]) : null;
}

export async function appendEvent(
  db: pg.Pool,
  jobId: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<JobEvent> {
  const r = await db.query(
    `INSERT INTO job_events (job_id, kind, payload) VALUES ($1, $2, $3::jsonb)
     RETURNING *`,
    [jobId, kind, JSON.stringify(payload)],
  );
  await db.query(
    `UPDATE jobs SET events_cursor = events_cursor + 1, updated_at = NOW() WHERE id = $1`,
    [jobId],
  );
  const row = r.rows[0];
  return {
    job_id: String(row.job_id),
    seq: Number(row.seq),
    ts: new Date(row.ts).toISOString(),
    kind: row.kind,
    payload: row.payload,
  };
}

export async function listEvents(
  db: pg.Pool,
  jobId: string,
  after = 0,
): Promise<JobEvent[]> {
  const r = await db.query(
    `SELECT * FROM job_events WHERE job_id = $1 AND seq > $2 ORDER BY seq ASC`,
    [jobId, after],
  );
  return r.rows.map((row) => ({
    job_id: String(row.job_id),
    seq: Number(row.seq),
    ts: new Date(row.ts).toISOString(),
    kind: row.kind,
    payload: row.payload,
  }));
}

export async function acquireSlot(
  db: pg.Pool,
  jobId: string,
  workerIdentity: string,
): Promise<{ slot_id: string; port: number } | null> {
  const r = await db.query(
    `UPDATE chrome_slots SET leased_job_id = $1, lease_until = NOW() + INTERVAL '15 minutes'
     WHERE slot_id = (
       SELECT slot_id FROM chrome_slots
       WHERE worker_identity = $2 AND (leased_job_id IS NULL OR lease_until < NOW())
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING slot_id, port`,
    [jobId, workerIdentity],
  );
  return r.rows[0]
    ? { slot_id: r.rows[0].slot_id, port: Number(r.rows[0].port) }
    : null;
}

export async function heartbeatSlot(db: pg.Pool, slotId: string, jobId: string) {
  await db.query(
    `UPDATE chrome_slots SET lease_until = NOW() + INTERVAL '15 minutes'
     WHERE slot_id = $1 AND leased_job_id = $2`,
    [slotId, jobId],
  );
}

export async function releaseSlot(db: pg.Pool, slotId: string) {
  await db.query(
    `UPDATE chrome_slots SET leased_job_id = NULL, lease_until = NULL WHERE slot_id = $1`,
    [slotId],
  );
}

export async function countFreeSlots(db: pg.Pool): Promise<number> {
  const r = await db.query(
    `SELECT COUNT(*)::int AS n FROM chrome_slots WHERE leased_job_id IS NULL OR lease_until < NOW()`,
  );
  return r.rows[0]?.n ?? 0;
}
