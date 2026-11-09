import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db";
import { refsDir } from "./paths";
import type { JobReference, PublicReference, ReferenceRole } from "./types";

export const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_MIME = new Set([
  ...IMAGE_MIME,
  "application/pdf",
  "image/svg+xml",
]);

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 8;

type RefRow = {
  id: string;
  job_id: string;
  role: ReferenceRole;
  original_name: string;
  mime_type: string;
  file_path: string;
  created_at: string;
};

function mapRef(row: RefRow): JobReference {
  return {
    id: row.id,
    jobId: row.job_id,
    role: row.role,
    originalName: row.original_name,
    mimeType: row.mime_type,
    filePath: row.file_path,
    createdAt: row.created_at,
  };
}

export function isImageMime(mime: string) {
  const normalized = mime === "image/jpg" ? "image/jpeg" : mime;
  return IMAGE_MIME.has(normalized);
}

export function normalizeMime(mime: string, filename: string) {
  if (mime && mime !== "application/octet-stream") {
    return mime === "image/jpg" ? "image/jpeg" : mime;
  }
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".svg") return "image/svg+xml";
  return mime || "application/octet-stream";
}

export function publicReference(ref: JobReference): PublicReference {
  return {
    id: ref.id,
    jobId: ref.jobId,
    role: ref.role,
    originalName: ref.originalName,
    mimeType: ref.mimeType,
    url: `/api/references/${ref.id}`,
    isImage: isImageMime(ref.mimeType),
  };
}

export function listReferences(jobId: string) {
  const rows = getDb()
    .prepare("SELECT * FROM job_references WHERE job_id = ? ORDER BY created_at ASC")
    .all(jobId) as RefRow[];
  return rows.map(mapRef);
}

export function getReference(id: string) {
  const row = getDb().prepare("SELECT * FROM job_references WHERE id = ?").get(id) as
    | RefRow
    | undefined;
  return row ? mapRef(row) : null;
}

export function startImageFor(jobId: string) {
  return listReferences(jobId).find(
    (ref) => ref.role === "start-image" && isImageMime(ref.mimeType) && fs.existsSync(ref.filePath),
  );
}

export function brandReferencesFor(jobId: string) {
  return listReferences(jobId).filter((ref) => ref.role === "brand" && fs.existsSync(ref.filePath));
}

export function brandLogoFor(jobId: string) {
  const brand = brandReferencesFor(jobId).filter((ref) => isImageMime(ref.mimeType));
  if (brand.length === 0) return null;
  const named = brand.find((ref) => /logo/i.test(ref.originalName));
  return named || brand[0];
}

export function deleteReference(id: string) {
  const ref = getReference(id);
  if (!ref) return false;
  getDb().prepare("DELETE FROM job_references WHERE id = ?").run(id);
  try {
    fs.unlinkSync(ref.filePath);
  } catch {
    // file may already be gone
  }
  return true;
}

function safeName(name: string) {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "file";
}

export async function saveJobReferences(
  jobId: string,
  files: { buffer: Buffer; originalName: string; mimeType: string; role: ReferenceRole }[],
) {
  const existing = listReferences(jobId);
  if (existing.length + files.length > MAX_FILES) {
    throw new Error(`At most ${MAX_FILES} reference files per job.`);
  }

  const jobDir = path.join(refsDir(), jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const insert = getDb().prepare(
    `INSERT INTO job_references (
      id, job_id, role, original_name, mime_type, file_path, created_at
    ) VALUES (
      @id, @jobId, @role, @originalName, @mimeType, @filePath, @createdAt
    )`,
  );

  for (const file of files) {
    if (file.buffer.byteLength > MAX_FILE_BYTES) {
      throw new Error(`${file.originalName} is larger than 8MB.`);
    }
    const mime = normalizeMime(file.mimeType, file.originalName);
    if (!ALLOWED_MIME.has(mime)) {
      throw new Error(`${file.originalName} is not an allowed reference type.`);
    }
    if (file.role === "start-image" && !isImageMime(mime)) {
      throw new Error("Start image must be a JPEG, PNG, WebP, or GIF.");
    }

    const id = randomUUID();
    const ext = path.extname(safeName(file.originalName)) || "";
    const filePath = path.join(jobDir, `${id}${ext}`);
    fs.writeFileSync(filePath, file.buffer);
    const row: JobReference = {
      id,
      jobId,
      role: file.role,
      originalName: file.originalName.slice(0, 180),
      mimeType: mime,
      filePath,
      createdAt: new Date().toISOString(),
    };
    insert.run(row);
  }

  const starts = listReferences(jobId).filter((ref) => ref.role === "start-image");
  if (starts.length > 1) {
    const keep = starts[0].id;
    getDb()
      .prepare(
        "UPDATE job_references SET role = 'brand' WHERE job_id = ? AND role = 'start-image' AND id != ?",
      )
      .run(jobId, keep);
  }

  return listReferences(jobId);
}
