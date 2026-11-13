import fs from "node:fs";
import path from "node:path";
import { createHiggsfieldClient } from "@higgsfield/client/v2";
import { coerceDuration, coerceResolution, type AspectRatio, type Resolution } from "./catalog";
import { mediaDir } from "./paths";
import { startImageFor } from "./references";
import { fontFile, frameSize, runFfmpeg } from "./video";

export const SEEDANCE_25_T2V = "bytedance/seedance-2.5/text-to-video";
export const SEEDANCE_25_I2V = "bytedance/seedance-2.5/image-to-video";

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

function videoSettings(input: GenerateInput) {
  const duration = coerceDuration("seedance-2.5", input.duration);
  const resolution = coerceResolution("seedance-2.5", input.resolution);
  const aspect =
    input.aspectRatio === "16:9" || input.aspectRatio === "9:16" || input.aspectRatio === "1:1"
      ? input.aspectRatio
      : "16:9";
  return { duration, resolution, aspect };
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

function authHeader() {
  const key = higgsfieldCredentials();
  if (!key) throw new Error("HF_CREDENTIALS is not set");
  return `Key ${key}`;
}

export async function uploadImageToHiggsfield(filePath: string, contentType: string) {
  const mime = contentType === "image/jpg" ? "image/jpeg" : contentType;
  const created = await fetch("https://api.higgsfield.ai/files/generate-upload-url", {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content_type: mime }),
  });
  const payload = (await created.json()) as {
    public_url?: string;
    upload_url?: string;
    content_type?: string;
    upload_headers?: Record<string, string>;
    detail?: unknown;
  };
  if (!created.ok || !payload.upload_url || !payload.public_url) {
    throw new Error("Could not create a Higgsfield upload URL for the start image.");
  }

  const body = fs.readFileSync(filePath);
  const uploaded = await fetch(payload.upload_url, {
    method: "PUT",
    headers: payload.upload_headers || { "Content-Type": mime },
    body,
  });
  if (!uploaded.ok) {
    throw new Error("Could not upload the start image to Higgsfield storage.");
  }
  return payload.public_url;
}

function assertTerminal(status: string) {
  if (status === "failed") throw new Error("Higgsfield generation failed");
  if (status === "canceled") throw new Error("Higgsfield generation was canceled");
  if (status === "nsfw") throw new Error("Higgsfield moderated the request");
  if (status !== "completed") throw new Error(`Higgsfield ended as ${status}`);
}

export async function generateClip(input: GenerateInput) {
  const outPath = path.join(mediaDir(), `${input.jobId}-raw.mp4`);
  const startImage = startImageFor(input.jobId);
  const { duration, resolution, aspect } = videoSettings(input);

  if (shouldMockGenerate()) {
    await writePlaceholderClip(outPath, input, startImage?.filePath);
    return { path: outPath, requestId: "mock", mocked: true };
  }

  const credentials = higgsfieldCredentials();
  const client = createHiggsfieldClient({
    credentials,
    maxPollTime: 10 * 60 * 1000,
    pollInterval: 2000,
  });

  const result = startImage
    ? await client.subscribe(SEEDANCE_25_I2V, {
        input: {
          prompt: input.prompt,
          duration,
          image_url: await uploadImageToHiggsfield(startImage.filePath, startImage.mimeType),
          resolution,
          generate_audio: true,
        },
        withPolling: true,
      })
    : await client.subscribe(SEEDANCE_25_T2V, {
        input: {
          prompt: input.prompt,
          duration,
          resolution,
          aspect_ratio: aspect,
          output_format: "mp4",
          generate_audio: true,
        },
        withPolling: true,
      });

  assertTerminal(String(result.status));
  const videoUrl = videoUrlFrom(result);
  if (!videoUrl) throw new Error("Higgsfield completed without a video URL");
  await download(videoUrl, outPath);
  return {
    path: outPath,
    requestId: result.request_id || (startImage ? SEEDANCE_25_I2V : SEEDANCE_25_T2V),
    mocked: false,
  };
}

async function writePlaceholderClip(
  outPath: string,
  input: GenerateInput,
  startImagePath?: string,
) {
  const { width, height } = frameSize(input.aspectRatio, input.resolution);
  const font = fontFile();
  const label = font
    ? `drawtext=fontfile=${font}:text='FACTORY MOCK CLIP':fontcolor=0xE0B84C:fontsize=${Math.round(width / 18)}:x=(w-text_w)/2:y=(h-text_h)/2`
    : "null";

  if (startImagePath && fs.existsSync(startImagePath)) {
    try {
      await runFfmpeg([
        "-y",
        "-loop",
        "1",
        "-i",
        startImagePath,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=196:duration=${input.duration}`,
        "-t",
        String(input.duration),
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},${label}`,
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
      return;
    } catch {
      // Fall through to the color placeholder if the still cannot be encoded.
    }
  }

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
