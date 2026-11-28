import { NextResponse } from "next/server";
import { jsonError, requireApiSession, requireRole, safeApiError } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";
import { enforceApiRateLimit } from "@/lib/rate-limit";
import { formatZodError, updateTenantProfileSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  const limited = enforceApiRateLimit(request, "tenant-profile:patch");
  if (limited) return limited;

  if (new URL(request.url).search) {
    return jsonError("Query parameters are not permitted on state-changing requests.", 400);
  }

  const { session, error } = await requireApiSession();
  if (error) return error;

  const roleErr = requireRole(session, ["owner"]);
  if (roleErr) return roleErr;

  try {
    const rawBody = await request.json();
    const parsed = updateTenantProfileSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError(formatZodError(parsed.error), 400);
    }

    const data = parsed.data;
    const db = await getDb();
    await db.updateTenantProfile({
      tenantId: session.tenantId,
      businessName: data.businessName,
      businessType: data.businessType,
      customBusinessLabel: data.customBusinessLabel,
      currency: data.currency,
      provisionPresetCategories: Boolean(data.provisionPresetCategories),
    });

    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json({ overview });
  } catch (err) {
    return safeApiError(
      err,
      "Failed to update business profile.",
      400,
      "PATCH /api/tenant/profile",
    );
  }
}
