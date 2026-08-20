import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

export function startDisplayCapture(outFile: string): { stop: () => Promise<void> } {
  mkdirSync(dirname(outFile), { recursive: true });
  const input = process.env.KANE_FFMPEG_INPUT || (process.platform === "darwin" ? "1:none" : ":0.0");
  const args =
    process.platform === "darwin"
      ? [
          "-y",
          "-f",
          "avfoundation",
          "-framerate",
          "15",
          "-i",
          input,
          "-an",
          "-pix_fmt",
          "yuv420p",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          outFile,
        ]
      : [
          "-y",
          "-f",
          "x11grab",
          "-framerate",
          "15",
          "-i",
          input,
          "-an",
          "-pix_fmt",
          "yuv420p",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          outFile,
        ];
  const child: ChildProcess = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  let exited = false;
  child.on("close", () => {
    exited = true;
  });
  return {
    stop: () =>
      new Promise((resolve) => {
        if (exited || !child.pid) return resolve();
        child.kill("SIGINT");
        const t = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 4000);
        child.on("close", () => {
          clearTimeout(t);
          resolve();
        });
      }),
  };
}

export function captureExists(path: string) {
  return existsSync(path);
}
