import type { VerifyConfig, VerifyReport } from "./types.ts";
import { blockingDeltas } from "./comparator.ts";

export function formatBlockReason(report: VerifyReport, config: VerifyConfig): string {
  const lines: (string | null)[] = [
    "STUDIO VERIFY BLOCKED COMPLETION",
    "",
    "Kane CLI replayed a committed Studio TestMD flow against localhost and it did not match the trusted baseline.",
    "Repair the application code (not the tests in kane/, not .studio-verify/baseline.json) and end your turn again.",
    "",
  ];

  const unexpected = report.flows.flatMap((flow) =>
    blockingDeltas(flow.deltas).map((delta) => ({ flow, delta })),
  );

  if (unexpected.length) {
    lines.push(
      unexpected.length === 1
        ? "1 unexpected behavioral change:"
        : `${unexpected.length} unexpected behavioral changes:`,
      "",
    );
    for (const { flow, delta } of unexpected) {
      const label = config.flows[flow.flow]?.label ?? flow.flow;
      lines.push(
        `  Flow         ${label} (${flow.flow})`,
        `  Observable   ${delta.key}`,
        `  Known-good   ${delta.baseline}`,
        `  Candidate    ${delta.candidate}`,
      );
      if (flow.shareUrl) lines.push(`  Kane run     ${flow.shareUrl}`);
      if (flow.runDir) lines.push(`  Evidence     ${flow.runDir}`);
      lines.push(`  NDJSON       .studio-verify/runs/verify-${flow.flow}.ndjson`);
      lines.push("");
    }
  }

  const broken = report.flows.filter(
    (flow) => flow.status === "failed" && blockingDeltas(flow.deltas).length === 0,
  );
  for (const flow of broken) {
    const label = config.flows[flow.flow]?.label ?? flow.flow;
    lines.push(
      `${label} no longer passes in a real browser.`,
      flow.failedStep ? `  Failed step  ${flow.failedStep}` : null,
      flow.reason ? `  Kane says    ${flow.reason}` : null,
      flow.shareUrl ? `  Kane run     ${flow.shareUrl}` : null,
      `  NDJSON       .studio-verify/runs/verify-${flow.flow}.ndjson`,
      "",
    );
  }

  lines.push(
    `The requested change — "${report.changeRequest}" — does not authorize this behavior to move.`,
    "",
    "Fix the regression in apps/studio (typically Home.tsx Continue must stay type=\"button\" with onClick={next}).",
    "Do not edit kane/*_test.md to make this pass. Do not rewrite the baseline.",
    "",
    `Attempt ${report.attempt} of ${report.maxAttempts}. See /verified and .studio-verify/last-verify.json.`,
  );

  return lines
    .filter((line): line is string => line !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatSummary(report: VerifyReport, config: VerifyConfig): string {
  const lines: string[] = [];
  const verdict =
    report.verdict === "passed"
      ? "VERIFIED — protected Studio behavior is unchanged"
      : report.verdict === "blocked"
        ? `BLOCKED — ${report.unexpectedCount} unexpected behavioral change(s) or Kane failure`
        : "ERROR — could not verify this build";

  lines.push("", verdict, "");
  lines.push(`  changed files   ${report.changedFiles.length}`);
  lines.push(`  flows replayed  ${report.affectedFlows.join(", ") || "none"}`);
  if (report.unmappedFiles.length) lines.push(`  unmapped files  ${report.unmappedFiles.join(", ")}`);
  if (report.skippedFlows.length) lines.push(`  SKIPPED         ${report.skippedFlows.join(", ")}`);
  lines.push("");

  for (const flow of report.flows) {
    const label = config.flows[flow.flow]?.label ?? flow.flow;
    lines.push(`  ${label}  [${flow.status}]${flow.infraError ? `  ${flow.infraError}` : ""}`);
    if (flow.failedStep) lines.push(`      failed step       ${flow.failedStep}`);
    for (const delta of flow.deltas) {
      const mark =
        delta.verdict === "SAME"
          ? "SAME"
          : delta.verdict === "EXPECTED_CHANGE"
            ? "EXPECTED"
            : delta.verdict === "MISSING"
              ? "MISSING"
              : "UNEXPECTED";
      lines.push(
        `      ${delta.key.padEnd(24)} ${String(delta.baseline).padEnd(28)} → ${String(delta.candidate).padEnd(28)} ${mark}`,
      );
    }
    if (flow.shareUrl) lines.push(`      kane evidence: ${flow.shareUrl}`);
  }

  lines.push("");
  return lines.join("\n");
}
