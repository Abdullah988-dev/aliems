import { NextResponse } from "next/server";
import { jsonError, requireApiSession } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, error } = await requireApiSession();
  if (error) return error;

  const db = await getDb();
  const overview = await db.getTenantOverview(session.tenantId, session.userId);
  if (!overview) {
    return jsonError("Tenant session is invalid or workspace was removed.", 401);
  }

  return NextResponse.json({ overview });
}

