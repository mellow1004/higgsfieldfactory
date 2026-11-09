import type { AspectRatio, JobStatus, Resolution } from "./catalog";

export type AdCopy = {
  videoPrompt: string;
  eyebrow: string;
  headline: string;
  tagline: string;
  cta: string;
};

export type Job = {
  id: string;
  createdBy: string;
  brand: string;
  service: string;
  message: string;
  tone: string;
  model: string;
  stylePreset: string;
  aspectRatio: AspectRatio;
  duration: number;
  resolution: Resolution;
  creditCost: number;
  status: JobStatus;
  stage: string;
  videoPrompt: string | null;
  eyebrow: string | null;
  headline: string | null;
  tagline: string | null;
  cta: string | null;
  higgsfieldRequestId: string | null;
  rawVideoPath: string | null;
  finalVideoPath: string | null;
  mocked: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReferenceRole = "start-image" | "brand";

export type JobReference = {
  id: string;
  jobId: string;
  role: ReferenceRole;
  originalName: string;
  mimeType: string;
  filePath: string;
  createdAt: string;
};

export type PublicReference = {
  id: string;
  jobId: string;
  role: ReferenceRole;
  originalName: string;
  mimeType: string;
  url: string;
  isImage: boolean;
};

export type BriefInput = {
  brand: string;
  service: string;
  message: string;
  tone: string;
  model: string;
  stylePreset: string;
  aspectRatio: AspectRatio;
  duration: number;
  resolution: Resolution;
};
