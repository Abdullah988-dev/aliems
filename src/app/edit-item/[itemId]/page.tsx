import { redirect } from "next/navigation";
import { ItemFormRouteClient } from "@/components/ItemFormRouteClient";
import { getSessionFromCookies } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { itemIdSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/login");
  }

  const { itemId } = await params;
  const parsedId = itemIdSchema.safeParse(itemId);
  if (!parsedId.success) {
    redirect("/inventory");
  }

  const db = await getDb();
  const overview = await db.getTenantOverview(session.tenantId, session.userId);
  if (!overview) {
    redirect("/login");
  }

  // Strict IDOR enforcement: verify item belongs to authenticated caller's tenant
  const item = overview.items.find(
    (it) => !it.isDeleted && it.id === parsedId.data && it.tenantId === session.tenantId,
  );
  if (!item) {
    redirect("/inventory");
  }

  return <ItemFormRouteClient overview={overview} mode="edit" item={item} />;
}

