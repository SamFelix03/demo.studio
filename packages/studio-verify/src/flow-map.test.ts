import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFilesToFlows, matchesGlob } from "./flow-map.ts";
import { blastRadius } from "./verify.ts";
import type { VerifyConfig } from "./types.ts";

const FLOW_MAP = {
  "apps/studio/src/pages/Home.tsx": ["landing", "wizard", "validation"],
  "apps/studio/src/pages/Gallery.tsx": ["gallery"],
  "apps/studio/src/App.tsx": ["landing", "gallery"],
  "apps/api/**": ["api_health"],
};

const config = {
  ignore: ["packages/activities/**", "packages/workflows/**", "packages/shared/**", "docs/**", "kane/**", ".studio-verify/**"],
  fallbackFlow: "landing",
  flows: { landing: {}, wizard: {}, validation: {}, gallery: {}, api_health: {} },
} as unknown as VerifyConfig;

test("globs match the paths they claim", () => {
  assert.ok(matchesGlob("apps/api/src/server.ts", "apps/api/**"));
  assert.ok(matchesGlob("apps/studio/src/pages/Home.tsx", "apps/studio/src/pages/Home.tsx"));
  assert.ok(!matchesGlob("apps/studio/src/pages/Home.test.tsx", "apps/studio/src/pages/Home.tsx"));
});

test("Home.tsx drags landing, wizard, and validation", () => {
  const { flows, unmapped } = mapFilesToFlows(["apps/studio/src/pages/Home.tsx"], FLOW_MAP);
  assert.deepEqual(flows, ["landing", "validation", "wizard"]);
  assert.deepEqual(unmapped, []);
});

test("Lane 3 author-path edits do not start a browser", () => {
  const radius = blastRadius(config, FLOW_MAP, [
    "packages/activities/src/kane.ts",
    "packages/workflows/src/index.ts",
    "docs/README.md",
  ]);
  assert.deepEqual(radius.flows, []);
  assert.deepEqual(radius.changed, []);
});

test("an unmapped studio file still forces the landing fallback", () => {
  const radius = blastRadius(config, FLOW_MAP, ["apps/studio/src/pages/NewSurface.tsx"]);
  assert.deepEqual(radius.unmapped, ["apps/studio/src/pages/NewSurface.tsx"]);
  assert.deepEqual(radius.flows, ["landing"]);
});
