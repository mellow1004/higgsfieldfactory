import fs from "node:fs";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { getJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await context.params;
    const job = getJob(id);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const kind = new URL(request.url).searchParams.get("kind") === "raw" ? "raw" : "final";
    const filePath = kind === "raw" ? job.rawVideoPath : job.finalVideoPath;
    if (!filePath || !fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Video not ready" }, { status: 404 });
    }

    const data = fs.readFileSync(filePath);
    const slug = job.brand.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "ad";
    return new NextResponse(data, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(data.byteLength),
        "Content-Disposition": `inline; filename="${slug}-${kind}.mp4"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
