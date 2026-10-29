import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { generateClip } from "@/lib/higgsfield";
import { jsonError } from "@/lib/http";
import { getJob, publicJob, updateJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 600;

const Body = z.object({ jobId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    await requireSession();
    const { jobId } = Body.parse(await request.json());
    const job = getJob(jobId);
    if (!job) throw new Error("Job not found");
    if (!job.videoPrompt) throw new Error("Write copy before generating a clip");

    updateJob(jobId, {
      status: "generating",
      stage: "Generating clip",
      error: null,
    });

    try {
      const result = await generateClip({
        jobId: job.id,
        prompt: job.videoPrompt,
        model: job.model,
        aspectRatio: job.aspectRatio,
        duration: job.duration,
        resolution: job.resolution,
      });
      const next = updateJob(jobId, {
        status: "generating",
        stage: "Clip ready",
        rawVideoPath: result.path,
        higgsfieldRequestId: result.requestId,
        mocked: result.mocked || job.mocked ? 1 : 0,
      });
      return NextResponse.json({
        job: publicJob(next),
        mocked: result.mocked,
        requestId: result.requestId,
      });
    } catch (error) {
      updateJob(jobId, {
        status: "error",
        stage: "Generate failed",
        error: error instanceof Error ? error.message : "Generate failed",
      });
      throw error;
    }
  } catch (error) {
    return jsonError(error, 400);
  }
}
