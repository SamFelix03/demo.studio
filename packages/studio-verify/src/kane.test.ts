import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeTestmdRun, parseNdjson } from "./kane.ts";

const TESTMD_STREAM = [
  `{"type":"run_end","status":"passed","final_state":{"url":"http://localhost:5173/"},"run_dir":"/runs/0","credits_consumed":12.5}`,
  `{"type":"test_md_step_start","step_index":"1","heading":"Open generate"}`,
  `{"type":"test_md_step_end","step_index":"1","status":"passed"}`,
  `{"type":"run_end","status":"passed","context":{"memory":{"launch_heading":{"extracted_value":"Ready to record surveys.free"}},"variables":{"default_product":{"value":"surveys.free","type":"memory"}}},"test_url":"https://example.test/share/abc"}`,
  `{"type":"test_md_step_start","step_index":"2","heading":"Access to Launch"}`,
  `{"type":"test_md_step_end","step_index":"2","status":"passed"}`,
  `{"type":"test_md_summary","overall_status":"passed","duration_s":41.2,"steps":2,"retries":0}`,
  `{"type":"test_md_done"}`,
].join("\n");

test("non-JSON progress chatter is ignored, JSON events are kept", () => {
  const events = parseNdjson(`Running on: Desktop\n${TESTMD_STREAM}\nnot json`);
  assert.equal(events.length, 8);
});

test("the file verdict comes from test_md_summary, not the first run_end", () => {
  const failing = TESTMD_STREAM.replace(`"overall_status":"passed"`, `"overall_status":"failed"`);
  assert.equal(summarizeTestmdRun(failing, 1).status, "failed");
  assert.equal(summarizeTestmdRun(TESTMD_STREAM, 0).status, "passed");
});

test("observations are mined from final_state, context.variables and context.memory alike", () => {
  const run = summarizeTestmdRun(TESTMD_STREAM, 0);
  assert.equal(run.observed.launch_heading, "Ready to record surveys.free");
  assert.equal(run.observed.default_product, "surveys.free");
  assert.equal(run.durationS, 41.2);
  assert.equal(run.shareUrl, "https://example.test/share/abc");
  assert.equal(run.runDir, "/runs/0");
});

test("a failed step is named, not numbered", () => {
  const stream = TESTMD_STREAM.replace(
    `{"type":"test_md_step_end","step_index":"2","status":"passed"}`,
    `{"type":"test_md_step_end","step_index":"2","status":"failed","reason":"heading never Ready to record"}`,
  ).replace(`"overall_status":"passed"`, `"overall_status":"failed"`);

  const run = summarizeTestmdRun(stream, 1);
  assert.equal(run.status, "failed");
  assert.equal(run.failedStep, "Access to Launch");
  assert.equal(run.reason, "heading never Ready to record");
});

test("exit 2 and exit 3 are infrastructure errors, never a behavioral failure", () => {
  for (const [code, needle] of [
    [2, "infrastructure"],
    [3, "timed out"],
  ] as const) {
    const run = summarizeTestmdRun(TESTMD_STREAM, code);
    assert.equal(run.status, "error");
    assert.ok(run.infraError?.includes(needle));
  }
});

test("an empty stream is an infrastructure error, not a silent pass", () => {
  const run = summarizeTestmdRun("", 0);
  assert.equal(run.status, "error");
  assert.ok(run.infraError?.includes("no NDJSON"));
});
