import { NextRequest, NextResponse } from "next/server";
import { jsonError, requireApiSession, safeApiError } from "@/lib/api-helpers";
import { buildWeeklyCashFlowReport } from "@/lib/cashflow-ledger";
import { getDb } from "@/lib/db";
import { enforceApiRateLimit } from "@/lib/rate-limit";
import { cashFlowReportSchema, formatZodError } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const limited = enforceApiRateLimit(request, "reports:cashflow");
  if (limited) return limited;

  if (request.nextUrl.search) {
    return jsonError("Sensitive report filters must not be passed in URL query strings.", 400);
  }

  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const rawBody = await request.json();
    const parsed = cashFlowReportSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError(formatZodError(parsed.error), 400);
    }

    const data = parsed.data;
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
      supplierSelector: data.supplier,
      periodType: data.periodType,
      startDate: data.startDate,
      endDate: data.endDate,
      periodLabel: data.periodLabel,
      blankRows: data.blankRows,
    });

    return NextResponse.json({ report });
  } catch (err) {
    return safeApiError(
      err,
      "Failed to generate weekly cash flow report.",
      400,
      "POST /api/reports/weekly-cashflow",
    );
  }
}
