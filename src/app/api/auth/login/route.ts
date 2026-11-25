import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-helpers";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };

    const email = body.email?.trim().toLowerCase() || "";
    const password = body.password || "";
    if (!email || !password) {
      return jsonError("Email and password are required.", 400);
    }

    const db = await getDb();
    const user = await db.findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return jsonError("Invalid email or password.", 401);
    }

    await setSessionCookie({
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
    });

    const overview = await db.getTenantOverview(user.tenantId, user.id);
    return NextResponse.json({ overview });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Sign-in failed.",
      500,
    );
  }
}

