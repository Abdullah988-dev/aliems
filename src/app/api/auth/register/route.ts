import { NextResponse } from "next/server";
import { jsonError, safeApiError } from "@/lib/api-helpers";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { enforceAuthRateLimit } from "@/lib/rate-limit";
import { formatZodError, registerSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const rateBlocked = enforceAuthRateLimit(request, "register");
  if (rateBlocked) return rateBlocked;

  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonError("Invalid JSON request body.", 400);
    }

    const parsed = registerSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError(formatZodError(parsed.error), 400);
    }

    const data = parsed.data;
    const db = await getDb();
    const { tenant, user } = await db.registerTenant({
      businessName: data.businessName,
      businessType: data.businessType,
      customBusinessLabel: data.customBusinessLabel,
      customCategories: data.customCategories,
      currency: data.currency,
      fullName: data.fullName,
      email: data.email.toLowerCase(),
      passwordHash: hashPassword(data.password),
      includeStarterStock: Boolean(data.includeStarterStock),
    });

    await setSessionCookie({
      userId: user.id,
      tenantId: tenant.id,
      email: user.email,
      role: user.role,
    });

    const overview = await db.getTenantOverview(tenant.id, user.id);
    return NextResponse.json({ overview }, { status: 201 });
  } catch (err) {
    return safeApiError(err, "Registration failed.", 400, "POST /api/auth/register");
  }
}
