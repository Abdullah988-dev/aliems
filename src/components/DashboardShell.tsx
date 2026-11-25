"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Database,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  ScanLine,
  Settings,
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

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setLoggingOut(false);
      onLoggedOut();
    }
  }

  return (
    <div className="min-h-screen overflow-x-clip text-ink">
      {/* Top Operational Glassmorphic Header */}
      <header className="glass-header sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl flex-col gap-2.5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6 sm:py-3.5">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="neu-btn-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold tracking-tight">
              AE
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 sm:gap-2">
                <span className="text-sm font-semibold tracking-tight text-ink">
                  AliEMS
                </span>
                <span className="hidden text-xs text-ink-muted sm:inline">|</span>
                <h1 className="truncate text-xs font-medium text-ink-secondary sm:text-sm">
                  Ali Electronic Management System
                </h1>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
                <span className="max-w-full truncate font-medium text-ink">
                  {tenant.businessName}
                </span>
                <span>·</span>
                <span className="truncate">{verticalTitle}</span>
                <span className="hidden md:inline">·</span>
                <span className="hidden text-[11px] md:inline">
                  {preset.dashboardFocus}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
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

            <div className="hidden text-right text-xs md:block">
              <div className="font-medium text-ink">{user.fullName}</div>
              <div className="text-[11px] text-ink-muted">{user.email}</div>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />

              <button
                type="button"
                disabled={loggingOut}
                onClick={handleLogout}
                className="neu-btn inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium text-ink sm:h-9 sm:min-h-[36px]"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0 text-ink-secondary" />
                <span className="whitespace-nowrap">Sign Out</span>
              </button>
            </div>
          </div>
        </div>

        {/* Responsive Scrollable Navigation Tabs */}
        <div
          className="no-scrollbar mx-auto flex max-w-7xl snap-x touch-pan-x gap-2 overflow-x-auto scroll-smooth px-3 pb-3 pt-1 sm:px-6"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {(
            [
              {
                id: "overview",
                label: "Overview & Dispatch",
                icon: LayoutDashboard,
              },
              {
                id: "inventory",
                label: `Inventory & Categories (${items.length})`,
                icon: Boxes,
              },
              {
                id: "ledger",
                label: "Ledger & Weekly Settlements",
                icon: ReceiptText,
              },
              {
                id: "bills",
                label: `AI Bill Scanner & Suppliers (${suppliers.length})`,
                icon: ScanLine,
              },
              {
                id: "workspace",
                label: "Workspace & Isolation",
                icon: Settings,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`tabular-nums inline-flex min-h-[44px] shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-xs font-medium transition-all sm:h-9 sm:min-h-[36px] ${
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
