import { NextResponse } from "next/server";
import { jsonError, requireApiSession } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const body = (await request.json()) as {
      name?: string;
      description?: string;
    };

    const db = await getDb();
    const category = await db.createCategory({
      tenantId: session.tenantId,
      name: body.name || "",
      description: body.description,
    });
    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json({ category, overview }, { status: 201 });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to create category.",
      400,
    );
  }
}

export async function DELETE(request: Request) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId")?.trim() || "";
    if (!categoryId) return jsonError("categoryId is required.", 400);

    const db = await getDb();
    await db.deleteCategory(session.tenantId, categoryId);
    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json({ overview });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to delete category.",
      400,
    );
  }
}

