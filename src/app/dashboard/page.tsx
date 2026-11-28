import { redirect } from "next/navigation";
import { DashboardRouteClient } from "@/components/DashboardRouteClient";
import { getSessionFromCookies } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/login");
  }

  const db = await getDb();
  const overview = await db.getTenantOverview(session.tenantId, session.userId);
  if (!overview) {
    redirect("/login");
  }

  return <DashboardRouteClient initialOverview={overview} />;
}

