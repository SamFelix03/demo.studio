import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function workDir(jobId: string) {
  const dir = join(tmpdir(), "demo-studio", jobId);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, ".testmuai"), { recursive: true });
  return dir;
}
