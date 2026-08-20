CREATE DATABASE temporal;
CREATE DATABASE temporal_visibility;

\c demostudio;

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY,
  service TEXT NOT NULL DEFAULT 'demo-studio',
  mode TEXT NOT NULL CHECK (mode IN ('kane', 'naive')),
  status TEXT NOT NULL,
  step TEXT,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  artifacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  events_cursor BIGINT NOT NULL DEFAULT 0,
  abort_code TEXT,
  kane_credits NUMERIC,
  error TEXT,
  error_code TEXT,
  idempotency_key TEXT,
  workflow_id TEXT,
  parent_job_id UUID REFERENCES jobs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_service_idempotency_uidx
  ON jobs (service, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status);
CREATE INDEX IF NOT EXISTS jobs_parent_job_id_idx ON jobs (parent_job_id);

CREATE TABLE IF NOT EXISTS chrome_slots (
  slot_id TEXT PRIMARY KEY,
  worker_identity TEXT NOT NULL,
  port INT NOT NULL,
  leased_job_id UUID,
  lease_until TIMESTAMPTZ
);

INSERT INTO chrome_slots (slot_id, worker_identity, port)
VALUES ('slot-9222', 'local-1', 9222), ('slot-9223', 'local-1', 9223)
ON CONFLICT (slot_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS job_events (
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  seq BIGSERIAL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  PRIMARY KEY (job_id, seq)
);
