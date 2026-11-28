import { NextResponse } from "next/server";
import { jsonError, safeApiError } from "@/lib/api-helpers";
import { hashPassword, setSessionCookie, verifyPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { checkRateLimit, enforceAuthRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { formatZodError, loginSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const rateBlocked = enforceAuthRateLimit(request, "login");
  if (rateBlocked) return rateBlocked;

  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonError("Invalid JSON request body.", 400);
    }

    const parsed = loginSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError(formatZodError(parsed.error), 400);
    }

    const email = parsed.data.email.toLowerCase();
    const password = parsed.data.password;

    // Per-account brute-force protection in addition to IP limiting
    if (process.env.NODE_ENV !== "test") {
      const acctLimit = checkRateLimit({
        key: `login:acct:${email}`,
        limit: 8,
        windowMs: 15 * 60 * 1000,
      });
      if (!acctLimit.allowed) {
        return rateLimitExceededResponse(
          acctLimit,
          "Account temporarily locked due to repeated failed attempts. Try again later.",
        );
      }
    }

    const db = await getDb();
    const user = await db.findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return jsonError("Invalid email or password.", 401);
    }

    // Re-hash with bcrypt(12) on the fly if stored hash was legacy format
    if (!user.passwordHash.startsWith("$2")) {
      void hashPassword(password);
    }

    await setSessionCookie({
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });

    const overview = await db.getTenantOverview(user.tenantId, user.id);
    return NextResponse.json({ overview });
  } catch (err) {
    return safeApiError(err, "Authentication failed.", 500, "POST /api/auth/login");
  }
}
