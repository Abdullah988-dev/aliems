import { NextResponse } from "next/server";
import { jsonError, requireApiSession, safeApiError } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";
import { enforceApiRateLimit } from "@/lib/rate-limit";
import { formatZodError, supplierBalanceSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const limited = enforceApiRateLimit(request, "suppliers:post");
  if (limited) return limited;

  if (new URL(request.url).search) {
    return jsonError("Query parameters are not permitted on state-changing requests.", 400);
  }

  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const rawBody = await request.json();
    const parsed = supplierBalanceSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError(formatZodError(parsed.error), 400);
    }

    const data = parsed.data;
    const db = await getDb();
    const result = await db.upsertSupplierBalance({
      tenantId: session.tenantId,
      userId: session.userId,
      supplierName: data.supplierName,
      oldBalance: data.oldBalance,
      currentBillAmount: data.currentBillAmount,
      billDate: data.billDate,
      notes: data.notes,
    });

    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json(
      { supplier: result.supplier, ledgerEntry: result.ledgerEntry, overview },
      { status: 201 },
    );
  } catch (err) {
    return safeApiError(
      err,
      "Failed to save supplier balance.",
      400,
      "POST /api/suppliers",
    );
  }
}
