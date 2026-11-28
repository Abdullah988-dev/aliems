import { NextResponse } from "next/server";
import { parseOptionalPrice } from "@/lib/accounting";
import { jsonError, requireApiSession, requireRole, safeApiError } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";
import { enforceApiRateLimit } from "@/lib/rate-limit";
import { formatZodError, itemIdSchema, updateItemSchema } from "@/lib/validation";

export async function GET(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const limited = enforceApiRateLimit(request, "inventory:getOne");
  if (limited) return limited;

  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const { itemId } = await context.params;
    const validId = itemIdSchema.safeParse(itemId);
    if (!validId.success) {
      return jsonError("Invalid inventory item ID.", 400);
    }

    const db = await getDb();
    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    if (!overview) {
      return jsonError("Workspace not found.", 404);
    }

    const item = overview.items.find(
      (i) => !i.isDeleted && i.id === validId.data && i.tenantId === session.tenantId,
    );
    if (!item) {
      return jsonError("Inventory item not found in this workspace.", 404);
    }

    return NextResponse.json({ item });
  } catch (err) {
    return safeApiError(
      err,
      "Failed to load inventory item.",
      500,
      "GET /api/inventory/[itemId]",
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const limited = enforceApiRateLimit(request, "inventory:patch");
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
    const parsed = updateItemSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError(formatZodError(parsed.error), 400);
    }

    const body = parsed.data;
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
      itemId: validId.data,
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
    const status =
      err instanceof Error && /not found/i.test(err.message) ? 404 : 400;
    return safeApiError(
      err,
      "Failed to update inventory item.",
      status,
      "PATCH /api/inventory/[itemId]",
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const limited = enforceApiRateLimit(request, "inventory:delete");
  if (limited) return limited;

  if (new URL(request.url).search) {
    return jsonError("Query parameters are not permitted on state-changing requests.", 400);
  }

  const { session, error } = await requireApiSession();
  if (error) return error;

  const roleErr = requireRole(session, ["owner"]);
  if (roleErr) return roleErr;

  try {
    const { itemId } = await context.params;
    const validId = itemIdSchema.safeParse(itemId);
    if (!validId.success) {
      return jsonError("Invalid inventory item ID.", 400);
    }

    const db = await getDb();
    const result = await db.deleteInventoryItem(
      session.tenantId,
      session.userId,
      validId.data,
    );
    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json({ deletedMode: result.mode, overview });
  } catch (err) {
    const status =
      err instanceof Error && /not found/i.test(err.message) ? 404 : 400;
    return safeApiError(
      err,
      "Failed to delete inventory item.",
      status,
      "DELETE /api/inventory/[itemId]",
    );
  }
}
