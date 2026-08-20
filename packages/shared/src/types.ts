export type JobMode = "kane" | "naive";

export type JobStatus =
  | "queued"
  | "running"
  | "aborted"
  | "failed"
  | "completed"
  | "cancelled";

export interface BeatSuccess {
  urlContains?: string;
  titleContains?: string;
  visibleText?: string;
  headingContains?: string;
  elementState?: string;
}

export interface Beat {
  id: string;
  title: string;
  action: string;
  where?: string;
  targetText?: string;
  success: BeatSuccess;
  narration: string;
  waitAfterMs?: number;
  optional?: boolean;
}

export interface JobInput {
  website_url: string;
  script: string;
  beats?: Beat[];
  product_name?: string;
  credentials?: { username?: string; password?: string };
  voice?: { engine?: "say" | "edge-tts" | "piper"; language?: string; rate?: number };
  viewport?: "1440x900" | "1920x1080";
  headless?: boolean;
  require_script_confirm?: boolean;
  i_have_right_to_record?: boolean;
}

export interface Artifact {
  type: string;
  url?: string | null;
  object_key?: string | null;
  mime_type?: string | null;
  canonical_hash?: string | null;
}

export interface JobRecord {
  id: string;
  service: string;
  mode: JobMode;
  status: JobStatus;
  step: string | null;
  input: JobInput;
  artifacts: Artifact[];
  events_cursor: number;
  abort_code: string | null;
  kane_credits: number | null;
  error: string | null;
  error_code: string | null;
  idempotency_key: string | null;
  workflow_id: string | null;
  parent_job_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobEvent {
  job_id: string;
  seq: number;
  ts: string;
  kind: string;
  payload: Record<string, unknown>;
}

export interface KaneRunResult {
  exitCode: number;
  runEnd: Record<string, unknown> | null;
  progress: Array<{ step?: number; status?: string; remark?: string; type?: string }>;
  stdout: string;
  stderr: string;
}

export const TASK_QUEUES = {
  control: "control",
  kane: "kane-chrome",
  media: "media",
} as const;

export const RESULT_ABORT_CODES: Record<number, string> = {
  610: "captcha",
  620: "paywall",
  640: "access_denied",
  650: "error_page",
  660: "login_required",
  550: "controller_auth",
  560: "credits_exhausted",
};

export const ABORT_MESSAGES: Record<string, string> = {
  captcha: "A CAPTCHA is on this page. Kane cannot complete it.",
  paywall: "A paywall is blocking the flow.",
  access_denied: "The site is blocking automated browsers.",
  error_page: "The site returned an error page.",
  login_required: "This tour needs a login and no credentials were provided.",
  mfa: "Multi-factor auth is required.",
  cloudflare_challenge: "A bot challenge is blocking the browser.",
  unreachable: "The site did not load.",
  credits_exhausted: "Kane credits are exhausted.",
  unsupported_ui: "Kane could not operate this UI reliably.",
  capture_failed: "Video capture failed; demo not shipped.",
  controller_auth: "Kane CLI is not authenticated. Run kane-cli login.",
};
