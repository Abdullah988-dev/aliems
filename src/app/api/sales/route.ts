import { NextResponse } from "next/server";
import { jsonError, requireApiSession } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const body = (await request.json()) as {
      itemId?: string;
      quantity?: number;
      unitSalePrice?: number | string;
      customerName?: string;
      reference?: string;
      notes?: string;
    };

    if (!body.itemId) {
      return jsonError("itemId is required.");
    }
    if (
      body.unitSalePrice === undefined ||
      body.unitSalePrice === null ||
      String(body.unitSalePrice).trim() === ""
    ) {
      return jsonError("Unit sale price is required for sale dispatch.");
    }

    const parsedSalePrice = Number(body.unitSalePrice);
    if (!Number.isFinite(parsedSalePrice) || parsedSalePrice < 0) {
      return jsonError("Unit sale price must be a non-negative number.");
    }

    const db = await getDb();
    const result = await db.recordSaleDispatch({
      tenantId: session.tenantId,
      userId: session.userId,
      itemId: body.itemId,
      quantity: Number(body.quantity ?? 0),
      unitSalePrice: parsedSalePrice,
      customerName: body.customerName,
      reference: body.reference,
      notes: body.notes,
    });

    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json(
      { item: result.item, ledgerEntry: result.ledgerEntry, overview },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to record sale dispatch.",
      400,
    );
  }
}
