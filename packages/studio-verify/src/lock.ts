import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "./config.ts";

const LOCK_PATH = join(paths.state, "verify.lock");
const STALE_AFTER_MS = 30 * 60 * 1000;

type Lock = { pid: number; startedAt: string; holder: string };

function readLock(): Lock | null {
  try {
    return JSON.parse(readFileSync(LOCK_PATH, "utf8")) as Lock;
  } catch {
    return null;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export type LockResult = { acquired: true; release: () => void } | { acquired: false; heldBy: string };

export function acquireVerifyLock(holder: string): LockResult {
  const existing = readLock();

  if (existing) {
    const age = Date.now() - new Date(existing.startedAt).getTime();
    const stale = !Number.isFinite(age) || age > STALE_AFTER_MS || !isAlive(existing.pid);
    if (!stale) {
      return { acquired: false, heldBy: `${existing.holder} (pid ${existing.pid}, since ${existing.startedAt})` };
    }
  }

  try {
    mkdirSync(paths.state, { recursive: true });
    const lock: Lock = { pid: process.pid, startedAt: new Date().toISOString(), holder };
    writeFileSync(LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  } catch {
    // If the lock cannot be written, run anyway.
  }

  return {
    acquired: true,
    release: () => {
      try {
        unlinkSync(LOCK_PATH);
      } catch {
        // Already gone.
      }
    },
  };
}
