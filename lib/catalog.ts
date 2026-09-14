export const MODELS = [
  {
    id: "kling-3.0-turbo",
    label: "Kling 3.0 Turbo",
    endpoint: "kling3_0_turbo",
    description: "Fast drafts, 3–15s, up to 1080p",
    creditsPer5s: { "720p": 6, "1080p": 10 },
    aspects: ["16:9", "9:16", "1:1"] as const,
    durations: [5, 10] as const,
    maxResolution: "1080p" as const,
  },
  {
    id: "seedance-2.5",
    label: "Seedance 2.5",
    endpoint: "seedance_2_5",
    description: "Reference-driven cinematic clips, capped at 720p",
    creditsPer5s: { "720p": 12, "1080p": 12 },
    aspects: ["16:9", "9:16", "1:1"] as const,
    durations: [4, 5, 6, 8, 10] as const,
    maxResolution: "720p" as const,
  },
  {
    id: "veo-3.1",
    label: "Veo 3.1",
    endpoint: "veo3.1",
    description: "Google Veo, 4/6/8s, 16:9 or 9:16",
    creditsPer5s: { "720p": 18, "1080p": 28 },
    aspects: ["16:9", "9:16"] as const,
    durations: [4, 6, 8] as const,
    maxResolution: "1080p" as const,
  },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];
export type AspectRatio = "16:9" | "9:16" | "1:1";
export type Resolution = "720p" | "1080p";

export const STYLE_PRESETS = [
  {
    id: "cinematic",
    label: "Cinematic",
    prompt:
      "cinematic lighting, anamorphic bokeh, motivated camera move, filmic color grade, shallow depth of field",
  },
  {
    id: "product-studio",
    label: "Product studio",
    prompt:
      "clean studio product film, controlled lighting, slow orbit, reflective surfaces, commercial precision",
  },
  {
    id: "lifestyle",
    label: "Lifestyle",
    prompt:
      "natural daylight lifestyle, handheld-but-stable, authentic people, warm practicals, editorial pacing",
  },
  {
    id: "ugc",
    label: "UGC handheld",
    prompt:
      "vertical-native UGC, slight handheld energy, phone-cam realism, tight product inserts, social-first framing",
  },
  {
    id: "luxury",
    label: "Luxury editorial",
    prompt:
      "luxury editorial, high-contrast lighting, slow push-in, tactile textures, restrained motion, gold and shadow",
  },
  {
    id: "documentary",
    label: "Documentary",
    prompt:
      "observational documentary, available light, grounded realism, unhurried cuts, quiet confidence",
  },
] as const;

export type StylePresetId = (typeof STYLE_PRESETS)[number]["id"];

export const TONES = [
  "confident",
  "warm",
  "playful",
  "urgent",
  "calm",
  "premium",
] as const;

export type Tone = (typeof TONES)[number];

export const ASPECT_RATIOS: AspectRatio[] = ["16:9", "9:16", "1:1"];
export const RESOLUTIONS: Resolution[] = ["720p", "1080p"];
export const DURATIONS = [4, 5, 6, 8, 10] as const;

export function getModel(id: string) {
  return MODELS.find((model) => model.id === id) ?? MODELS[0];
}

export function getStyle(id: string) {
  return STYLE_PRESETS.find((style) => style.id === id) ?? STYLE_PRESETS[0];
}

export function coerceDuration(modelId: string, duration: number) {
  const model = getModel(modelId);
  const allowed = model.durations as readonly number[];
  if (allowed.includes(duration)) return duration;
  return allowed.reduce((best, value) =>
    Math.abs(value - duration) < Math.abs(best - duration) ? value : best,
  );
}

export function coerceAspect(modelId: string, aspect: AspectRatio): AspectRatio {
  const model = getModel(modelId);
  if ((model.aspects as readonly string[]).includes(aspect)) return aspect;
  return model.aspects[0];
}

export function coerceResolution(modelId: string, resolution: Resolution): Resolution {
  const model = getModel(modelId);
  if (resolution === "1080p" && model.maxResolution === "720p") return "720p";
  return resolution;
}

export function estimateCredits(input: {
  modelId: string;
  duration: number;
  resolution: Resolution;
}) {
  const model = getModel(input.modelId);
  const duration = coerceDuration(model.id, input.duration);
  const resolution = coerceResolution(model.id, input.resolution);
  const per5 = model.creditsPer5s[resolution];
  return Math.max(1, Math.ceil(per5 * (duration / 5)));
}

export const JOB_STATUSES = ["queued", "generating", "done", "error"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
