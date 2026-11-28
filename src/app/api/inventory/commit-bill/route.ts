import { NextResponse } from "next/server";
import { jsonError, requireApiSession, safeApiError } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";
import { enforceApiRateLimit } from "@/lib/rate-limit";
import { commitBillSchema, formatZodError } from "@/lib/validation";

export async function POST(request: Request) {
  const limited = enforceApiRateLimit(request, "commit-bill:post");
  if (limited) return limited;

  if (new URL(request.url).search) {
    return jsonError("Query parameters are not permitted on state-changing requests.", 400);
  }

  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const rawBody = await request.json();
    const parsed = commitBillSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError(formatZodError(parsed.error), 400);
    }

    const data = parsed.data;
    let parsedOldBalance: number | undefined;
    if (
      data.oldBalance !== undefined &&
      data.oldBalance !== null &&
      String(data.oldBalance).trim() !== ""
    ) {
      parsedOldBalance = Number(data.oldBalance);
      if (!Number.isFinite(parsedOldBalance) || parsedOldBalance < 0) {
        return jsonError("Supplier old balance must be a non-negative number.");
      }
    }

    const db = await getDb();
    const summary = await db.commitScannedBill({
      tenantId: session.tenantId,
      userId: session.userId,
      supplierName: data.supplierName,
      billDate: data.billDate,
      oldBalance: parsedOldBalance,
      items: data.items,
    });

    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json({ summary, overview }, { status: 201 });
  } catch (err) {
    return safeApiError(
      err,
      "Failed to save scanned bill to stock.",
      400,
      "POST /api/inventory/commit-bill",
    );
  }
}
