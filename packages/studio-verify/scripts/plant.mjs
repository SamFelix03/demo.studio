#!/usr/bin/env node
/**
 * Safe Continue-submit plant: type="submit" and drop onClick={next}.
 * Form onSubmit stays preventDefault-only, so Kane does not POST a Generate job.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const target = join(root, "apps", "studio", "src", "pages", "Home.tsx");
const src = readFileSync(target, "utf8");

const from = `            <button type="button" className="btn-ink-pill" onClick={next}>
              Continue`;
const to = `            <button type="submit" className="btn-ink-pill">
              Continue`;

if (src.includes(to) && !src.includes(from)) {
  process.stdout.write("verify:plant already applied\n");
  process.exit(0);
}
if (!src.includes(from)) {
  process.stderr.write("verify:plant: expected Continue button not found in Home.tsx\n");
  process.exit(1);
}
writeFileSync(target, src.replace(from, to));
process.stdout.write("verify:plant applied — Continue is type=submit with no onClick={next}\n");
process.stdout.write("Do not commit Home.tsx in this state. Run npm run verify:restore when done.\n");
