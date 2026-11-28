"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FileDown, Landmark, Wallet } from "lucide-react";
import { CashFlowPdfModal } from "@/components/CashFlowPdfModal";
import { getCurrentWeekLabel } from "@/lib/accounting";
import { formatCurrency, formatDateTime, formatSignedCurrency } from "@/lib/format";
import type {
  InventoryItem,
  LedgerEntry,
  LedgerEntryType,
  SupplierAccount,
  TenantOverview,
  WeeklySettlement,
} from "@/types/domain";

interface LedgerSettlementPanelProps {
  currency: string;
  runningReceivableBalance: number;
  items: InventoryItem[];
  suppliers?: SupplierAccount[];
  ledger: LedgerEntry[];
  settlements: WeeklySettlement[];
  onOverviewUpdate: (overview: TenantOverview) => void;
  onOpenSuppliers?: () => void;
}

const ENTRY_TYPE_LABELS: Record<LedgerEntryType, string> = {
  OPENING_STOCK: "Opening Stock",
  STOCK_IN: "Stock In",
  SALE_DISPATCH: "Sale Dispatch",
  WEEKLY_SETTLEMENT: "Weekly Settlement",
  STOCK_ADJUSTMENT: "Audit Adjust",
  SUPPLIER_BALANCE: "Supplier Balance",
};

