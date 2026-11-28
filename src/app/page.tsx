import { AliEmsApp } from "@/components/AliEmsApp";
import { getSessionFromCookies } from "@/lib/auth";
import { getDb, getStorageMode } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const storageMode = getStorageMode();

  try {
    const db = await getDb();
    const allowDemoAccounts =
      process.env.NODE_ENV !== "production" ||
      process.env.ENABLE_DEMO_LOGIN === "true";
    const demoTenants = allowDemoAccounts ? await db.listDemoTenants() : [];
    const session = await getSessionFromCookies();

    const initialOverview = session
      ? await db.getTenantOverview(session.tenantId, session.userId)
      : null;

    return (
      <AliEmsApp
        initialOverview={initialOverview}
        storageMode={storageMode}
        demoTenants={demoTenants}
      />
    );
  } catch (err) {
    const rawMsg =
      err instanceof Error ? err.message : "Database initialization failed.";
    console.error("[HomePage] Initialization error:", rawMsg);
    const displayMessage =
      process.env.NODE_ENV === "production"
        ? "Service temporarily unavailable. Verify database configuration and network access."
        : rawMsg;

    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-ink">
        <div className="glass-card max-w-lg space-y-3 rounded-xl p-6">
          <div className="text-xs font-medium text-danger">
            Database connection error
          </div>
          <h1 className="text-lg font-semibold text-ink">
            AliEMS could not connect to the database
          </h1>
          <p className="text-xs leading-relaxed text-ink-secondary">
            {displayMessage}
          </p>
          <p className="text-xs text-ink-muted">
            Verify server configuration and network access settings, then refresh.
          </p>
        </div>
      </main>
    );
  }
}
