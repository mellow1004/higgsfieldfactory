import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { getDb } from "./db";

const COOKIE = "hf_session";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type SessionPayload = {
  username: string;
  exp: number;
};

function secret() {
  return process.env.SESSION_SECRET || "higgsfield-factory-dev-secret";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function createSessionToken(username: string) {
  const payload = Buffer.from(
    JSON.stringify({ username, exp: Date.now() + WEEK_MS } satisfies SessionPayload),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string): SessionPayload | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!safeEqual(signature, sign(payload))) return null;
  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (!data.username || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function seedAdmin() {
  const db = getDb();
  const username = process.env.FACTORY_ADMIN_USER || "factory";
  const password = process.env.FACTORY_ADMIN_PASSWORD || "factory";
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return;
  db.prepare(
    "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
  ).run(username, bcrypt.hashSync(password, 10), new Date().toISOString());
}

export function verifyLogin(username: string, password: string) {
  seedAdmin();
  const row = getDb()
    .prepare("SELECT username, password_hash FROM users WHERE username = ?")
    .get(username) as { username: string; password_hash: string } | undefined;
  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  return row.username;
}

export async function getSession() {
  seedAdmin();
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return readSessionToken(token);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new AuthError();
  }
  return session;
}

export class AuthError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "AuthError";
  }
}

export function sessionCookieOptions() {
  return {
    name: COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WEEK_MS / 1000,
  };
}
