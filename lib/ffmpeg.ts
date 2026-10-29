import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AspectRatio, Resolution } from "./catalog";
import { mediaDir } from "./paths";
import type { Job } from "./types";
import { fontFile, frameSize, runFfmpeg } from "./video";

export { runFfmpeg };

function escapeDrawtext(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\u2019")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\r?\n/g, " ")
    .slice(0, 80);
}

export async function ensureLogoPng() {
  const out = path.join(mediaDir(), "logo.png");
  if (fs.existsSync(out)) return out;
  const font = fontFile();
  const draw = font
    ? `drawtext=fontfile=${font}:text='HF':fontcolor=0xE0B84C:fontsize=140:x=(w-text_w)/2:y=(h-text_h)/2`
    : "drawbox=x=110:y=110:w=100:h=100:color=0xE0B84C:t=fill";
  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x14140f:s=320x320:d=0.04",
    "-vf",
    `drawbox=x=18:y=18:w=284:h=284:color=0xE0B84C:t=8,${draw}`,
    "-frames:v",
    "1",
    out,
  ]);
  return out;
}

function wrapLines(text: string, maxChars: number, maxLines = 2) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines) {
      current = "";
      break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.slice(0, maxLines).map((line) => line.slice(0, maxChars));
}

function fitFont(text: string, width: number, desired: number) {
  const estimated = Math.floor((width * 0.86) / Math.max(text.length, 1) / 0.58);
  return Math.max(16, Math.min(desired, estimated));
}

function drawLayer(
  text: string,
  y: number,
  fontSize: number,
  font: string | undefined,
) {
  const escaped = escapeDrawtext(text);
  if (!escaped) return null;
  const fontPart = font ? `fontfile=${font}:` : "";
  return `drawtext=${fontPart}text='${escaped}':fontsize=${fontSize}:fontcolor=white:borderw=2:bordercolor=black@0.55:x=(w-text_w)/2:y=${y}`;
}

export async function composeAd(job: Job) {
  if (!job.rawVideoPath || !fs.existsSync(job.rawVideoPath)) {
    throw new Error("Raw clip is missing — generate first");
  }

  const { width, height } = frameSize(
    job.aspectRatio as AspectRatio,
    job.resolution as Resolution,
  );
  const font = fontFile();
  const logo = await ensureLogoPng();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "hf-compose-"));
  const branded = path.join(work, "branded.mp4");
  const endcard = path.join(work, "endcard.mp4");
  const silentMain = path.join(work, "branded-a.mp4");
  const finalPath = path.join(mediaDir(), `${job.id}-final.mp4`);
  const logoSize = Math.round(Math.min(width, height) * 0.11);
  const maxChars = Math.max(12, Math.floor(width / 28));
  const eyebrowSize = fitFont(job.eyebrow || job.brand, width, Math.round(height * 0.032));
  const headlineSize = Math.round(height * 0.042);
  const tagSize = fitFont(job.tagline || job.service, width, Math.round(height * 0.03));
  const ctaSize = fitFont(job.cta || "Learn more", width, Math.round(height * 0.034));
  let cursorY = logoSize + 36;
  const overlays: string[] = [];

  for (const line of wrapLines(job.eyebrow || job.brand, maxChars, 1)) {
    const layer = drawLayer(line, cursorY, eyebrowSize, font);
    if (layer) overlays.push(layer);
    cursorY += eyebrowSize + 10;
  }
  for (const line of wrapLines(job.headline || job.brand, maxChars, 2)) {
    const size = fitFont(line, width, headlineSize);
    const layer = drawLayer(line, cursorY, size, font);
    if (layer) overlays.push(layer);
    cursorY += size + 8;
  }

  const tagLines = wrapLines(job.tagline || job.service, maxChars, 2);
  const ctaY = Math.round(height * 0.88);
  let tagY = ctaY - tagLines.length * (tagSize + 8) - 12;
  for (const line of tagLines) {
    const layer = drawLayer(line, tagY, tagSize, font);
    if (layer) overlays.push(layer);
    tagY += tagSize + 8;
  }
  const cta = drawLayer(job.cta || "Learn more", ctaY, ctaSize, font);
  if (cta) overlays.push(cta);

  const videoFilter = [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    ...overlays,
  ].join(",");

  await runFfmpeg([
    "-y",
    "-i",
    job.rawVideoPath,
    "-i",
    logo,
    "-filter_complex",
    `[0:v]${videoFilter}[base];[1:v]scale=${logoSize}:${logoSize}[logo];[base][logo]overlay=24:24[v]`,
    "-map",
    "[v]",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-shortest",
    "-movflags",
    "+faststart",
    branded,
  ]);

  const brandLines = wrapLines(job.brand, maxChars, 2);
  const brandSize = fitFont(job.brand, width, Math.round(height * 0.055));
  const endCtaSize = fitFont(job.cta || "Get started", width, Math.round(height * 0.038));
  const brandBlock = brandLines.length * (brandSize + 10);
  let endY = Math.round((height - brandBlock) / 2 - 20);
  const endDraw = [
    ...brandLines.map((line) => {
      const layer = drawLayer(line, endY, brandSize, font);
      endY += brandSize + 10;
      return layer;
    }),
    drawLayer(job.cta || "Get started", endY + 16, endCtaSize, font),
  ]
    .filter(Boolean)
    .join(",");

  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x0c0c0a:s=${width}x${height}:d=2.5:r=24`,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-vf",
    endDraw || "null",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-shortest",
    endcard,
  ]);

  await runFfmpeg([
    "-y",
    "-i",
    branded,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-shortest",
    silentMain,
  ]).catch(() => fs.copyFileSync(branded, silentMain));

  await runFfmpeg([
    "-y",
    "-i",
    silentMain,
    "-i",
    endcard,
    "-filter_complex",
    "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]",
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    finalPath,
  ]).catch(async () => {
    await runFfmpeg([
      "-y",
      "-i",
      branded,
      "-i",
      endcard,
      "-filter_complex",
      "[0:v][1:v]concat=n=2:v=1:a=0[v]",
      "-map",
      "[v]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-an",
      "-movflags",
      "+faststart",
      finalPath,
    ]);
  });

  fs.rmSync(work, { recursive: true, force: true });
  return finalPath;
}
