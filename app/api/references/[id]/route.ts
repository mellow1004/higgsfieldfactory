import fs from "node:fs";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { deleteReference, getReference } from "@/lib/references";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await context.params;
    const ref = getReference(id);
    if (!ref || !fs.existsSync(ref.filePath)) {
      return NextResponse.json({ error: "Reference not found" }, { status: 404 });
    }
    const data = fs.readFileSync(ref.filePath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": ref.mimeType,
        "Content-Length": String(data.byteLength),
        "Content-Disposition": `inline; filename="${ref.originalName.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await context.params;
    if (!deleteReference(id)) {
      return NextResponse.json({ error: "Reference not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
