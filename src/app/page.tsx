import { AliEmsApp } from "@/components/AliEmsApp";
import { getSessionFromCookies } from "@/lib/auth";
import { getDb, getStorageMode } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const storageMode = getStorageMode();

  try {
    const db = await getDb();
    const demoTenants = await db.listDemoTenants();
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
    const message =
      err instanceof Error ? err.message : "Database initialization failed.";
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-ink">
        <div className="glass-card max-w-lg rounded-2xl p-6 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-danger">
            Database Connection Error
          </div>
          <h1 className="text-lg font-semibold text-ink">
            AliEMS could not connect to MongoDB Atlas
          </h1>
          <p className="text-xs leading-relaxed text-ink-secondary">{message}</p>
          <p className="text-[11px] text-ink-muted">
            Verify <code className="glass-chip rounded px-1 py-0.5">MONGODB_URI</code>{" "}
            credentials and MongoDB Atlas IP Access List settings, then refresh.
          </p>
        </div>
      </main>
    );
  }
}
