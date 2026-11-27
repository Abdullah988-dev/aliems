"use client";

import { useState } from "react";
import { CheckCircle2, Database, ShieldCheck } from "lucide-react";
import { BUSINESS_PRESETS } from "@/lib/presets";
import type { BusinessType, TenantOverview } from "@/types/domain";

interface WorkspaceSettingsProps {
  overview: TenantOverview;
  onOverviewUpdate: (overview: TenantOverview) => void;
}

export function WorkspaceSettings({
  overview,
  onOverviewUpdate,
}: WorkspaceSettingsProps) {
  const { tenant, user, storageMode } = overview;

  const [businessName, setBusinessName] = useState(tenant.businessName);
  const [businessType, setBusinessType] = useState<BusinessType>(
    tenant.businessType,
  );
  const [customBusinessLabel, setCustomBusinessLabel] = useState(
    tenant.customBusinessLabel || "",
  );
  const [currency, setCurrency] = useState(tenant.currency);
  const [provisionCategories, setProvisionCategories] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedMsg(null);
    setSaving(true);
    try {
      const res = await fetch("/api/tenant/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          businessType,
          customBusinessLabel,
          currency,
          provisionPresetCategories: provisionCategories,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update workspace.");
      onOverviewUpdate(data.overview);
      setSavedMsg("Workspace profile and category preset configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update workspace.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="glass-card min-w-0 overflow-hidden rounded-xl lg:col-span-7">
        <div className="glass-divider-b px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-medium text-ink">
            Business profile
          </h2>
        </div>

        <form onSubmit={handleSave} className="space-y-4 p-4 sm:p-5">
          {error && (
            <div className="alert-danger rounded-lg px-3.5 py-2.5 text-xs font-medium">
              {error}
            </div>
          )}
          {savedMsg && (
            <div className="alert-success flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>{savedMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                Business name
              </label>
              <input
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="neu-input min-h-[44px] w-full rounded-lg px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                Currency code
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="neu-input min-h-[44px] w-full rounded-lg px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
              >
                <option value="PKR">PKR</option>
                <option value="USD">USD</option>
                <option value="AED">AED</option>
                <option value="SAR">SAR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                Business type
              </label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value as BusinessType)}
                className="neu-input min-h-[44px] w-full rounded-lg px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
              >
                {(Object.keys(BUSINESS_PRESETS) as BusinessType[]).map((t) => (
                  <option key={t} value={t}>
                    {BUSINESS_PRESETS[t].label}
                  </option>
                ))}
              </select>
            </div>

            {businessType === "custom" && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Custom label
                </label>
                <input
                  type="text"
                  value={customBusinessLabel}
                  onChange={(e) => setCustomBusinessLabel(e.target.value)}
                  placeholder="Solar & Electrical"
                  className="neu-input min-h-[44px] w-full rounded-lg px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                />
              </div>
            )}
          </div>

          <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 py-1 text-xs text-ink-secondary">
            <input
              type="checkbox"
              checked={provisionCategories}
              onChange={(e) => setProvisionCategories(e.target.checked)}
              className="h-4 w-4 shrink-0 accent-[#0f4c5c]"
            />
            <span>
              Auto-provision missing preset categories for{" "}
              <strong className="font-medium text-ink">
                {BUSINESS_PRESETS[businessType].label}
              </strong>
            </span>
          </label>

          <button
            type="submit"
            disabled={saving}
            className="neu-btn-primary min-h-[44px] w-full rounded-lg px-5 text-sm font-medium sm:h-10 sm:min-h-[40px] sm:w-auto sm:text-xs"
          >
            {saving ? "Updating..." : "Save workspace profile"}
          </button>
        </form>
      </div>

      <div className="min-w-0 space-y-4 lg:col-span-5">
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
            <h3 className="text-sm font-medium text-ink">
              Tenant partition isolation
            </h3>
          </div>
          <dl className="mt-3 space-y-2.5 text-xs">
            <div className="glass-divider-b flex flex-wrap justify-between gap-2 pb-2">
              <dt className="text-ink-secondary">Tenant partition ID</dt>
              <dd className="font-mono-code tabular-nums break-all font-medium text-ink">
                {tenant.id}
              </dd>
            </div>
            <div className="glass-divider-b flex flex-wrap justify-between gap-2 pb-2">
              <dt className="text-ink-secondary">Authenticated operator</dt>
              <dd className="break-all font-medium text-ink sm:break-words">
                {user.fullName} ({user.email})
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-ink-secondary">SKU prefix</dt>
              <dd className="font-mono-code tabular-nums font-medium text-ink">
                {tenant.skuPrefix}
              </dd>
            </div>
          </dl>
        </div>

        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
            <h3 className="text-sm font-medium text-ink">
              Database adapter status
            </h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
            Active mode:{" "}
            <strong className="font-medium text-ink">
              {storageMode === "mongodb"
                ? "Live DB (MongoDB Atlas)"
                : "Local Fallback Mode"}
            </strong>
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            Set the{" "}
            <code className="font-mono-code glass-chip rounded px-1.5 py-0.5 text-xs">
              MONGODB_URI
            </code>{" "}
            environment variable to switch between local fallback and live MongoDB persistence.
          </p>
        </div>
      </div>
    </div>
  );
}
