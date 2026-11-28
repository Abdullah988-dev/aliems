import { NextResponse } from "next/server";
import { jsonError, requireApiSession, safeApiError } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";
import { enforceApiRateLimit } from "@/lib/rate-limit";
import { formatZodError, saleDispatchSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const limited = enforceApiRateLimit(request, "sales:post");
  if (limited) return limited;

  if (new URL(request.url).search) {
    return jsonError("Query parameters are not permitted on state-changing requests.", 400);
  }

  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const rawBody = await request.json();
    const parsed = saleDispatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError(formatZodError(parsed.error), 400);
    }

    const data = parsed.data;
    const db = await getDb();
    const result = await db.recordSaleDispatch({
      tenantId: session.tenantId,
      userId: session.userId,
      itemId: data.itemId,
      quantity: data.quantity,
      unitSalePrice: data.unitSalePrice,
      customerName: data.customerName,
      reference: data.reference,
      notes: data.notes,
    });

    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json(
      { item: result.item, ledgerEntry: result.ledgerEntry, overview },
      { status: 201 },
    );
  } catch (err) {
    return safeApiError(err, "Failed to record sale dispatch.", 400, "POST /api/sales");
  }
}
