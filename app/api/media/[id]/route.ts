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
    const total = data.byteLength;
    const range = request.headers.get("range");
    const common = {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Content-Disposition": `inline; filename="${slug}-${kind}.mp4"`,
      "Cache-Control": "private, no-store",
    };

    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      const start = match ? Number(match[1]) : 0;
      const end = match?.[2] ? Number(match[2]) : total - 1;
      const slice = data.subarray(start, end + 1);
      return new NextResponse(slice, {
        status: 206,
        headers: {
          ...common,
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Content-Length": String(slice.byteLength),
        },
      });
    }

    return new NextResponse(data, {
      headers: {
        ...common,
        "Content-Length": String(total),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
