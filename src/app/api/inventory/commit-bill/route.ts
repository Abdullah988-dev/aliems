import { NextResponse } from "next/server";
import { jsonError, requireApiSession } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";
import type { ScannedBillItem } from "@/types/domain";

export async function POST(request: Request) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const body = (await request.json()) as {
      supplierName?: string;
      billDate?: string;
      oldBalance?: number | string | null;
      items?: Array<Partial<ScannedBillItem>>;
      billTotal?: number;
    };

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return jsonError("At least one bill item is required to save to live stock.");
    }

    let parsedOldBalance: number | undefined;
    if (
      body.oldBalance !== undefined &&
      body.oldBalance !== null &&
      String(body.oldBalance).trim() !== ""
    ) {
      parsedOldBalance = Number(body.oldBalance);
      if (!Number.isFinite(parsedOldBalance) || parsedOldBalance < 0) {
        return jsonError("Supplier old balance must be a non-negative number.");
      }
    }

    const db = await getDb();
    const summary = await db.commitScannedBill({
      tenantId: session.tenantId,
      userId: session.userId,
      supplierName: body.supplierName,
      billDate: body.billDate,
      oldBalance: parsedOldBalance,
      items: body.items,
    });

    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json({ summary, overview }, { status: 201 });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to save scanned bill to stock.";
    console.error("[POST /api/inventory/commit-bill] 400:", msg);
    return jsonError(msg, 400);
  }
}

