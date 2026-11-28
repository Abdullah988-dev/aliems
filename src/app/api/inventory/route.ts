import { NextResponse } from "next/server";
import { parseOptionalPrice } from "@/lib/accounting";
import { jsonError, requireApiSession, safeApiError } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";
import { enforceApiRateLimit } from "@/lib/rate-limit";
import { createItemSchema, formatZodError } from "@/lib/validation";

export async function POST(request: Request) {
  const limited = enforceApiRateLimit(request, "inventory:post");
  if (limited) return limited;

  if (new URL(request.url).search) {
    return jsonError("Query parameters are not permitted on state-changing requests.", 400);
  }

  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const rawBody = await request.json();
    const parsed = createItemSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError(formatZodError(parsed.error), 400);
    }

    const data = parsed.data;
    const db = await getDb();

    let categoryId = data.categoryId || "";
    if (!categoryId) {
      const overview = await db.getTenantOverview(session.tenantId, session.userId);
      categoryId = overview?.categories[0]?.id || "";
    }
    if (!categoryId) {
      return jsonError("Please create or select a category first.");
    }

    const targetSalePrice = parseOptionalPrice(data.targetSalePrice);

    const result = await db.createInventoryItem({
      tenantId: session.tenantId,
      userId: session.userId,
      categoryId,
      sku: data.sku,
      name: data.name,
      brand: data.brand,
      unitCostPrice: data.unitCostPrice,
      targetSalePrice,
      qtyOnHand: data.qtyOnHand,
      reorderLevel: Math.floor(data.reorderLevel),
      supplierRef: data.supplierRef,
    });

    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json({ item: result.item, overview }, { status: 201 });
  } catch (err) {
    return safeApiError(err, "Failed to create inventory item.", 400, "POST /api/inventory");
  }
}
