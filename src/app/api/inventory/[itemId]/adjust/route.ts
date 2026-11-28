import { NextResponse } from "next/server";
import { jsonError, requireApiSession, safeApiError } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";
import { enforceApiRateLimit } from "@/lib/rate-limit";
import { adjustStockSchema, formatZodError, itemIdSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const limited = enforceApiRateLimit(request, "inventory:adjust");
  if (limited) return limited;

  if (new URL(request.url).search) {
    return jsonError("Query parameters are not permitted on state-changing requests.", 400);
  }

  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const { itemId } = await context.params;
    const validId = itemIdSchema.safeParse(itemId);
    if (!validId.success) {
      return jsonError("Invalid inventory item ID.", 400);
    }

    const rawBody = await request.json();
    const parsed = adjustStockSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError(formatZodError(parsed.error), 400);
    }

    const db = await getDb();
    const result = await db.adjustInventoryStock({
      tenantId: session.tenantId,
      userId: session.userId,
      itemId: validId.data,
      qtyDelta: parsed.data.qtyDelta,
      reference: parsed.data.reference,
      notes: parsed.data.notes || "Manual stock audit adjustment",
    });

    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json({
      item: result.item,
      ledgerEntry: result.ledgerEntry,
      overview,
    });
  } catch (err) {
    return safeApiError(
      err,
      "Failed to adjust stock.",
      400,
      "POST /api/inventory/[itemId]/adjust",
    );
  }
}
