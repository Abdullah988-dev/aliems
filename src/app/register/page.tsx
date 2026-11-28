import { redirect } from "next/navigation";
import { LoginPageClient } from "@/components/AuthRouteClient";
import { getSessionFromCookies } from "@/lib/auth";
import { getDb, getStorageMode } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const session = await getSessionFromCookies();
  if (session) {
    redirect("/dashboard");
  }

  let storageMode = getStorageMode();
  let demoTenants: Awaited<
    ReturnType<Awaited<ReturnType<typeof getDb>>["listDemoTenants"]>
  > = [];

  try {
    const db = await getDb();
    storageMode = db.mode;
    const allowDemo =
      process.env.NODE_ENV !== "production" ||
      process.env.ENABLE_DEMO_LOGIN === "true";
    if (allowDemo) {
      demoTenants = await db.listDemoTenants();
    }
  } catch {
    demoTenants = [];
  }

  return (
    <LoginPageClient
      storageMode={storageMode}
      demoTenants={demoTenants}
      initialMode="register"
    />
  );
}