export function LedgerSettlementPanel({
  currency,
  runningReceivableBalance,
  items,
  suppliers = [],
  ledger,
  settlements,
  onOverviewUpdate,
  onOpenSuppliers,
}: LedgerSettlementPanelProps) {
  const [filterType, setFilterType] = useState<LedgerEntryType | "ALL">("ALL");
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfInitialSupplierId, setPdfInitialSupplierId] = useState<
    string | undefined
  >(undefined);

  const itemBrandById = useMemo(
    () => new Map(items.map((it) => [it.id, it.brand])),
    [items],
  );

  // Weekly settlement form state
  const [settledAmount, setSettledAmount] = useState<string>(
    runningReceivableBalance > 0 ? String(runningReceivableBalance) : "",
  );
  const [weekLabel, setWeekLabel] = useState<string>(getCurrentWeekLabel());
  const [recipientName, setRecipientName] = useState<string>("");
  const [method, setMethod] =
    useState<WeeklySettlement["settlementMethod"]>("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const filteredLedger = useMemo(() => {
    if (filterType === "ALL") return ledger;
    return ledger.filter((entry) => entry.type === filterType);
  }, [ledger, filterType]);

  async function handleRecordSettlement(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const amount = Number(settledAmount);
      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settledAmount: amount,
          weekLabel,
          recipientName: recipientName.trim(),
          settlementMethod: method,
          reference,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Settlement failed.");
      onOverviewUpdate(data.overview);
      setRecipientName("");
      setReference("");
      setNotes("");
      const nextRemaining = data.overview.metrics.runningReceivableBalance;
      setSettledAmount(nextRemaining > 0 ? String(nextRemaining) : "");
      setSuccessMsg(
        `Recorded weekly settlement of ${formatCurrency(
          amount,
          currency,
        )}. Remaining receivable: ${formatCurrency(nextRemaining, currency)}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settlement failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <CashFlowPdfModal
        open={pdfModalOpen}
        currency={currency}
        suppliers={suppliers}
        initialSupplierId={pdfInitialSupplierId}
        onClose={() => setPdfModalOpen(false)}
      />

      {/* A4 Cash Flow Export Action Banner */}
      <div className="glass-card flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink">
            Supplier cash flow statement (A4 PDF)
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">
            Export printable A4 supplier statements with continuous carry-forward balances.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPdfInitialSupplierId(suppliers[0]?.id || "BLANK_MANUAL");
            setPdfModalOpen(true);
          }}
          className="neu-btn-primary inline-flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-xs font-medium sm:h-10 sm:min-h-[40px] sm:w-auto"
        >
          <FileDown className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span>Generate Cash Flow PDF</span>
        </button>
      </div>

      {/* Top Row: Weekly Settlement Recorder + Settlement History */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="glass-card min-w-0 overflow-hidden rounded-xl lg:col-span-5">
          <div className="glass-divider-b flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
              <h2 className="text-sm font-medium text-ink">
                Record weekly settlement
              </h2>
            </div>
            <span className="tabular-nums text-xs font-medium text-accent">
              Open: {formatCurrency(runningReceivableBalance, currency)}
            </span>
          </div>

          <form onSubmit={handleRecordSettlement} className="space-y-4 p-4 sm:p-5">
            {error && (
              <div className="alert-danger rounded-xl px-3.5 py-2.5 text-xs font-medium">
                {error}
              </div>
            )}
            {successMsg && (
              <div className="alert-success flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Settlement Amount ({currency})
                </label>
                <input
                  type="number"
                  min={0.01}
                  max={runningReceivableBalance || undefined}
                  step="0.01"
                  required
                  disabled={runningReceivableBalance <= 0}
                  value={settledAmount}
                  onChange={(e) => setSettledAmount(e.target.value)}
                  className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Settlement Week
                </label>
                <input
                  type="text"
                  required
                  value={weekLabel}
                  onChange={(e) => setWeekLabel(e.target.value)}
                  className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Recipient / Party Name (Optional)
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="e.g., Main Treasury / Ali"
                  className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Clearing Method
                </label>
                <select
                  value={method}
                  onChange={(e) =>
                    setMethod(
                      e.target.value as WeeklySettlement["settlementMethod"],
                    )
                  }
                  className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash_handover">Cash Handover</option>
                  <option value="cheque">Cheque Clearing</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Reference ID
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="STL-WK-02 (optional)"
                  className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Settlement Note
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Weekly clearance note"
                  className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5">
              <button
                type="submit"
                disabled={submitting || runningReceivableBalance <= 0}
                className="neu-btn-primary min-h-[44px] w-full rounded-xl px-4 text-sm font-medium sm:h-10 sm:min-h-[40px] sm:flex-1 sm:text-xs"
              >
                {submitting ? "Posting Settlement..." : "Post Weekly Settlement"}
              </button>
              {runningReceivableBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setSettledAmount(String(runningReceivableBalance))}
                  className="neu-btn min-h-[44px] w-full rounded-xl px-3.5 text-sm font-medium text-ink-secondary sm:h-10 sm:min-h-[40px] sm:w-auto sm:text-xs"
                >
                  Fill Full Balance
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Settlement History */}
        <div className="glass-card min-w-0 overflow-hidden rounded-xl lg:col-span-7">
          <div className="glass-divider-b px-4 py-3.5 sm:px-5">
            <h2 className="text-sm font-medium text-ink">
              Weekly settlement history ({settlements.length})
            </h2>
          </div>
          <div className="table-scroll-container">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="glass-thead text-xs font-medium text-ink-secondary">
                  <th className="whitespace-nowrap px-4 py-2.5">Date &amp; ref</th>
                  <th className="min-w-[150px] px-4 py-2.5">
                    Recipient &amp; week
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right">
                    Before
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right">
                    Settled
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right">
                    After
                  </th>
                </tr>
              </thead>
              <tbody className="glass-tbody">
                {settlements.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-xs text-ink-muted"
                    >
                      No weekly settlements posted yet.
                    </td>
                  </tr>
                ) : (
                  settlements.map((s) => (
                    <tr key={s.id} className="glass-row-hover">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <div className="tabular-nums font-medium text-ink">
                          {s.reference}
                        </div>
                        <div className="tabular-nums text-[11px] text-ink-muted">
                          {formatDateTime(s.createdAt)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-ink">
                          {s.recipientName || "Direct / Unspecified"}
                        </div>
                        <div className="text-[11px] capitalize text-ink-muted">
                          {s.weekLabel} · {s.settlementMethod.replace("_", " ")}
                        </div>
                      </td>
                      <td className="tabular-nums whitespace-nowrap px-4 py-2.5 text-right text-ink-secondary">
                        {formatCurrency(s.receivableBefore, currency)}
                      </td>
                      <td className="tabular-nums whitespace-nowrap px-4 py-2.5 text-right font-semibold text-success">
                        {formatCurrency(s.settledAmount, currency)}
                      </td>
                      <td className="tabular-nums whitespace-nowrap px-4 py-2.5 text-right font-medium text-ink">
                        {formatCurrency(s.receivableAfter, currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Full Running Account Ledger */}
      <div className="glass-card min-w-0 overflow-hidden rounded-xl">
        <div className="glass-divider-b flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-ink">
              Running stock &amp; receivable ledger ({filteredLedger.length})
            </h2>
            <p className="text-xs text-ink-muted">
              Audit log separating inventory cost deductions from receivable postings.
            </p>
          </div>
          <div className="no-scrollbar flex snap-x touch-pan-x gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {(
              [
                "ALL",
                "SALE_DISPATCH",
                "WEEKLY_SETTLEMENT",
                "STOCK_IN",
                "SUPPLIER_BALANCE",
                "OPENING_STOCK",
                "STOCK_ADJUSTMENT",
              ] as const
            ).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilterType(t)}
                className={`min-h-[44px] shrink-0 snap-start whitespace-nowrap rounded-lg px-3.5 py-1 text-xs font-medium transition-colors sm:min-h-[30px] sm:px-2.5 ${
                  filterType === t
                    ? "neu-pill-active"
                    : "neu-btn text-ink-secondary"
                }`}
              >
                {t === "ALL" ? "All entries" : ENTRY_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="table-scroll-container">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="glass-thead text-xs font-medium text-ink-secondary">
                <th className="whitespace-nowrap px-4 py-3">Time &amp; ref</th>
                <th className="whitespace-nowrap px-4 py-3">Event</th>
                <th className="min-w-[200px] px-4 py-3">
                  Item, party &amp; note
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  Inv delta
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  Receivable delta
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  Inv balance
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  Receivable balance
                </th>
              </tr>
            </thead>
            <tbody className="glass-tbody">
              {filteredLedger.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-xs text-ink-muted"
                  >
                    No ledger entries recorded for this filter.
                  </td>
                </tr>
              ) : (
                filteredLedger.map((entry) => {
                  const resolvedBrand =
                    entry.itemBrand ||
                    (entry.itemId ? itemBrandById.get(entry.itemId) : undefined);
                  return (
                    <tr key={entry.id} className="glass-row-hover">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <div className="font-mono-code tabular-nums font-medium text-ink">
                          {entry.reference}
                        </div>
                        <div className="tabular-nums text-xs text-ink-muted">
                          {formatDateTime(entry.createdAt)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="glass-subpanel rounded-md px-2 py-0.5 text-xs font-medium text-ink-secondary">
                          {ENTRY_TYPE_LABELS[entry.type]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-ink">
                          {entry.itemName
                            ? `${entry.quantity ?? ""}x ${entry.itemName}${
                                resolvedBrand ? ` (${resolvedBrand})` : ""
                              } · ${entry.itemSku}`
                            : entry.type === "SUPPLIER_BALANCE"
                              ? "Supplier Balance"
                              : "Receivable Settlement"}
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
                          : formatSignedCurrency(entry.inventoryCostDelta, currency)}
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
                          : formatSignedCurrency(entry.receivableDelta, currency)}
                      </td>
                      <td className="tabular-nums whitespace-nowrap px-4 py-2.5 text-right text-ink">
                        {formatCurrency(entry.inventoryCostBalanceAfter, currency)}
                      </td>
                      <td className="tabular-nums whitespace-nowrap px-4 py-2.5 text-right font-semibold text-ink">
                        {formatCurrency(entry.receivableBalanceAfter, currency)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Persisted Supplier Old Balance & Running Payable Ledger */}
      {suppliers.length > 0 && (
        <div className="glass-card min-w-0 overflow-hidden rounded-xl">
          <div className="glass-divider-b flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
              <h2 className="text-sm font-medium text-ink">
                Supplier payable summary ({suppliers.length})
              </h2>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => {
                  setPdfInitialSupplierId(suppliers[0]?.id || "BLANK_MANUAL");
                  setPdfModalOpen(true);
                }}
                className="neu-btn-primary inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs font-medium sm:min-h-[32px] sm:px-3 sm:py-1"
              >
                <FileDown className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span>Generate Cash Flow PDF</span>
              </button>
              {onOpenSuppliers && (
                <button
                  type="button"
                  onClick={onOpenSuppliers}
                  className="neu-btn inline-flex min-h-[44px] items-center justify-center rounded-lg px-3.5 text-xs font-medium text-ink-secondary sm:min-h-[32px] sm:px-3 sm:py-1"
                >
                  Manage suppliers
                </button>
              )}
            </div>
          </div>

          <div className="table-scroll-container">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="glass-thead text-xs font-medium text-ink-secondary">
                  <th className="min-w-[160px] px-4 py-2.5">Supplier</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right">
                    Old balance
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right">
                    Last bill
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right">
                    Updated balance
                  </th>
                </tr>
              </thead>
              <tbody className="glass-tbody">
                {suppliers.map((sup) => (
                  <tr key={sup.id} className="glass-row-hover">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-ink">
                        {sup.supplierName}
                      </div>
                      <div className="tabular-nums text-[11px] text-ink-muted">
                        Updated {formatDateTime(sup.updatedAt)}
                      </div>
                    </td>
                    <td className="tabular-nums whitespace-nowrap px-4 py-2.5 text-right font-medium text-warning">
                      {formatCurrency(sup.oldBalance, currency)}
                    </td>
                    <td className="tabular-nums whitespace-nowrap px-4 py-2.5 text-right text-ink">
                      {formatCurrency(sup.lastBillAmount, currency)}
                    </td>
                    <td className="tabular-nums whitespace-nowrap px-4 py-2.5 text-right font-semibold text-accent">
                      {formatCurrency(sup.runningBalance, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
