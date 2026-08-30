/** Semantic observations Kane read out of the real browser, keyed by store-as name. */
export type Observations = Record<string, string>;

export type KaneStatus = "passed" | "failed" | "error";

export type KaneRun = {
  /** Verdict for the whole *_test.md file, from `test_md_summary.overall_status`. */
  status: KaneStatus;
  /** Merged store-as values from every step: final_state, context.variables, context.memory. */
  observed: Observations;
  runDir: string | null;
  shareUrl: string | null;
  durationS: number | null;
  credits: number | null;
  replayed: boolean;
  reason: string | null;
  failedStep: string | null;
  screenshot: string | null;
  exitCode: number;
  /** Set when Kane never produced a verdict (auth, timeout, crash) — never a UI failure. */
  infraError: string | null;
};

export type FlowDeltaVerdict = "SAME" | "UNEXPECTED_CHANGE" | "EXPECTED_CHANGE" | "MISSING";

export type FlowDelta = {
  key: string;
  baseline: string | null;
  candidate: string | null;
  verdict: FlowDeltaVerdict;
};

export type BaselineFlow = {
  test: string;
  status: KaneStatus;
  state: Observations;
  runDir: string | null;
  shareUrl: string | null;
  durationS: number | null;
};

export type Baseline = {
  commit: string;
  createdAt: string;
  flows: Record<string, BaselineFlow>;
};

export type FlowConfig = {
  test: string;
  protect: string[];
  observe: string[];
  risk: "HIGH" | "MED" | "LOW";
  label: string;
};

export type VerifyConfig = {
  studioUrl: string;
  apiUrl: string;
  ignore: string[];
  fallbackFlow: string;
  variablesFile: string;
  perTestTimeoutS: number;
  hookBudgetS: number;
  maxAttempts: number;
  flows: Record<string, FlowConfig>;
};

export type VerifiedFlow = {
  flow: string;
  status: KaneStatus;
  shareUrl: string | null;
  runDir: string | null;
  reason: string | null;
  failedStep: string | null;
  deltas: FlowDelta[];
  infraError: string | null;
};

export type TimelineKind = "change" | "impact" | "verify" | "fail" | "repair" | "proof";

export type TimelineEntry = {
  at: string;
  label: string;
  kind: TimelineKind;
};

export type VerifyReport = {
  startedAt: string;
  finishedAt: string;
  verdict: "passed" | "blocked" | "error";
  changeRequest: string;
  agent: string;
  attempt: number;
  maxAttempts: number;
  changedFiles: string[];
  affectedFlows: string[];
  unmappedFiles: string[];
  skippedFlows: string[];
  flows: VerifiedFlow[];
  unexpectedCount: number;
  timeline: TimelineEntry[];
};
