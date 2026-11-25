import { NextResponse } from "next/server";
import { jsonError, requireApiSession } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const body = (await request.json()) as {
      supplierName?: string;
      oldBalance?: number | string;
      currentBillAmount?: number | string;
      billDate?: string;
      notes?: string;
    };

    const supplierName = body.supplierName?.trim() || "";
    if (!supplierName) {
      return jsonError("Supplier name is required.");
    }

    const oldBalance = Number(body.oldBalance ?? 0);
    const currentBillAmount = Number(body.currentBillAmount ?? 0);
    if (!Number.isFinite(oldBalance) || oldBalance < 0) {
      return jsonError("Old balance must be a non-negative number.");
    }
    if (!Number.isFinite(currentBillAmount) || currentBillAmount < 0) {
      return jsonError("Current bill amount must be a non-negative number.");
    }

    const db = await getDb();
    const result = await db.upsertSupplierBalance({
      tenantId: session.tenantId,
      userId: session.userId,
      supplierName,
      oldBalance,
      currentBillAmount,
      billDate: body.billDate,
      notes: body.notes,
    });

    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json(
      { supplier: result.supplier, ledgerEntry: result.ledgerEntry, overview },
      { status: 201 },
    );
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to save supplier balance.";
    console.error("[POST /api/suppliers] 400:", msg);
    return jsonError(msg, 400);
  }
}

