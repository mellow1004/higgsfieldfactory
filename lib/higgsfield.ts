import fs from "node:fs";
import path from "node:path";
import { createHiggsfieldClient } from "@higgsfield/client/v2";
import { coerceDuration, coerceResolution, type AspectRatio, type Resolution } from "./catalog";
import { mediaDir } from "./paths";
import { fontFile, frameSize, runFfmpeg } from "./video";

export const SEEDANCE_25_T2V = "bytedance/seedance-2.5/text-to-video";

export function higgsfieldCredentials() {
  return process.env.HF_CREDENTIALS?.trim() || "";
}

export function shouldMockGenerate() {
  return process.env.FACTORY_MOCK_GENERATION === "1" || !higgsfieldCredentials();
}

type GenerateInput = {
  jobId: string;
  prompt: string;
  model: string;
  aspectRatio: AspectRatio;
  duration: number;
  resolution: Resolution;
};

function seedanceInput(input: GenerateInput) {
  const duration = coerceDuration("seedance-2.5", input.duration);
  const resolution = coerceResolution("seedance-2.5", input.resolution);
  const aspect =
    input.aspectRatio === "16:9" || input.aspectRatio === "9:16" || input.aspectRatio === "1:1"
      ? input.aspectRatio
      : "16:9";
  return {
    prompt: input.prompt,
    duration,
    resolution,
    aspect_ratio: aspect,
    output_format: "mp4" as const,
    generate_audio: true,
  };
}

function videoUrlFrom(result: {
  status: string;
  video?: { url?: string };
  images?: { url?: string }[];
}) {
  if (result.video?.url) return result.video.url;
  const imageUrl = result.images?.[0]?.url;
  if (imageUrl?.includes(".mp4")) return imageUrl;
  return null;
}

async function download(url: string, destination: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download mp4 (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, buffer);
}

export async function generateClip(input: GenerateInput) {
  const outPath = path.join(mediaDir(), `${input.jobId}-raw.mp4`);
  if (shouldMockGenerate()) {
    await writePlaceholderClip(outPath, input);
    return { path: outPath, requestId: "mock", mocked: true };
  }

  const credentials = higgsfieldCredentials();
  const client = createHiggsfieldClient({
    credentials,
    maxPollTime: 10 * 60 * 1000,
    pollInterval: 2000,
  });

  const result = await client.subscribe(SEEDANCE_25_T2V, {
    input: seedanceInput(input),
    withPolling: true,
  });

  const status = String(result.status);
  if (status === "failed") {
    throw new Error("Higgsfield generation failed");
  }
  if (status === "canceled") {
    throw new Error("Higgsfield generation was canceled");
  }
  if (status === "nsfw") {
    throw new Error("Higgsfield moderated the request");
  }
  if (status !== "completed") {
    throw new Error(`Higgsfield ended as ${status}`);
  }

  const videoUrl = videoUrlFrom(result);
  if (!videoUrl) throw new Error("Higgsfield completed without a video URL");
  await download(videoUrl, outPath);
  return {
    path: outPath,
    requestId: result.request_id || SEEDANCE_25_T2V,
    mocked: false,
  };
}

async function writePlaceholderClip(outPath: string, input: GenerateInput) {
  const { width, height } = frameSize(input.aspectRatio, input.resolution);
  const font = fontFile();
  const label = font
    ? `drawtext=fontfile=${font}:text='FACTORY MOCK CLIP':fontcolor=0xE0B84C:fontsize=${Math.round(width / 18)}:x=(w-text_w)/2:y=(h-text_h)/2`
    : "null";
  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x1a1710:s=${width}x${height}:d=${input.duration}:r=24`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=196:duration=${input.duration}`,
    "-vf",
    `drawbox=x=0:y=0:w=${width}:h=${height}:color=0xE0B84C@0.12:t=fill,${label}`,
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
    outPath,
  ]);
}

