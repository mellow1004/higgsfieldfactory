import { randomUUID } from "node:crypto";
import {
  coerceAspect,
  coerceDuration,
  coerceResolution,
  estimateCredits,
  type AspectRatio,
  type JobStatus,
  type Resolution,
} from "./catalog";
import { getDb } from "./db";
import type { AdCopy, BriefInput, Job } from "./types";

type JobRow = {
  id: string;
  created_by: string;
  brand: string;
  service: string;
  message: string;
  tone: string;
  model: string;
  style_preset: string;
  aspect_ratio: AspectRatio;
  duration: number;
  resolution: Resolution;
  credit_cost: number;
  status: JobStatus;
  stage: string;
  video_prompt: string | null;
  eyebrow: string | null;
  headline: string | null;
  tagline: string | null;
  cta: string | null;
  higgsfield_request_id: string | null;
  raw_video_path: string | null;
  final_video_path: string | null;
  mocked: number;
  error: string | null;
  created_at: string;
  updated_at: string;
};

function mapJob(row: JobRow): Job {
  return {
    id: row.id,
    createdBy: row.created_by,
    brand: row.brand,
    service: row.service,
    message: row.message,
    tone: row.tone,
    model: row.model,
    stylePreset: row.style_preset,
    aspectRatio: row.aspect_ratio,
    duration: row.duration,
    resolution: row.resolution,
    creditCost: row.credit_cost,
    status: row.status,
    stage: row.stage,
    videoPrompt: row.video_prompt,
    eyebrow: row.eyebrow,
    headline: row.headline,
    tagline: row.tagline,
    cta: row.cta,
    higgsfieldRequestId: row.higgsfield_request_id,
    rawVideoPath: row.raw_video_path,
    finalVideoPath: row.final_video_path,
    mocked: row.mocked,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeBrief(input: BriefInput): BriefInput {
  const brand = input.brand.trim();
  const service = input.service.trim();
  const message = input.message.trim();
  if (!brand || !service || !message) {
    throw new Error("Brand, service, and message are required.");
  }
  return {
    brand,
    service,
    message,
    tone: input.tone.trim() || "confident",
    model: input.model,
    stylePreset: input.stylePreset,
    aspectRatio: coerceAspect(input.model, input.aspectRatio),
    duration: coerceDuration(input.model, Number(input.duration)),
    resolution: coerceResolution(input.model, input.resolution),
  };
}

export function createJob(createdBy: string, input: BriefInput) {
  const brief = normalizeBrief(input);
  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    createdBy,
    ...brief,
    creditCost: estimateCredits({
      modelId: brief.model,
      duration: brief.duration,
      resolution: brief.resolution,
    }),
    status: "queued",
    stage: "Queued",
    videoPrompt: null,
    eyebrow: null,
    headline: null,
    tagline: null,
    cta: null,
    higgsfieldRequestId: null,
    rawVideoPath: null,
    finalVideoPath: null,
    mocked: 0,
    error: null,
    createdAt: now,
    updatedAt: now,
  };

  getDb()
    .prepare(
      `INSERT INTO jobs (
        id, created_by, brand, service, message, tone, model, style_preset,
        aspect_ratio, duration, resolution, credit_cost, status, stage,
        mocked, created_at, updated_at
      ) VALUES (
        @id, @createdBy, @brand, @service, @message, @tone, @model, @stylePreset,
        @aspectRatio, @duration, @resolution, @creditCost, @status, @stage,
        @mocked, @createdAt, @updatedAt
      )`,
    )
    .run(job);

  return job;
}

export function listJobs(limit = 40) {
  const rows = getDb()
    .prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?")
    .all(limit) as JobRow[];
  return rows.map(mapJob);
}

export function getJob(id: string) {
  const row = getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as
    | JobRow
    | undefined;
  return row ? mapJob(row) : null;
}

export function updateJob(
  id: string,
  patch: Partial<
    Pick<
      Job,
      | "status"
      | "stage"
      | "videoPrompt"
      | "eyebrow"
      | "headline"
      | "tagline"
      | "cta"
      | "higgsfieldRequestId"
      | "rawVideoPath"
      | "finalVideoPath"
      | "mocked"
      | "error"
    >
  >,
) {
  const current = getJob(id);
  if (!current) throw new Error("Job not found");
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `UPDATE jobs SET
        status = @status,
        stage = @stage,
        video_prompt = @videoPrompt,
        eyebrow = @eyebrow,
        headline = @headline,
        tagline = @tagline,
        cta = @cta,
        higgsfield_request_id = @higgsfieldRequestId,
        raw_video_path = @rawVideoPath,
        final_video_path = @finalVideoPath,
        mocked = @mocked,
        error = @error,
        updated_at = @updatedAt
      WHERE id = @id`,
    )
    .run(next);
  return next;
}

export function applyCopy(jobId: string, copy: AdCopy, mocked = false) {
  return updateJob(jobId, {
    videoPrompt: copy.videoPrompt,
    eyebrow: copy.eyebrow,
    headline: copy.headline,
    tagline: copy.tagline,
    cta: copy.cta,
    mocked: mocked ? 1 : 0,
    status: "generating",
    stage: "Copy ready",
    error: null,
  });
}

export function publicJob(job: Job) {
  return {
    ...job,
    videoUrl: job.finalVideoPath ? `/api/media/${job.id}?kind=final` : null,
    rawVideoUrl: job.rawVideoPath ? `/api/media/${job.id}?kind=raw` : null,
  };
}
