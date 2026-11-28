import { NextResponse } from "next/server";
import { jsonError, requireApiSession, requireRole, safeApiError } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";
import { enforceApiRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceApiRateLimit(request, "admin:audit", 30, 60 * 1000);
  if (limited) return limited;

  const { session, error } = await requireApiSession();
  if (error) return error;

  const roleErr = requireRole(session, ["owner"]);
  if (roleErr) return roleErr;

  try {
    const db = await getDb();
    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    if (!overview) {
      return jsonError("Workspace not found.", 404);
    }

    return NextResponse.json({
      tenantId: overview.tenant.id,
      businessName: overview.tenant.businessName,
      role: overview.user.role,
      storageMode: overview.storageMode,
      securityPosture: {
        httpOnlyCookie: true,
        sameSite: "strict",
        bcryptPasswordHashing: true,
        rbacEnforced: true,
        skuCount: overview.items.length,
        supplierCount: overview.suppliers.length,
        ledgerEntriesCount: overview.ledger.length,
      },
    });
  } catch (err) {
    return safeApiError(
      err,
      "Unable to load workspace audit.",
      500,
      "GET /api/admin/audit",
    );
  }
}

