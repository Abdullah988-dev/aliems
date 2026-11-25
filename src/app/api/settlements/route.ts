import { NextResponse } from "next/server";
import { jsonError, requireApiSession } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";
import type { WeeklySettlement } from "@/types/domain";

export async function POST(request: Request) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const body = (await request.json()) as {
      settledAmount?: number;
      weekLabel?: string;
      recipientName?: string;
      settlementMethod?: WeeklySettlement["settlementMethod"];
      reference?: string;
      notes?: string;
    };

    const db = await getDb();
    const result = await db.recordWeeklySettlement({
      tenantId: session.tenantId,
      userId: session.userId,
      settledAmount: Number(body.settledAmount ?? 0),
      weekLabel: body.weekLabel,
      recipientName: body.recipientName,
      settlementMethod: body.settlementMethod || "bank_transfer",
      reference: body.reference,
      notes: body.notes,
    });

    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json(
      {
        settlement: result.settlement,
        ledgerEntry: result.ledgerEntry,
        overview,
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to record weekly settlement.",
      400,
    );
  }
}
