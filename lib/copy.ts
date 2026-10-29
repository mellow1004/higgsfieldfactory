import Anthropic from "@anthropic-ai/sdk";
import { getStyle } from "./catalog";
import type { AdCopy, BriefInput } from "./types";

function mockCopy(brief: BriefInput): AdCopy {
  const words = brief.message
    .replace(/[.!?].*$/, "")
    .replace(/,/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  const headline = words.length >= 2 ? words.join(" ") : `Meet ${brief.service}`;
  return {
    videoPrompt: [
      `A ${brief.tone} branded video ad for ${brief.brand}.`,
      `Product/service: ${brief.service}.`,
      `Story: ${brief.message}.`,
      getStyle(brief.stylePreset).prompt,
      `${brief.aspectRatio} composition, ${brief.duration} seconds, no on-screen text, no logos, no watermarks.`,
      "Photoreal commercial footage, smooth camera, premium finishing.",
    ].join(" "),
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

export async function writeAdCopy(brief: BriefInput): Promise<{ copy: AdCopy; mocked: boolean }> {
  if (shouldMockCopy()) {
    return { copy: mockCopy(brief), mocked: true };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const message = await client.messages.create({
    model,
    max_tokens: 1200,
    messages: [
      {
        role: "user",
        content: `You write video-ad prompts and on-screen copy for a factory that produces branded ads.

Return ONLY JSON with keys: videoPrompt, eyebrow, headline, tagline, cta.

Rules:
- videoPrompt is a detailed visual prompt for a text-to-video model. No on-screen text, logos, captions, or watermarks in the generated footage (those are burned in later). Include camera, lighting, subject action, setting, and pacing.
- Keep it photoreal unless the style demands otherwise.
- eyebrow: 2–4 word kicker, often the brand or category.
- headline: max 6 words, punchy.
- tagline: max 10 words.
- cta: 2–3 words, button-like (Get started, Shop now, Book a demo).
- Match the tone. Fold the style notes into the video prompt.
- Duration target: ${brief.duration}s. Aspect: ${brief.aspectRatio}. Model: ${brief.model}.

Brand: ${brief.brand}
Service: ${brief.service}
Message: ${brief.message}
Tone: ${brief.tone}
Style: ${getStyle(brief.stylePreset).label} — ${getStyle(brief.stylePreset).prompt}`,
      },
    ],
  });

  const text = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();

  return { copy: extractJson(text), mocked: false };
}
