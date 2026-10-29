import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { ASPECT_RATIOS, DURATIONS, MODELS, RESOLUTIONS, STYLE_PRESETS } from "@/lib/catalog";
import { jsonError } from "@/lib/http";
import { createJob, listJobs, publicJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Brief = z.object({
  brand: z.string().min(1),
  service: z.string().min(1),
  message: z.string().min(1),
  tone: z.string().min(1),
  model: z.enum(MODELS.map((model) => model.id) as [string, ...string[]]),
  stylePreset: z.enum(STYLE_PRESETS.map((style) => style.id) as [string, ...string[]]),
  aspectRatio: z.enum(ASPECT_RATIOS),
  duration: z.number().refine((value) => (DURATIONS as readonly number[]).includes(value)),
  resolution: z.enum(RESOLUTIONS),
});

export async function GET() {
  try {
    await requireSession();
    return NextResponse.json({ jobs: listJobs().map(publicJob) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const brief = Brief.parse(await request.json());
    const job = createJob(session.username, brief);
    return NextResponse.json({ job: publicJob(job) });
  } catch (error) {
    return jsonError(error, 400);
  }
}
