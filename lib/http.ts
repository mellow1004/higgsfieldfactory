import { NextResponse } from "next/server";
import { AuthError } from "./auth";

export function jsonError(error: unknown, fallback = 500) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = message === "Job not found" ? 404 : fallback;
  return NextResponse.json({ error: message }, { status });
}
