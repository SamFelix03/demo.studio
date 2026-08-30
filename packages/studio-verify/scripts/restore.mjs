#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const result = spawnSync("git", ["checkout", "--", "apps/studio/src/pages/Home.tsx"], {
  cwd: root,
  encoding: "utf8",
  stdio: "inherit",
});
process.exit(result.status ?? 1);
