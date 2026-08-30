import type { FlowDelta, Observations } from "./types.ts";

export const VOLATILE_KEYS: ReadonlySet<string> = new Set([
  "url",
  "page_title",
  "session_id",
  "run_id",
  "timestamp",
  "evidence_url",
  "share_url",
]);

export function normalizeValue(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function valuesMatch(a: string, b: string): boolean {
  return normalizeValue(a) === normalizeValue(b);
}

export type CompareOptions = {
  expectedChanges?: string[];
};

export function compareFlow(
  baseline: Observations,
  candidate: Observations,
  protect: string[],
  options: CompareOptions = {},
): FlowDelta[] {
  const expected = new Set(options.expectedChanges ?? []);

  return protect.map((key) => {
    const before = baseline[key] ?? null;
    const afterRaw = candidate[key] ?? null;
    const after = afterRaw === "" ? null : afterRaw;
    const beforeNorm = before === "" ? null : before;

    if (after === null || beforeNorm === null) {
      return { key, baseline: beforeNorm, candidate: after, verdict: "MISSING" as const };
    }
    if (valuesMatch(beforeNorm, after)) {
      return { key, baseline: beforeNorm, candidate: after, verdict: "SAME" as const };
    }
    return {
      key,
      baseline: before,
      candidate: after,
      verdict: expected.has(key) ? ("EXPECTED_CHANGE" as const) : ("UNEXPECTED_CHANGE" as const),
    };
  });
}

export function blockingDeltas(deltas: FlowDelta[]): FlowDelta[] {
  return deltas.filter((delta) => delta.verdict === "UNEXPECTED_CHANGE");
}

export function semanticKeys(observed: Observations): string[] {
  return Object.keys(observed)
    .filter((key) => !VOLATILE_KEYS.has(key))
    .sort();
}
