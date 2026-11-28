import { redirect } from "next/navigation";
import { AdminConsoleClient } from "@/components/AdminConsoleClient";
import { getSessionFromCookies } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/login");
  }

  const db = await getDb();
  const overview = await db.getTenantOverview(session.tenantId, session.userId);
  if (!overview) {
    redirect("/login");
  }

  if (overview.user.role !== "owner") {
    redirect("/dashboard");
  }

  return <AdminConsoleClient overview={overview} />;
}

