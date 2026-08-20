import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { Context } from "@temporalio/activity";
import type { KaneRunResult } from "@demo-studio/shared";

export function parseNdjson(stdout: string): KaneRunResult["progress"] {
  const events: KaneRunResult["progress"] = [];
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      events.push(JSON.parse(t));
    } catch {
      /* ignore */
    }
  }
  return events;
}

export function lastRunEnd(events: KaneRunResult["progress"]): Record<string, unknown> | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as Record<string, unknown>;
    if (e.type === "run_end" || e.type === "testrun_done" || e.type === "generate_done") {
      return e;
    }
  }
  return null;
}

const BROWSER_CMDS = new Set(["run", "testmd", "generate"]);

function kaneArgv(args: string[]): string[] {
  let next = [...args];
  const usesCloudChrome = Boolean(process.env.KANE_WS_ENDPOINT);
  const cmd = next[0] === "--local" || next[0] === "--dev" ? next[1] : next[0];
  if (!usesCloudChrome && cmd && BROWSER_CMDS.has(cmd) && !next.includes("--local")) {
    next = ["--local", ...next];
  }
  return next;
}

function kaneEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const home = process.env.HOME || homedir();
  const localBin = `${home}/.local/bin`;
  const path = process.env.PATH ?? "";
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extra,
    KANE_CLI_USER_AGENT: "demo-studio",
    KANE_CLI_SYSTEM_NODE: process.env.KANE_CLI_SYSTEM_NODE ?? "1",
    PATH: path.includes(localBin) ? path : `${localBin}:${path}`,
  };
  if (!process.env.KANE_WS_ENDPOINT) {
    delete env.KANE_USERNAME;
    delete env.KANE_ACCESS_KEY;
  }
  return env;
}

export async function spawnKane(
  args: string[],
  opts?: {
    cwd?: string;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    onEvent?: (ev: Record<string, unknown>) => void;
  },
): Promise<KaneRunResult> {
  const timeoutMs = opts?.timeoutMs ?? 180_000;
  const argv = kaneArgv(args);
  return new Promise((resolve, reject) => {
    const child = spawn("kane-cli", argv, {
      shell: false,
      cwd: opts?.cwd,
      env: kaneEnv(opts?.env),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let lineBuf = "";
    const feed = (chunk: string) => {
      lineBuf += chunk;
      const lines = lineBuf.split("\n");
      lineBuf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("{")) continue;
        try {
          opts?.onEvent?.(JSON.parse(t) as Record<string, unknown>);
        } catch {
          /* ignore partial JSON */
        }
      }
    };
    const killChild = () => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, 3000);
    };
    const timer = setTimeout(killChild, timeoutMs);

    child.stdout.on("data", (buf: Buffer) => {
      const text = buf.toString();
      stdout += text;
      feed(text);
      try {
        Context.current().heartbeat({ stdoutTail: stdout.slice(-500) });
      } catch {
        /* not in activity */
      }
    });
    child.stderr.on("data", (buf: Buffer) => {
      stderr += buf.toString();
      try {
        Context.current().heartbeat({ stderrTail: stderr.slice(-400) });
      } catch {
        /* not in activity */
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (lineBuf.trim().startsWith("{")) {
        try {
          opts?.onEvent?.(JSON.parse(lineBuf.trim()) as Record<string, unknown>);
        } catch {
          /* ignore */
        }
      }
      const progress = parseNdjson(stdout);
      resolve({
        exitCode: code ?? 1,
        runEnd: lastRunEnd(progress),
        progress,
        stdout,
        stderr,
      });
    });
  });
}
