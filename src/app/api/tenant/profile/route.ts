import { NextResponse } from "next/server";
import { jsonError, requireApiSession } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";
import type { BusinessType } from "@/types/domain";

export async function PATCH(request: Request) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const body = (await request.json()) as {
      businessName?: string;
      businessType?: BusinessType;
      customBusinessLabel?: string;
      currency?: string;
      provisionPresetCategories?: boolean;
    };

    const db = await getDb();
    await db.updateTenantProfile({
      tenantId: session.tenantId,
      businessName: body.businessName,
      businessType: body.businessType,
      customBusinessLabel: body.customBusinessLabel,
      currency: body.currency,
      provisionPresetCategories: Boolean(body.provisionPresetCategories),
    });

    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json({ overview });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to update business profile.",
      400,
    );
  }
}

