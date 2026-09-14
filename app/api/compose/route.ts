import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { composeAd } from "@/lib/ffmpeg";
import { jsonError } from "@/lib/http";
import { getJob, publicJob, updateJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 180;

const Body = z.object({ jobId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    await requireSession();
    const { jobId } = Body.parse(await request.json());
    const job = getJob(jobId);
    if (!job) throw new Error("Job not found");

    updateJob(jobId, {
      status: "generating",
      stage: "Composing overlays",
      error: null,
    });

    try {
      const finalPath = await composeAd(job);
      const next = updateJob(jobId, {
        status: "done",
        stage: "Done",
        finalVideoPath: finalPath,
      });
      return NextResponse.json({ job: publicJob(next), videoUrl: publicJob(next).videoUrl });
    } catch (error) {
      updateJob(jobId, {
        status: "error",
        stage: "Compose failed",
        error: error instanceof Error ? error.message : "Compose failed",
      });
      throw error;
    }
  } catch (error) {
    return jsonError(error, 400);
  }
}
