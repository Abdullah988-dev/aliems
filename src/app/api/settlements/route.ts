import { NextResponse } from "next/server";
import { jsonError, requireApiSession, safeApiError } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";
import { enforceApiRateLimit } from "@/lib/rate-limit";
import { formatZodError, settlementSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const limited = enforceApiRateLimit(request, "settlements:post");
  if (limited) return limited;

  if (new URL(request.url).search) {
    return jsonError("Query parameters are not permitted on state-changing requests.", 400);
  }

  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const rawBody = await request.json();
    const parsed = settlementSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError(formatZodError(parsed.error), 400);
    }

    const data = parsed.data;
    const db = await getDb();
    const result = await db.recordWeeklySettlement({
      tenantId: session.tenantId,
      userId: session.userId,
      settledAmount: data.settledAmount,
      weekLabel: data.weekLabel,
      recipientName: data.recipientName,
      settlementMethod: data.settlementMethod,
      reference: data.reference,
      notes: data.notes,
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
    return safeApiError(
      err,
      "Failed to record weekly settlement.",
      400,
      "POST /api/settlements",
    );
  }
}
