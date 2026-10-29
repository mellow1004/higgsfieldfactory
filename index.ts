/**
 * Standalone Seedance 2.5 text-to-video example using the official SDK.
 *
 * Loads HF_CREDENTIALS from .env.local (KEY_ID:KEY_SECRET). Never logs the value.
 *
 *   npx tsx index.ts
 */
import { config as loadEnv } from "dotenv";
import { config, higgsfield } from "@higgsfield/client/v2";

loadEnv({ path: ".env.local" });

const MODEL = "bytedance/seedance-2.5/text-to-video";

function credentialsPresent() {
  return Boolean(process.env.HF_CREDENTIALS?.trim());
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

async function main() {
  if (!credentialsPresent()) {
    console.error(
      "HF_CREDENTIALS is missing. Add KEY_ID:KEY_SECRET to .env.local locally, then re-run npx tsx index.ts.",
    );
    process.exit(1);
  }

  config({
    credentials: process.env.HF_CREDENTIALS,
    maxPollTime: 10 * 60 * 1000,
    pollInterval: 2000,
  });

  const result = await higgsfield.subscribe(MODEL, {
    input: {
      prompt: "A cinematic scene at sunset",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
      output_format: "mp4",
      generate_audio: true,
    },
    withPolling: true,
  });

  const status = String(result.status);

  if (status === "failed") {
    console.error("Generation failed. Not treating this as success.");
    process.exit(1);
  }
  if (status === "canceled") {
    console.error("Generation was canceled. Not treating this as success.");
    process.exit(1);
  }
  if (status === "nsfw") {
    console.error("Request was moderated. Not treating this as success.");
    process.exit(1);
  }
  if (status !== "completed") {
    console.error(`Generation ended with status "${status}". Not treating this as success.`);
    process.exit(1);
  }

  const url = videoUrlFrom(result);
  if (!url) {
    console.error("Request completed but no video URL was returned. Not treating this as success.");
    process.exit(1);
  }

  console.log(url);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  console.error(`Seedance example did not complete: ${message}`);
  process.exit(1);
});
