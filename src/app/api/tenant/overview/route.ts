import { NextResponse } from "next/server";
import { jsonError, requireApiSession, safeApiError } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";
import { enforceApiRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceApiRateLimit(request, "tenant:overview");
  if (limited) return limited;

  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const db = await getDb();
    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    if (!overview) {
      return jsonError("Tenant session is invalid or workspace was removed.", 401);
    }

    return NextResponse.json({ overview });
  } catch (err) {
    return safeApiError(
      err,
      "Unable to load tenant overview.",
      500,
      "GET /api/tenant/overview",
    );
  }
}
