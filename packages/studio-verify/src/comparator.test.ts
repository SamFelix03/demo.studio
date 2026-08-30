import { test } from "node:test";
import assert from "node:assert/strict";
import { compareFlow, blockingDeltas, normalizeValue, semanticKeys } from "./comparator.ts";

test("an untouched observable reads SAME", () => {
  const deltas = compareFlow({ launch_heading: "Ready to record surveys.free" }, { launch_heading: "Ready to record surveys.free" }, [
    "launch_heading",
  ]);
  assert.equal(deltas[0].verdict, "SAME");
});

test("Continue-submit plant surfaces as an unexpected change when heading moves", () => {
  const baseline = { launch_heading: "Ready to record surveys.free", wizard_url: "http://localhost:5173/" };
  const candidate = { launch_heading: "Sign-in only if the demo needs it", wizard_url: "http://localhost:5173/" };

  const deltas = compareFlow(baseline, candidate, Object.keys(baseline));
  const blocking = blockingDeltas(deltas);

  assert.equal(blocking.length, 1);
  assert.equal(blocking[0].key, "launch_heading");
});

test("a blank candidate is MISSING, not an unexpected empty string", () => {
  const deltas = compareFlow({ wizard_url: "http://localhost:5173/" }, { wizard_url: "" }, ["wizard_url"]);
  assert.equal(deltas[0].verdict, "MISSING");
  assert.equal(blockingDeltas(deltas).length, 0);
});

test("an observable the candidate never saw is MISSING, not SAME", () => {
  const deltas = compareFlow({ launch_heading: "Ready to record surveys.free" }, {}, ["launch_heading"]);
  assert.equal(deltas[0].verdict, "MISSING");
});

test("DOM whitespace noise is normalized", () => {
  assert.equal(normalizeValue("  Ready to record  "), "Ready to record");
  assert.equal(
    compareFlow({ t: "Ready to record" }, { t: " Ready to record " }, ["t"])[0].verdict,
    "SAME",
  );
});

test("run bookkeeping is excluded from the semantic view", () => {
  assert.deepEqual(semanticKeys({ url: "x", page_title: "y", launch_heading: "Ready" }), ["launch_heading"]);
});
