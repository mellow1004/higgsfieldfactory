import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { getStyle } from "./catalog";
import { isImageMime } from "./references";
import type { AdCopy, BriefInput, JobReference } from "./types";

const CLAUDE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function mockCopy(brief: BriefInput, refs: JobReference[] = []): AdCopy {
  const words = brief.message
    .replace(/[.!?].*$/, "")
    .replace(/,/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  const headline = words.length >= 2 ? words.join(" ") : `Meet ${brief.service}`;
  const brandNames = refs
    .filter((ref) => ref.role === "brand")
    .map((ref) => ref.originalName);
  const hasStart = refs.some((ref) => ref.role === "start-image");
  return {
    videoPrompt: [
      `A ${brief.tone} branded video ad for ${brief.brand}.`,
      `Product/service: ${brief.service}.`,
      `Story: ${brief.message}.`,
      getStyle(brief.stylePreset).prompt,
      brandNames.length
        ? `Match the look of these brand/inspiration files: ${brandNames.join(", ")}.`
        : "",
      hasStart
        ? "Animate from the provided start image; keep the subject and framing, add cinematic motion."
        : "",
      `${brief.aspectRatio} composition, ${brief.duration} seconds, no on-screen text, no logos, no watermarks.`,
      "Photoreal commercial footage, smooth camera, premium finishing.",
    ]
      .filter(Boolean)
      .join(" "),
    eyebrow: brief.brand.toUpperCase().slice(0, 22),
    headline,
    tagline: brief.service.slice(0, 36),
    cta: "Shop now",
  };
}

function extractJson(text: string): AdCopy {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Copy model did not return JSON");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<AdCopy>;
  if (!parsed.videoPrompt || !parsed.headline || !parsed.cta) {
    throw new Error("Copy JSON missing required fields");
  }
  return {
    videoPrompt: String(parsed.videoPrompt),
    eyebrow: String(parsed.eyebrow || ""),
    headline: String(parsed.headline),
    tagline: String(parsed.tagline || ""),
    cta: String(parsed.cta),
  };
}

export function shouldMockCopy() {
  return process.env.FACTORY_MOCK_GENERATION === "1" || !process.env.ANTHROPIC_API_KEY;
}

type ImageBlock = {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string;
  };
};

function imageBlock(ref: JobReference): ImageBlock | null {
  const mime = ref.mimeType === "image/jpg" ? "image/jpeg" : ref.mimeType;
  if (!CLAUDE_IMAGE_TYPES.has(mime) || !fs.existsSync(ref.filePath)) return null;
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mime as ImageBlock["source"]["media_type"],
      data: fs.readFileSync(ref.filePath).toString("base64"),
    },
  };
}

export async function writeAdCopy(
  brief: BriefInput,
  refs: JobReference[] = [],
): Promise<{ copy: AdCopy; mocked: boolean }> {
  if (shouldMockCopy()) {
    return { copy: mockCopy(brief, refs), mocked: true };
  }

  const brandRefs = refs.filter((ref) => ref.role === "brand");
  const startRefs = refs.filter((ref) => ref.role === "start-image");
  const content: Array<ImageBlock | { type: "text"; text: string }> = [];

  for (const ref of [...brandRefs, ...startRefs].slice(0, 6)) {
    const block = imageBlock(ref);
    if (block) content.push(block);
  }

  const brandList = brandRefs
    .map((ref) => `- ${ref.originalName} (${ref.mimeType})`)
    .join("\n");
  const otherFiles = brandRefs
    .filter((ref) => !isImageMime(ref.mimeType))
    .map((ref) => ref.originalName);

  content.push({
    type: "text",
    text: `You write video-ad prompts and on-screen copy for a factory that produces branded ads.

Return ONLY JSON with keys: videoPrompt, eyebrow, headline, tagline, cta.

Rules:
- videoPrompt is a detailed visual prompt. No on-screen text, logos, captions, or watermarks in the generated footage (those are burned in later). Include camera, lighting, subject action, setting, and pacing.
- Keep it photoreal unless the style or brand references demand otherwise.
- eyebrow: 2–4 word kicker, often the brand or category.
- headline: max 6 words, punchy.
- tagline: max 10 words.
- cta: 2–3 words, button-like (Get started, Shop now, Book a demo).
- Match the tone. Fold the style notes into the video prompt.
- Duration target: ${brief.duration}s. Aspect: ${brief.aspectRatio}. Model: ${brief.model}.
${
  brandRefs.length
    ? `- Images attached above are Brand/inspiration references. Match their colors, typography mood, lighting, and overall look in both copy and videoPrompt.
- Brand/inspiration files: ${brandList}${
        otherFiles.length ? `\n- Non-image brand files (use names/context only): ${otherFiles.join(", ")}` : ""
      }`
    : ""
}
${
  startRefs.length
    ? `- A start image is also attached. The clip will be image-to-video from that frame. Write videoPrompt as a motion/camera prompt that preserves the subject and composition of that image.`
    : ""
}

Brand: ${brief.brand}
Service: ${brief.service}
Instructions: ${brief.message}
Tone: ${brief.tone}
Style: ${getStyle(brief.stylePreset).label} — ${getStyle(brief.stylePreset).prompt}`,
  });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const message = await client.messages.create({
    model,
    max_tokens: 1200,
    messages: [{ role: "user", content }],
  });

  const text = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();

  return { copy: extractJson(text), mocked: false };
}
