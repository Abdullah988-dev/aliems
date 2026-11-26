"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  ScanLine,
  Settings,
  X,
} from "lucide-react";
import { BillScannerSuppliersPanel } from "@/components/BillScannerSuppliersPanel";
import { InventoryManager } from "@/components/InventoryManager";
import { LedgerSettlementPanel } from "@/components/LedgerSettlementPanel";
import { SaleDispatchPanel } from "@/components/SaleDispatchPanel";
import { ThemeToggle } from "@/components/ThemeProvider";
import { WorkspaceSettings } from "@/components/WorkspaceSettings";
import { formatCurrency, formatDateTime, formatSignedCurrency } from "@/lib/format";
import { BUSINESS_PRESETS } from "@/lib/presets";
import type { TenantOverview } from "@/types/domain";

interface DashboardShellProps {
  overview: TenantOverview;
  onOverviewUpdate: (overview: TenantOverview) => void;
  onLoggedOut: () => void;
}

type ActiveTab = "overview" | "inventory" | "ledger" | "bills" | "workspace";

export function DashboardShell({
  overview,
  onOverviewUpdate,
  onLoggedOut,
}: DashboardShellProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const {
    tenant,
    user,
    metrics,
    categories,
    items,
    suppliers,
    ledger,
    settlements,
    storageMode,
  } = overview;

  const itemBrandById = useMemo(
    () => new Map(items.map((it) => [it.id, it.brand])),
    [items],
  );

  const preset = BUSINESS_PRESETS[tenant.businessType];
  const verticalTitle =
    tenant.businessType === "custom" && tenant.customBusinessLabel
      ? tenant.customBusinessLabel
      : preset.label;

  const navTabs = useMemo(
    () =>
      [
        {
          id: "overview" as const,
          label: "Overview & Dispatch",
          icon: LayoutDashboard,
        },
        {
          id: "inventory" as const,
          label: `Inventory & Categories (${items.length})`,
          icon: Boxes,
        },
        {
          id: "ledger" as const,
          label: "Ledger & Weekly Settlements",
          icon: ReceiptText,
        },
        {
          id: "bills" as const,
          label: `AI Bill Scanner & Suppliers (${suppliers.length})`,
          icon: ScanLine,
        },
        {
          id: "workspace" as const,
          label: "Workspace & Isolation",
          icon: Settings,
        },
      ] as const,
    [items.length, suppliers.length],
  );

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileMenuOpen]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setLoggingOut(false);
      setMobileMenuOpen(false);
      onLoggedOut();
    }
  }

  return (
    <div className="min-h-screen overflow-x-clip text-ink">
      {/* Top Operational Glassmorphic Header */}
      <header className="glass-header sticky top-0 z-30">
        {/* Mobile Minimal Header (< 768px) */}
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 md:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="neu-btn-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold tracking-tight">
              AE
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight text-ink">
                AliEMS
              </div>
              <div className="truncate text-[11px] text-ink-muted">
                {tenant.businessName}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="glass-subpanel inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-2.5 py-1 text-[11px]">
              {storageMode === "mongodb" ? (
                <>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <span className="whitespace-nowrap font-semibold text-ink">
                    Live DB
                  </span>
                </>
              ) : (
                <>
                  <Database className="h-3 w-3 shrink-0 text-accent" />
                  <span className="whitespace-nowrap font-medium text-ink">
                    Fallback
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-drawer"
              className="neu-btn inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-ink"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Desktop / Laptop Top Header (>= 768px — Unchanged) */}
        <div className="mx-auto hidden max-w-7xl items-center justify-between gap-3 px-6 py-3.5 md:flex">
          <div className="flex min-w-0 items-center gap-3">
            <div className="neu-btn-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold tracking-tight">
              AE
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-ink">
                  AliEMS
                </span>
                <span className="text-xs text-ink-muted">|</span>
                <h1 className="truncate text-sm font-medium text-ink-secondary">
                  Ali Electronic Management System
                </h1>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
                <span className="max-w-full truncate font-medium text-ink">
                  {tenant.businessName}
                </span>
                <span>·</span>
                <span className="truncate">{verticalTitle}</span>
                <span>·</span>
                <span className="text-[11px]">{preset.dashboardFocus}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div
              className="glass-subpanel hidden items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] lg:flex"
              title={`Tenant Partition: ${tenant.id}`}
            >
              <span className="text-ink-muted">Partition:</span>
              <span className="tabular-nums font-medium text-ink">
                {tenant.id}
              </span>
            </div>

            <div className="glass-subpanel inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px]">
              {storageMode === "mongodb" ? (
                <>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <span className="whitespace-nowrap font-semibold text-ink">
                    Live DB
                  </span>
                </>
              ) : (
                <>
                  <Database className="h-3 w-3 shrink-0 text-accent" />
                  <span className="whitespace-nowrap font-medium text-ink">
                    Fallback Mode
                  </span>
                </>
              )}
            </div>

            <div className="text-right text-xs">
              <div className="font-medium text-ink">{user.fullName}</div>
              <div className="text-[11px] text-ink-muted">{user.email}</div>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />

              <button
                type="button"
                disabled={loggingOut}
                onClick={handleLogout}
                className="neu-btn inline-flex h-9 min-h-[36px] items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium text-ink"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0 text-ink-secondary" />
                <span className="whitespace-nowrap">Sign Out</span>
              </button>
            </div>
          </div>
        </div>

        {/* Desktop / Laptop Navigation Tabs (>= 768px — Hidden on Mobile) */}
        <div className="no-scrollbar mx-auto hidden max-w-7xl gap-2 overflow-x-auto px-6 pb-3 pt-1 md:flex">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`tabular-nums inline-flex h-9 min-h-[36px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-xs font-medium transition-all ${
                  active ? "neu-btn-primary" : "neu-btn text-ink-secondary"
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${active ? "text-white" : "text-accent"}`}
                />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Mobile Slide-Out Sidebar Backdrop Overlay (< 768px) */}
      <div
        aria-hidden={!mobileMenuOpen}
        onClick={() => setMobileMenuOpen(false)}
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          mobileMenuOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />

      {/* Mobile Slide-Out Sidebar Drawer (< 768px) */}
      <aside
        id="mobile-nav-drawer"
        aria-label="Mobile Navigation"
        aria-hidden={!mobileMenuOpen}
        className={`glass-drawer fixed inset-y-0 left-0 z-50 flex w-72 max-w-[82vw] flex-col transition-transform duration-300 ease-out md:hidden ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drawer Header */}
        <div className="glass-divider-b flex items-center justify-between gap-2 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="neu-btn-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold tracking-tight">
              AE
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">
                AliEMS
              </div>
              <div className="truncate text-[11px] text-ink-muted">
                {tenant.businessName}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
            className="neu-btn flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-ink-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Operator Summary */}
        <div className="px-4 pt-3.5">
          <div className="glass-subpanel rounded-xl px-3 py-2.5 text-xs">
            <div className="truncate font-semibold text-ink">{user.fullName}</div>
            <div className="truncate text-[11px] text-ink-muted">{user.email}</div>
            <div
              className="mt-1.5 flex items-center justify-between gap-2 pt-1.5 text-[11px]"
              style={{ borderTop: "1px solid var(--glass-divider)" }}
            >
              <span className="text-ink-muted">{verticalTitle}</span>
              <span className="inline-flex items-center gap-1 font-medium text-ink">
                {storageMode === "mongodb" ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Live DB
                  </>
                ) : (
                  "Fallback"
                )}
              </span>
            </div>
          </div>
        </div>

        {/* All Main Navigation Links */}
        <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setMobileMenuOpen(false);
                }}
                className={`tabular-nums flex min-h-[46px] w-full items-center gap-3 rounded-xl px-3.5 text-left text-sm font-medium transition-all ${
                  active ? "neu-btn-primary" : "neu-btn text-ink-secondary"
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-accent"}`}
                />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Drawer Footer: Theme Toggle + Sign Out */}
        <div
          className="space-y-2.5 p-4"
          style={{ borderTop: "1px solid var(--glass-divider)" }}
        >
          <ThemeToggle showLabelAlways className="w-full justify-center" />
          <button
            type="button"
            disabled={loggingOut}
            onClick={handleLogout}
            className="neu-btn flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium text-danger"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>{loggingOut ? "Signing Out..." : "Sign Out"}</span>
          </button>
        </div>
      </aside>

      <main className="mx-auto max-w-7xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-6">
        {/* Core Dual-Balance KPI Strip */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          <div className="glass-card min-w-0 rounded-2xl p-4 sm:p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
              Inventory Asset Value (At Cost)
            </div>
            <div className="tabular-nums mt-2 break-words text-lg font-semibold tracking-tight text-ink sm:text-xl xl:text-2xl">
              {formatCurrency(metrics.inventoryAssetValue, tenant.currency)}
            </div>
            <div className="mt-1.5 text-[11px] text-ink-muted">
              Deducted strictly at cost price on sale
            </div>
          </div>

          <div className="glass-card-accent min-w-0 rounded-2xl p-4 sm:p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              Running Receivable Balance
            </div>
            <div className="tabular-nums mt-2 break-words text-lg font-semibold tracking-tight text-accent sm:text-xl xl:text-2xl">
              {formatCurrency(metrics.runningReceivableBalance, tenant.currency)}
            </div>
            <div className="mt-1.5 text-[11px] text-ink-secondary">
              Sale value routed for weekly settlement
            </div>
          </div>

          <div className="glass-card min-w-0 rounded-2xl p-4 sm:p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
              This Week Dispatched
            </div>
            <div className="tabular-nums mt-2 break-words text-lg font-semibold tracking-tight text-ink sm:text-xl xl:text-2xl">
              {formatCurrency(metrics.dispatchedThisWeekSaleTotal, tenant.currency)}
            </div>
            <div className="tabular-nums mt-1.5 text-[11px] text-ink-muted">
              Cost: {formatCurrency(metrics.dispatchedThisWeekCostTotal, tenant.currency)}{" "}
              · Settled: {formatCurrency(metrics.settledThisWeekTotal, tenant.currency)}
            </div>
          </div>

          <div className="glass-card min-w-0 rounded-2xl p-4 sm:p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
              Stock & Supplier Status
            </div>
            <div className="tabular-nums mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-lg font-semibold tracking-tight text-ink sm:text-xl xl:text-2xl">
              <span>{metrics.totalUnitsInStock}</span>
              <span className="text-xs font-normal text-ink-muted">
                units / {metrics.totalSkuCount} SKUs
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
              {metrics.lowStockCount > 0 ? (
                <span className="tabular-nums inline-flex items-center gap-1 font-medium text-warning">
                  <AlertTriangle className="h-3 w-3 shrink-0 text-warning-icon" />
                  {metrics.lowStockCount} SKU(s) at or below reorder threshold
                </span>
              ) : (
                <span className="text-success">All SKUs above reorder threshold</span>
              )}
            </div>
          </div>
        </section>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="grid gap-5 sm:gap-6 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-5">
              <SaleDispatchPanel
                currency={tenant.currency}
                items={items}
                categories={categories}
                currentInventoryValue={metrics.inventoryAssetValue}
                currentReceivableBalance={metrics.runningReceivableBalance}
                onOverviewUpdate={onOverviewUpdate}
              />
            </div>

            <div className="min-w-0 space-y-5 sm:space-y-6 lg:col-span-7">
              {/* Provisioned Categories Quick Strip */}
              <div className="glass-card min-w-0 rounded-2xl p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                    Active Categories ({categories.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab("inventory")}
                    className="neu-btn inline-flex min-h-[44px] items-center rounded-xl px-3 text-xs font-medium text-accent sm:min-h-[32px] sm:rounded-lg sm:px-2.5 sm:py-1"
                  >
                    Open Full Inventory
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {categories.map((cat) => {
                    const count = items.filter((i) => i.categoryId === cat.id).length;
                    return (
                      <span
                        key={cat.id}
                        className="glass-subpanel rounded-lg px-2.5 py-1 text-xs text-ink"
                      >
                        {cat.name}{" "}
                        <span className="tabular-nums text-ink-muted">({count})</span>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Recent Ledger Activity */}
              <div className="glass-card min-w-0 overflow-hidden rounded-2xl">
                <div className="glass-divider-b flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5">
                  <h2 className="text-sm font-semibold text-ink">
                    Recent Ledger Postings
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab("ledger")}
                    className="neu-btn inline-flex min-h-[44px] items-center rounded-xl px-3 text-xs font-medium text-accent sm:min-h-[32px] sm:rounded-lg sm:px-2.5 sm:py-1"
                  >
                    Weekly Settlement & Full Ledger
                  </button>
                </div>
                <div className="table-scroll-container">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="glass-thead text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                        <th className="whitespace-nowrap px-4 py-2.5">Ref & Time</th>
                        <th className="min-w-[180px] px-4 py-2.5">Activity & Party</th>
                        <th className="whitespace-nowrap px-4 py-2.5 text-right">
                          Inv Cost
                        </th>
                        <th className="whitespace-nowrap px-4 py-2.5 text-right">
                          Receivable
                        </th>
                      </tr>
                    </thead>
                    <tbody className="glass-tbody">
                      {ledger.slice(0, 7).map((entry) => {
                        const resolvedBrand =
                          entry.itemBrand ||
                          (entry.itemId ? itemBrandById.get(entry.itemId) : undefined);
                        return (
                          <tr key={entry.id} className="glass-row-hover">
                            <td className="whitespace-nowrap px-4 py-2.5">
                              <div className="tabular-nums font-medium text-ink">
                                {entry.reference}
                              </div>
                              <div className="tabular-nums text-[11px] text-ink-muted">
                                {formatDateTime(entry.createdAt)}
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-ink">
                                {entry.itemName
                                  ? `${entry.quantity ?? ""}x ${entry.itemName}${
                                      resolvedBrand ? ` (${resolvedBrand})` : ""
                                    }`
                                  : entry.type === "SUPPLIER_BALANCE"
                                    ? "Supplier Balance"
                                    : "Weekly Settlement"}
                              </div>
                              <div className="text-[11px] text-ink-muted">
                                {entry.partyName ? (
                                  <span className="font-medium text-accent">
                                    {entry.type === "WEEKLY_SETTLEMENT"
                                      ? `Recipient: ${entry.partyName}`
                                      : entry.type === "SUPPLIER_BALANCE" ||
                                          entry.type === "STOCK_IN"
                                        ? `Supplier: ${entry.partyName}`
                                        : `Customer: ${entry.partyName}`}
                                    {" · "}
                                  </span>
                                ) : null}
                                {entry.notes}
                              </div>
                            </td>
                            <td
                              className={`tabular-nums whitespace-nowrap px-4 py-2.5 text-right font-medium ${
                                entry.inventoryCostDelta < 0
                                  ? "text-danger"
                                  : entry.inventoryCostDelta > 0
                                    ? "text-success"
                                    : "text-ink-muted"
                              }`}
                            >
                              {entry.inventoryCostDelta === 0
                                ? "—"
                                : formatSignedCurrency(
                                    entry.inventoryCostDelta,
                                    tenant.currency,
                                  )}
                            </td>
                            <td
                              className={`tabular-nums whitespace-nowrap px-4 py-2.5 text-right font-medium ${
                                entry.receivableDelta > 0
                                  ? "text-accent"
                                  : entry.receivableDelta < 0
                                    ? "text-success"
                                    : "text-ink-muted"
                              }`}
                            >
                              {entry.receivableDelta === 0
                                ? "—"
                                : formatSignedCurrency(
                                    entry.receivableDelta,
                                    tenant.currency,
                                  )}
                            </td>
                          </tr>
                        );
                      })}
                      {ledger.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-6 text-center text-xs text-ink-muted"
                          >
                            No ledger entries yet. Add stock or dispatch a sale to begin.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "inventory" && (
          <InventoryManager
            currency={tenant.currency}
            skuPrefix={tenant.skuPrefix}
            categories={categories}
            items={items}
            suppliers={suppliers}
            onOverviewUpdate={onOverviewUpdate}
            onOpenBillScanner={() => setActiveTab("bills")}
          />
        )}

        {activeTab === "ledger" && (
          <LedgerSettlementPanel
            currency={tenant.currency}
            runningReceivableBalance={metrics.runningReceivableBalance}
            items={items}
            suppliers={suppliers}
            ledger={ledger}
            settlements={settlements}
            onOverviewUpdate={onOverviewUpdate}
            onOpenSuppliers={() => setActiveTab("bills")}
          />
        )}

        {activeTab === "bills" && (
          <BillScannerSuppliersPanel
            currency={tenant.currency}
            suppliers={suppliers}
            onOverviewUpdate={onOverviewUpdate}
          />
        )}

        {activeTab === "workspace" && (
          <WorkspaceSettings
            overview={overview}
            onOverviewUpdate={onOverviewUpdate}
          />
        )}
      </main>
    </div>
  );
}
