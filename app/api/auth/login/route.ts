import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, sessionCookieOptions, verifyLogin } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

const Body = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = Body.parse(await request.json());
    const username = verifyLogin(body.username, body.password);
    if (!username) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    const token = createSessionToken(username);
    const options = sessionCookieOptions();
    const response = NextResponse.json({ ok: true, username });
    response.cookies.set(options.name, token, options);
    return response;
  } catch (error) {
    return jsonError(error, 400);
  }
}
