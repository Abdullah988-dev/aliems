import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-helpers";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { BusinessType } from "@/types/domain";

const VALID_TYPES = new Set<BusinessType>([
  "electronics",
  "mobile",
  "appliances",
  "custom",
]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      businessName?: string;
      businessType?: BusinessType;
      customBusinessLabel?: string;
      customCategories?: string[];
      currency?: string;
      fullName?: string;
      email?: string;
      password?: string;
      includeStarterStock?: boolean;
    };

    const businessName = body.businessName?.trim() || "";
    const fullName = body.fullName?.trim() || "";
    const email = body.email?.trim() || "";
    const password = body.password || "";
    const businessType = body.businessType || "electronics";

    if (!businessName || businessName.length < 2) {
      return jsonError("Business name must be at least 2 characters.");
    }
    if (!fullName || fullName.length < 2) {
      return jsonError("Owner/operator full name is required.");
    }
    if (!email || !email.includes("@")) {
      return jsonError("A valid email address is required.");
    }
    if (password.length < 6) {
      return jsonError("Password must be at least 6 characters.");
    }
    if (!VALID_TYPES.has(businessType)) {
      return jsonError("Invalid business type selected.");
    }

    const db = await getDb();
    const { tenant, user } = await db.registerTenant({
      businessName,
      businessType,
      customBusinessLabel: body.customBusinessLabel,
      customCategories: Array.isArray(body.customCategories)
        ? body.customCategories
        : undefined,
      currency: body.currency,
      fullName,
      email,
      passwordHash: hashPassword(password),
      includeStarterStock: Boolean(body.includeStarterStock),
    });

    await setSessionCookie({
      userId: user.id,
      tenantId: tenant.id,
      email: user.email,
    });

    const overview = await db.getTenantOverview(tenant.id, user.id);
    return NextResponse.json({ overview }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed.";
    return jsonError(message, 400);
  }
}

