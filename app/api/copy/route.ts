import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { writeAdCopy } from "@/lib/copy";
import { jsonError } from "@/lib/http";
import { applyCopy, getJob, normalizeBrief, updateJob } from "@/lib/jobs";
import type { BriefInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z
  .object({
    jobId: z.string().optional(),
    brand: z.string().optional(),
    service: z.string().optional(),
    message: z.string().optional(),
    tone: z.string().optional(),
    model: z.string().optional(),
    stylePreset: z.string().optional(),
    aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
    duration: z.number().optional(),
    resolution: z.enum(["720p", "1080p"]).optional(),
  })
  .refine((value) => value.jobId || (value.brand && value.service && value.message), {
    message: "Provide jobId or a full brief",
  });

export async function POST(request: Request) {
  let jobId: string | undefined;
  try {
    await requireSession();
    const body = Body.parse(await request.json());
    jobId = body.jobId;
    const existing = body.jobId ? getJob(body.jobId) : null;
    if (body.jobId && !existing) throw new Error("Job not found");

    const brief: BriefInput = existing
      ? {
          brand: existing.brand,
          service: existing.service,
          message: existing.message,
          tone: existing.tone,
          model: existing.model,
          stylePreset: existing.stylePreset,
          aspectRatio: existing.aspectRatio,
          duration: existing.duration,
          resolution: existing.resolution,
        }
      : normalizeBrief({
          brand: body.brand || "",
          service: body.service || "",
          message: body.message || "",
          tone: body.tone || "confident",
          model: body.model || "kling-3.0-turbo",
          stylePreset: body.stylePreset || "cinematic",
          aspectRatio: body.aspectRatio || "9:16",
          duration: body.duration || 5,
          resolution: body.resolution || "720p",
        });

    const { copy, mocked } = await writeAdCopy(brief);
    const job = existing ? applyCopy(existing.id, copy, mocked) : null;
    return NextResponse.json({ copy, mocked, job });
  } catch (error) {
    if (jobId) {
      try {
        updateJob(jobId, {
          status: "error",
          stage: "Copy failed",
          error: error instanceof Error ? error.message : "Copy failed",
        });
      } catch {
        // ignore secondary logging failures
      }
    }
    return jsonError(error, 400);
  }
}
