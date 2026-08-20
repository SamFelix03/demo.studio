import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function applyEnvFile(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

export function loadDotEnv() {
  const seen = new Set<string>();
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (!seen.has(dir)) {
      seen.add(dir);
      applyEnvFile(resolve(dir, ".env"));
      applyEnvFile(resolve(dir, "env.example"));
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}
