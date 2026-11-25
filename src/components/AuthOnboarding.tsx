"use client";

import { useState } from "react";
import {
  ArrowRight,
  Building2,
  Cpu,
  Database,
  Layers,
  Lock,
  Refrigerator,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeProvider";
import { BUSINESS_PRESETS } from "@/lib/presets";
import type { BusinessType, TenantOverview } from "@/types/domain";

interface DemoTenantSummary {
  tenantId: string;
  businessName: string;
  businessType: BusinessType;
  email: string;
}

interface AuthOnboardingProps {
  storageMode: "mongodb" | "fallback";
  demoTenants: DemoTenantSummary[];
  onAuthenticated: (overview: TenantOverview) => void;
}

const BUSINESS_TYPE_ICONS: Record<BusinessType, typeof Cpu> = {
  appliances: Refrigerator,
  electronics: Cpu,
  mobile: Smartphone,
  custom: Layers,
};

export function AuthOnboarding({
  storageMode,
  demoTenants,
  onAuthenticated,
}: AuthOnboardingProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register + Dynamic Onboarding fields
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("appliances");
  const [customBusinessLabel, setCustomBusinessLabel] = useState("");
  const [customCategoriesRaw, setCustomCategoriesRaw] = useState(
    "Power Tools, Hardware, Accessories",
  );
  const [currency, setCurrency] = useState("PKR");
  const [fullName, setFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [includeStarterStock, setIncludeStarterStock] = useState(true);

  const selectedPreset = BUSINESS_PRESETS[businessType];
  const previewCategories =
    businessType === "custom"
      ? customCategoriesRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : selectedPreset.categories.map((c) => c.name);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sign in failed.");
      onAuthenticated(data.overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin(email: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "aliems-demo-pass" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Demo sign in failed.");
      onAuthenticated(data.overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const customCategories =
        businessType === "custom"
          ? customCategoriesRaw
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          businessType,
          customBusinessLabel:
            businessType === "custom" ? customBusinessLabel : undefined,
          customCategories,
          currency,
          fullName,
          email: regEmail,
          password: regPassword,
          includeStarterStock,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed.");
      onAuthenticated(data.overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen overflow-x-clip text-ink">
      <header className="glass-header sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl flex-col gap-2.5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6 sm:py-3.5">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="neu-btn-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold tracking-tight sm:h-10 sm:w-10 sm:text-sm">
              AE
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 sm:gap-2">
                <span className="text-sm font-semibold tracking-tight text-ink sm:text-base">
                  AliEMS
                </span>
                <span className="hidden text-xs text-ink-muted sm:inline">/</span>
                <span className="truncate text-xs font-medium text-ink-secondary">
                  Ali Electronic Management System
                </span>
              </div>
              <p className="truncate text-xs text-ink-muted">
                Multi-Tenant Back-Office Stock & Receivable Ledger
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <div className="glass-subpanel inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs sm:px-3">
              {storageMode === "mongodb" ? (
                <>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <span className="whitespace-nowrap font-semibold text-ink">
                    Live DB
                  </span>
                </>
              ) : (
                <>
                  <Database className="h-3.5 w-3.5 shrink-0 text-accent" />
                  <span className="hidden font-medium text-ink-secondary sm:inline">
                    Storage:
                  </span>
                  <span className="whitespace-nowrap font-semibold text-ink">
                    Fallback Mode
                  </span>
                </>
              )}
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-3 py-5 sm:gap-8 sm:px-6 sm:py-10 lg:grid-cols-12">
        {/* Left Architecture & Demo Panel */}
        <section className="min-w-0 space-y-6 lg:col-span-5">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">
              Operational Control Plane
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
              Strict cost-basis stock control and weekly receivable tracking.
            </h1>
            <p className="text-sm leading-relaxed text-ink-secondary">
              Built for electronics, mobile, and appliance dealers. Every registered
              business operates inside an isolated database partition with zero
              invoice clutter.
            </p>
          </div>

          <div className="glass-card glass-tbody rounded-2xl">
            <div className="flex items-start gap-3 p-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-ink">
                  Isolated Tenant Partitions
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">
                  Every session resolves strictly to its own{" "}
                  <code className="glass-chip rounded px-1.5 py-0.5 text-[11px] font-medium">
                    tenantId
                  </code>
                  . Inventory SKUs, ledger entries, and settlements never cross
                  accounts.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-ink">
                  Cost vs. Receivable Separation
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">
                  Dispatched sales deduct <strong>only cost price</strong> from
                  inventory value and route the <strong>sale price</strong> to your
                  running receivable balance for weekly settlement.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-ink">
                  Dynamic Business Onboarding
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">
                  Selecting Appliances, Electronics, Mobile, or Custom provisions
                  relevant stock categories and SKU prefixes automatically.
                </p>
              </div>
            </div>
          </div>

          {demoTenants.length > 0 && (
            <div className="glass-card rounded-2xl p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Pre-Seeded Test Workspaces
                </h3>
                <span className="text-[11px] text-ink-muted">
                  1-click isolation test
                </span>
              </div>
              <div className="space-y-2.5">
                {demoTenants.map((dt) => {
                  const Icon = BUSINESS_TYPE_ICONS[dt.businessType] || Layers;
                  return (
                    <button
                      key={dt.tenantId}
                      type="button"
                      disabled={loading}
                      onClick={() => handleDemoLogin(dt.email)}
                      className="neu-btn flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Icon className="h-4 w-4 shrink-0 text-accent" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-ink">
                            {dt.businessName}
                          </div>
                          <div className="truncate text-[11px] text-ink-muted">
                            {dt.email} · {BUSINESS_PRESETS[dt.businessType].label}
                          </div>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-ink-secondary" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Right Auth & Dynamic Onboarding Form */}
        <section className="min-w-0 lg:col-span-7">
          <div className="glass-card overflow-hidden rounded-2xl">
            <div className="glass-divider-b grid grid-cols-1 gap-2 p-2 min-[380px]:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className={`min-h-[44px] rounded-xl px-3 text-xs font-medium transition-all sm:h-10 sm:min-h-[40px] sm:text-sm ${
                  mode === "login"
                    ? "neu-btn-primary"
                    : "neu-btn text-ink-secondary"
                }`}
              >
                Sign In to Workspace
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
                className={`min-h-[44px] rounded-xl px-3 text-xs font-medium transition-all sm:h-10 sm:min-h-[40px] sm:text-sm ${
                  mode === "register"
                    ? "neu-btn-primary"
                    : "neu-btn text-ink-secondary"
                }`}
              >
                Register New Business
              </button>
            </div>

            <div className="p-4 sm:p-6">
              {error && (
                <div className="alert-danger mb-5 rounded-xl px-4 py-2.5 text-xs font-medium">
                  {error}
                </div>
              )}

              {mode === "login" ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                      Account Email
                    </label>
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="owner@business.com"
                      className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter password"
                      className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="neu-btn-primary min-h-[44px] w-full rounded-xl px-4 text-sm font-medium sm:h-10 sm:min-h-[40px]"
                  >
                    {loading ? "Signing In..." : "Open Workspace"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                        Business Name
                      </label>
                      <input
                        type="text"
                        required
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="e.g., Horizon Electronics"
                        className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                        Operating Currency
                      </label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                      >
                        <option value="PKR">PKR — Pakistani Rupee</option>
                        <option value="USD">USD — US Dollar</option>
                        <option value="AED">AED — UAE Dirham</option>
                        <option value="SAR">SAR — Saudi Riyal</option>
                        <option value="GBP">GBP — British Pound</option>
                      </select>
                    </div>
                  </div>

                  {/* Dynamic Business Type Selection */}
                  <div>
                    <label className="mb-2 block text-xs font-medium text-ink-secondary">
                      Select Business Type (Dynamic Dashboard & Category Setup)
                    </label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {(Object.keys(BUSINESS_PRESETS) as BusinessType[]).map((type) => {
                        const preset = BUSINESS_PRESETS[type];
                        const Icon = BUSINESS_TYPE_ICONS[type];
                        const active = businessType === type;
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setBusinessType(type)}
                            className={`flex min-h-[48px] items-start gap-2.5 rounded-xl p-3 text-left transition-all ${
                              active ? "neu-btn-primary" : "neu-btn"
                            }`}
                          >
                            <Icon
                              className={`mt-0.5 h-4 w-4 shrink-0 ${
                                active ? "text-white" : "text-accent"
                              }`}
                            />
                            <div className="min-w-0">
                              <div
                                className={`text-xs font-semibold ${
                                  active ? "text-white" : "text-ink"
                                }`}
                              >
                                {preset.label}
                              </div>
                              <div
                                className={`mt-0.5 text-[11px] leading-snug ${
                                  active ? "text-white/85" : "text-ink-secondary"
                                }`}
                              >
                                {preset.tagline}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {businessType === "custom" && (
                    <div className="glass-subpanel grid grid-cols-1 gap-4 rounded-xl p-3.5 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                          Custom Vertical Label
                        </label>
                        <input
                          type="text"
                          value={customBusinessLabel}
                          onChange={(e) => setCustomBusinessLabel(e.target.value)}
                          placeholder="e.g., Solar & Hardware"
                          className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                          Initial Categories (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={customCategoriesRaw}
                          onChange={(e) => setCustomCategoriesRaw(e.target.value)}
                          placeholder="Solar Panels, Inverters, Cables"
                          className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                        />
                      </div>
                    </div>
                  )}

                  {/* Auto-Provisioned Categories Preview */}
                  <div className="glass-subpanel rounded-xl p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="tabular-nums text-xs font-medium text-ink-secondary">
                        Auto-Provisioned Product Categories ({previewCategories.length})
                      </span>
                      <span className="text-[11px] font-semibold text-accent">
                        SKU Prefix: {selectedPreset.skuPrefix}
                      </span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {previewCategories.map((cat) => (
                        <span
                          key={cat}
                          className="glass-chip rounded-lg px-2.5 py-0.5 text-[11px] font-medium"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                    {selectedPreset.starterItems.length > 0 && (
                      <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2.5 py-1 text-xs text-ink-secondary">
                        <input
                          type="checkbox"
                          checked={includeStarterStock}
                          onChange={(e) => setIncludeStarterStock(e.target.checked)}
                          className="h-4 w-4 shrink-0 accent-[#0f4c5c]"
                        />
                        <span>
                          Pre-populate {selectedPreset.starterItems.length} starter stock
                          items for immediate testing
                        </span>
                      </label>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                        Operator Name
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Ali Raza"
                        className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                        Login Email
                      </label>
                      <input
                        type="email"
                        required
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="ali@shop.com"
                        className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                        Password
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Min 6 chars"
                        className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="neu-btn-primary min-h-[44px] w-full rounded-xl px-4 text-sm font-medium sm:h-10 sm:min-h-[40px]"
                  >
                    {loading
                      ? "Provisioning Isolated Workspace..."
                      : "Create Isolated Business Workspace"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
