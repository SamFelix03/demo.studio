export type DemoMode = "kane";

export type Job = {
  id: string;
  mode: DemoMode | string;
  status: string;
  step: string | null;
  abort_code: string | null;
  error: string | null;
  artifacts: Array<{ type: string; url?: string; object_key?: string; mime_type?: string }>;
  input: { website_url: string; script?: string; product_name?: string };
  parent_job_id?: string | null;
  kane_credits?: number | null;
  created_at?: string;
  compare?: Job | null;
};

export type Ev = { seq: number; kind: string; payload: Record<string, unknown>; ts: string };

export type PipelineStep = {
  key: string;
  label: string;
  detail: string;
};
