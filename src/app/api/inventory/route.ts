import { NextResponse } from "next/server";
import { parseOptionalPrice } from "@/lib/accounting";
import { jsonError, requireApiSession } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const body = (await request.json()) as {
      categoryId?: string;
      sku?: string;
      name?: string;
      brand?: string;
      unitCostPrice?: number | string;
      targetSalePrice?: number | string | null;
      qtyOnHand?: number | string;
      reorderLevel?: number | string;
      supplierRef?: string;
    };

    const db = await getDb();

    let categoryId = body.categoryId?.trim() || "";
    if (!categoryId) {
      const overview = await db.getTenantOverview(session.tenantId, session.userId);
      categoryId = overview?.categories[0]?.id || "";
    }

    const itemName = body.name?.trim() || "";
    if (!categoryId) {
      return jsonError("Please create or select a category first.");
    }
    if (!itemName) {
      return jsonError("Item / model name is required.");
    }

    const unitCostPrice = Number(body.unitCostPrice);
    if (
      body.unitCostPrice === undefined ||
      body.unitCostPrice === null ||
      String(body.unitCostPrice).trim() === "" ||
      !Number.isFinite(unitCostPrice) ||
      unitCostPrice < 0
    ) {
      return jsonError("Unit cost price must be a valid non-negative number.");
    }

    const qtyRaw =
      body.qtyOnHand === undefined ||
      body.qtyOnHand === null ||
      String(body.qtyOnHand).trim() === ""
        ? 0
        : Number(body.qtyOnHand);
    if (!Number.isInteger(qtyRaw) || qtyRaw < 0) {
      return jsonError("Opening quantity must be a non-negative whole number.");
    }

    const reorderRaw =
      body.reorderLevel === undefined ||
      body.reorderLevel === null ||
      String(body.reorderLevel).trim() === ""
        ? 2
        : Number(body.reorderLevel);
    if (!Number.isFinite(reorderRaw) || reorderRaw < 0) {
      return jsonError("Reorder alert level must be a non-negative number.");
    }

    const targetSalePrice = parseOptionalPrice(body.targetSalePrice);

    const result = await db.createInventoryItem({
      tenantId: session.tenantId,
      userId: session.userId,
      categoryId,
      sku: body.sku,
      name: itemName,
      brand: body.brand ?? "",
      unitCostPrice,
      targetSalePrice,
      qtyOnHand: qtyRaw,
      reorderLevel: Math.floor(reorderRaw),
      supplierRef: body.supplierRef,
    });

    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json({ item: result.item, overview }, { status: 201 });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to create inventory item.";
    console.error("[POST /api/inventory] 400:", msg);
    return jsonError(msg, 400);
  }
}
