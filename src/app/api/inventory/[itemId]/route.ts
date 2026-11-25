import { NextResponse } from "next/server";
import { parseOptionalPrice } from "@/lib/accounting";
import { jsonError, requireApiSession } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const { itemId } = await context.params;
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

    const targetSalePrice =
      "targetSalePrice" in body ? parseOptionalPrice(body.targetSalePrice) : undefined;

    let unitCostPrice: number | undefined;
    if (body.unitCostPrice !== undefined && String(body.unitCostPrice).trim() !== "") {
      unitCostPrice = Number(body.unitCostPrice);
      if (!Number.isFinite(unitCostPrice) || unitCostPrice < 0) {
        return jsonError("Unit cost price must be a valid non-negative number.");
      }
    }

    let qtyOnHand: number | undefined;
    if (body.qtyOnHand !== undefined && String(body.qtyOnHand).trim() !== "") {
      qtyOnHand = Number(body.qtyOnHand);
      if (!Number.isInteger(qtyOnHand) || qtyOnHand < 0) {
        return jsonError("Quantity on hand must be a non-negative whole number.");
      }
    }

    let reorderLevel: number | undefined;
    if (body.reorderLevel !== undefined && String(body.reorderLevel).trim() !== "") {
      reorderLevel = Number(body.reorderLevel);
      if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
        return jsonError("Reorder alert level must be a non-negative number.");
      }
    }

    const db = await getDb();
    const result = await db.updateInventoryItem({
      tenantId: session.tenantId,
      userId: session.userId,
      itemId,
      categoryId: body.categoryId,
      sku: body.sku,
      name: body.name,
      brand: body.brand,
      unitCostPrice,
      targetSalePrice,
      qtyOnHand,
      reorderLevel,
      supplierRef: body.supplierRef,
    });

    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json({
      item: result.item,
      ledgerEntry: result.ledgerEntry,
      overview,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update inventory item.";
    console.error("[PATCH /api/inventory/[itemId]] 400:", msg);
    return jsonError(msg, 400);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const { itemId } = await context.params;
    const db = await getDb();
    const result = await db.deleteInventoryItem(
      session.tenantId,
      session.userId,
      itemId,
    );
    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json({ deletedMode: result.mode, overview });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to delete inventory item.",
      400,
    );
  }
}
