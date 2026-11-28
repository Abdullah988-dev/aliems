import { NextResponse } from "next/server";
import { jsonError, requireApiSession, requireRole, safeApiError } from "@/lib/api-helpers";
import { getDb } from "@/lib/db";
import { enforceApiRateLimit } from "@/lib/rate-limit";
import { createCategorySchema, deleteCategorySchema, formatZodError } from "@/lib/validation";

export async function POST(request: Request) {
  const limited = enforceApiRateLimit(request, "categories:post");
  if (limited) return limited;

  if (new URL(request.url).search) {
    return jsonError("Query parameters are not permitted on state-changing requests.", 400);
  }

  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const rawBody = await request.json();
    const parsed = createCategorySchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError(formatZodError(parsed.error), 400);
    }

    const db = await getDb();
    const category = await db.createCategory({
      tenantId: session.tenantId,
      name: parsed.data.name,
      description: parsed.data.description,
    });
    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json({ category, overview }, { status: 201 });
  } catch (err) {
    return safeApiError(err, "Failed to create category.", 400, "POST /api/categories");
  }
}

export async function DELETE(request: Request) {
  const limited = enforceApiRateLimit(request, "categories:delete");
  if (limited) return limited;

  if (new URL(request.url).search) {
    return jsonError("Query parameters are not permitted on state-changing requests.", 400);
  }

  const { session, error } = await requireApiSession();
  if (error) return error;

  const roleErr = requireRole(session, ["owner"]);
  if (roleErr) return roleErr;

  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = deleteCategorySchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError(formatZodError(parsed.error), 400);
    }

    const db = await getDb();
    await db.deleteCategory(session.tenantId, parsed.data.categoryId);
    const overview = await db.getTenantOverview(session.tenantId, session.userId);
    return NextResponse.json({ overview });
  } catch (err) {
    return safeApiError(err, "Failed to delete category.", 400, "DELETE /api/categories");
  }
}
