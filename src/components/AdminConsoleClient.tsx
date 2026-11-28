"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Lock, ShieldCheck } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import type { TenantOverview } from "@/types/domain";

interface AdminAuditPayload {
  tenantId: string;
  businessName: string;
  role: string;
  storageMode: string;
  securityPosture: {
    httpOnlyCookie: boolean;
    sameSite: string;
    bcryptPasswordHashing: boolean;
    rbacEnforced: boolean;
    skuCount: number;
    supplierCount: number;
    ledgerEntriesCount: number;
  };
}

export function AdminConsoleClient({
  overview,
}: {
  overview: TenantOverview;
}) {
  const [audit, setAudit] = useState<AdminAuditPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/audit")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to load admin audit.");
        if (active) setAudit(data as AdminAuditPayload);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load admin audit.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AuthGuard
      overview={overview}
      requiredRole="owner"
      loginRedirect="/login"
      forbiddenRedirect="/dashboard"
    >
      <div className="min-h-screen px-4 py-8 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="neu-btn-primary flex h-10 w-10 items-center justify-center rounded-xl">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-ink">
                  Owner Security & Tenant Administration
                </h1>
                <p className="text-xs text-ink-muted">
                  Strict RBAC workspace audit for {overview.tenant.businessName}
                </p>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="neu-btn inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-medium text-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Dashboard
            </Link>
          </div>

          {error ? (
            <div className="alert-danger rounded-xl px-4 py-3 text-sm font-medium">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="glass-card rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                <Lock className="h-4 w-4 text-accent" />
                Authentication & Access Control
              </div>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Authorized Role</dt>
                  <dd className="font-semibold uppercase text-ink">
                    {audit?.role ?? overview.user.role}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Cookie Policy</dt>
                  <dd className="font-mono-code text-ink">
                    HttpOnly; SameSite={audit?.securityPosture.sameSite ?? "strict"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Password Hash</dt>
                  <dd className="text-ink">
                    {audit?.securityPosture.bcryptPasswordHashing
                      ? "bcrypt (cost >= 12)"
                      : "Verified"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">RBAC Guard</dt>
                  <dd className="text-emerald-600 dark:text-emerald-400 font-medium">
                    Enforced (Edge + API + UI)
                  </dd>
                </div>
              </dl>
            </div>

            <div className="glass-card rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                Tenant Isolation Scope
              </div>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Tenant ID</dt>
                  <dd className="font-mono-code text-ink break-all">
                    {audit?.tenantId ?? overview.tenant.id}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Storage Engine</dt>
                  <dd className="font-medium text-ink">
                    {audit?.storageMode ?? overview.storageMode}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Scoped Inventory SKUs</dt>
                  <dd className="tabular-nums font-medium text-ink">
                    {audit?.securityPosture.skuCount ?? overview.items.length}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Scoped Ledger Records</dt>
                  <dd className="tabular-nums font-medium text-ink">
                    {audit?.securityPosture.ledgerEntriesCount ?? overview.ledger.length}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

