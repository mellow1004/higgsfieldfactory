import fs from "node:fs";
import path from "node:path";
import { getModel, type AspectRatio, type Resolution } from "./catalog";
import { mediaDir } from "./paths";
import { fontFile, frameSize, runFfmpeg } from "./video";

const TERMINAL = new Set(["completed", "failed", "nsfw", "canceled"]);

export function higgsfieldApiKey() {
  return process.env.HIGGSFIELD_API_KEY?.trim() || "";
}

export function shouldMockGenerate() {
  return process.env.FACTORY_MOCK_GENERATION === "1" || !higgsfieldApiKey();
}

function baseUrl() {
  return (process.env.HIGGSFIELD_API_BASE || "https://platform.higgsfield.ai").replace(/\/$/, "");
}

function authHeaders() {
  const key = higgsfieldApiKey();
  if (!key) throw new Error("HIGGSFIELD_API_KEY is not set");
  const headers: Record<string, string> = {
    Authorization: `Key ${key}`,
    "Content-Type": "application/json",
  };
  const [id, secret] = key.split(":");
  if (id && secret) {
    headers["hf-api-key"] = id;
    headers["hf-secret"] = secret;
  }
  return headers;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GenerateInput = {
  jobId: string;
  prompt: string;
  model: string;
  aspectRatio: AspectRatio;
  duration: number;
  resolution: Resolution;
};

function payloadFor(input: GenerateInput) {
  const model = getModel(input.model);
  if (model.id === "veo-3.1") {
    return {
      prompt: input.prompt,
      duration: String(input.duration),
      resolution: input.resolution === "1080p" ? "1080" : "720",
      aspect_ratio: input.aspectRatio === "1:1" ? "9:16" : input.aspectRatio,
      generate_audio: true,
    };
  }
  if (model.id === "seedance-2.5") {
    return {
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio,
      duration: input.duration,
      resolution: "720p",
      generate_audio: true,
      mode: "t2v",
    };
  }
  return {
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio,
    duration: input.duration,
    resolution: input.resolution,
  };
}

function extractVideoUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const video = obj.video as { url?: string } | undefined;
  if (video?.url) return video.url;
  const videos = obj.videos as { url?: string }[] | undefined;
  if (videos?.[0]?.url) return videos[0].url;
  const images = obj.images as { url?: string }[] | undefined;
  if (images?.[0]?.url?.includes(".mp4")) return images[0].url;
  const jobs = obj.jobs as { results?: { raw?: { url?: string } } }[] | undefined;
  if (jobs?.[0]?.results?.raw?.url) return jobs[0].results.raw.url;
  return null;
}

async function higgsfieldFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers || {}) },
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const detail =
      typeof json === "object" && json && "detail" in json
        ? JSON.stringify((json as { detail: unknown }).detail)
        : text.slice(0, 800);
    throw new Error(`Higgsfield ${response.status}: ${detail || response.statusText}`);
  }
  return json as Record<string, unknown>;
}

async function submit(input: GenerateInput) {
  const model = getModel(input.model);
  const body = JSON.stringify(payloadFor(input));
  const bases = [baseUrl(), "https://api.higgsfield.ai"].filter(
    (value, index, all) => all.indexOf(value) === index,
  );
  let lastError: Error | null = null;
  for (const root of bases) {
    try {
      return await higgsfieldFetch(`${root}/${model.endpoint}`, {
        method: "POST",
        body,
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError || new Error("Higgsfield submit failed");
}

async function poll(statusUrl: string) {
  let delay = 2000;
  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    const result = await higgsfieldFetch(statusUrl);
    const status = String(result.status || "");
    if (TERMINAL.has(status)) return result;
    await sleep(delay);
    delay = Math.min(Math.round(delay * 1.5), 10000);
  }
  throw new Error("Higgsfield generation timed out");
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

  const submitted = await submit(input);
  const requestId = String(submitted.request_id || "");
  const statusUrl =
    String(submitted.status_url || "") ||
    `${baseUrl()}/requests/${requestId}/status`;
  if (!requestId && !submitted.status_url) {
    throw new Error("Higgsfield did not return a request_id");
  }

  const finished = await poll(statusUrl);
  if (finished.status !== "completed") {
    const reason =
      typeof finished.error === "string"
        ? finished.error
        : `Higgsfield ended as ${finished.status}`;
    throw new Error(reason);
  }

  const videoUrl = extractVideoUrl(finished);
  if (!videoUrl) throw new Error("Higgsfield completed without a video URL");
  await download(videoUrl, outPath);
  return { path: outPath, requestId, mocked: false };
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
