import { NextResponse } from "next/server";
import { jsonError, requireApiSession } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";

export async function POST(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const { itemId } = await context.params;
    const body = (await request.json()) as {
      addedQty?: number;
      unitCostPrice?: number;
      reference?: string;
      notes?: string;
    };

    const db = await getDb();
    const result = await db.restockInventoryItem({
      tenantId: session.tenantId,
      userId: session.userId,
      itemId,
      addedQty: Number(body.addedQty ?? 0),
      unitCostPrice: Number(body.unitCostPrice ?? 0),
      reference: body.reference,
      notes: body.notes,
    });

    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json({ item: result.item, ledgerEntry: result.ledgerEntry, overview });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to restock item.",
      400,
    );
  }
}

