import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { getJob } from "@/lib/jobs";
import { listReferences, publicReference, saveJobReferences } from "@/lib/references";
import type { ReferenceRole } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await context.params;
    if (!getJob(id)) throw new Error("Job not found");
    return NextResponse.json({ references: listReferences(id).map(publicReference) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await context.params;
    if (!getJob(id)) throw new Error("Job not found");

    const form = await request.formData();
    const files = form.getAll("files");
    const roles = form.getAll("roles").map((value) => String(value));
    if (files.length === 0) {
      throw new Error("No files uploaded");
    }
    if (files.length !== roles.length) {
      throw new Error("Each file needs a role (start-image or brand).");
    }

    const payload = [];
    for (let index = 0; index < files.length; index += 1) {
      const entry = files[index];
      if (typeof entry === "string" || !entry) {
        throw new Error("Invalid file upload");
      }
      const file = entry as File;
      const role = roles[index] as ReferenceRole;
      if (role !== "start-image" && role !== "brand") {
        throw new Error("Role must be start-image or brand");
      }
      payload.push({
        buffer: Buffer.from(await file.arrayBuffer()),
        originalName: file.name || "upload",
        mimeType: file.type || "application/octet-stream",
        role,
      });
    }

    const saved = await saveJobReferences(id, payload);
    return NextResponse.json({ references: saved.map(publicReference) });
  } catch (error) {
    return jsonError(error, 400);
  }
}
