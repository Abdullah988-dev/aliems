import { NextRequest, NextResponse } from "next/server";
import { jsonError, requireApiSession } from "@/lib/api-helpers";
import { buildWeeklyCashFlowReport } from "@/lib/cashflow-ledger";
import { getDb } from "@/lib/db";
import type { CashFlowPeriodType } from "@/types/domain";

export async function GET(request: NextRequest) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const supplier = (searchParams.get("supplier") || "BLANK_MANUAL").trim();
    const rawPeriod = (searchParams.get("periodType") || "weekly").trim();
    const periodType: CashFlowPeriodType =
      rawPeriod === "monthly" || rawPeriod === "custom" ? rawPeriod : "weekly";

    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const periodLabel = searchParams.get("periodLabel") || undefined;
    const blankRowsParam = searchParams.get("blankRows");
    const blankRows =
      blankRowsParam !== null && blankRowsParam !== ""
        ? Number(blankRowsParam)
        : 8;

    const db = await getDb();
    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    if (!overview) {
      return jsonError("Tenant workspace not found.", 404);
    }

    const report = buildWeeklyCashFlowReport({
      tenant: overview.tenant,
      suppliers: overview.suppliers,
      items: overview.items,
      ledger: overview.ledger,
      settlements: overview.settlements,
      supplierSelector: supplier,
      periodType,
      startDate,
      endDate,
      periodLabel,
      blankRows,
    });

    return NextResponse.json({ report });
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Failed to generate weekly cash flow report.";
    return jsonError(msg, 400);
  }
}

