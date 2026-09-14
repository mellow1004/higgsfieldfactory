import { spawn } from "node:child_process";
import fs from "node:fs";
import type { AspectRatio, Resolution } from "./catalog";

const FONT_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
];

export function frameSize(aspectRatio: AspectRatio, resolution: Resolution) {
  const long = resolution === "1080p" ? 1920 : 1280;
  const short = resolution === "1080p" ? 1080 : 720;
  if (aspectRatio === "16:9") return { width: long, height: short };
  if (aspectRatio === "9:16") return { width: short, height: long };
  return { width: short, height: short };
}

export function fontFile() {
  return FONT_CANDIDATES.find((file) => fs.existsSync(file));
}

export function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg exited ${code}`));
    });
  });
}
