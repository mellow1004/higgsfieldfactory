import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { seedAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  seedAdmin();
  getDb();
  return NextResponse.json({ ok: true, service: "higgsfield-factory" });
}
