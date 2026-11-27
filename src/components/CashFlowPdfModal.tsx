"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileDown, Printer, X } from "lucide-react";
import {
  formatPeriodRangeLabel,
  getMonthDateBounds,
  getRecentWeekOptions,
  getWeekDateBounds,
} from "@/lib/cashflow-ledger";
import { formatCurrency } from "@/lib/format";
import { generateWeeklyCashFlowPdf } from "@/lib/pdf/weekly-cashflow-ledger";
import type {
  CashFlowPeriodType,
  SupplierAccount,
  WeeklyCashFlowReportData,
} from "@/types/domain";

interface CashFlowPdfModalProps {
  open: boolean;
  currency: string;
  suppliers: SupplierAccount[];
  initialSupplierId?: string;
  onClose: () => void;
}

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export function CashFlowPdfModal({
  open,
  currency,
  suppliers,
  initialSupplierId,
  onClose,
}: CashFlowPdfModalProps) {
  const weekOptions = useMemo(() => getRecentWeekOptions(12), []);
  const currentWeek = weekOptions[0];
  const currentMonthBounds = useMemo(() => getMonthDateBounds(), []);
  const nowYear = new Date().getUTCFullYear();
  const yearOptions = [nowYear - 1, nowYear, nowYear + 1];

  const [selectedSupplier, setSelectedSupplier] = useState<string>(
    initialSupplierId || suppliers[0]?.id || "BLANK_MANUAL",
  );
  const [periodType, setPeriodType] = useState<CashFlowPeriodType>("weekly");

  // Weekly state
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(
    currentWeek.startDate,
  );

  // Monthly state
  const [selectedYear, setSelectedYear] = useState<string>(
    currentMonthBounds.startDate.slice(0, 4),
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(
    currentMonthBounds.startDate.slice(5, 7),
  );

  // Custom date range state
  const [customFromDate, setCustomFromDate] = useState<string>(
    currentWeek.startDate,
  );
  const [customToDate, setCustomToDate] = useState<string>(currentWeek.endDate);

  const [blankRows, setBlankRows] = useState<string>("0");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccessMsg(null);
    if (initialSupplierId) {
      setSelectedSupplier(initialSupplierId);
    } else if (
      selectedSupplier !== "BLANK_MANUAL" &&
      !suppliers.some((s) => s.id === selectedSupplier)
    ) {
      setSelectedSupplier(suppliers[0]?.id || "BLANK_MANUAL");
    }
  }, [open, initialSupplierId, suppliers, selectedSupplier]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !generating) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, generating, onClose]);

  const resolvedPeriod = useMemo(() => {
    if (periodType === "weekly") {
      return getWeekDateBounds(selectedWeekStart);
    }
    if (periodType === "monthly") {
      return getMonthDateBounds(`${selectedYear}-${selectedMonth}`);
    }
    const startDate = customFromDate || currentWeek.startDate;
    const endDate = customToDate || currentWeek.endDate;
    const normalizedStart = startDate <= endDate ? startDate : endDate;
    const normalizedEnd = startDate <= endDate ? endDate : startDate;
    return {
      startDate: normalizedStart,
      endDate: normalizedEnd,
      label: formatPeriodRangeLabel(normalizedStart, normalizedEnd),
    };
  }, [
    periodType,
    selectedWeekStart,
    selectedYear,
    selectedMonth,
    customFromDate,
    customToDate,
    currentWeek.startDate,
    currentWeek.endDate,
  ]);

  if (!open) return null;

  async function handleGeneratePdf(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const parsedBlank = Number(blankRows);
    if (!Number.isFinite(parsedBlank) || parsedBlank < 0 || parsedBlank > 40) {
      setError("Extra handwritten rows must be between 0 and 40.");
      return;
    }

    setGenerating(true);
    try {
      const qs = new URLSearchParams({
        supplier: selectedSupplier,
        periodType,
        startDate: resolvedPeriod.startDate,
        endDate: resolvedPeriod.endDate,
        periodLabel: resolvedPeriod.label,
        blankRows: String(Math.round(parsedBlank)),
      });

      const res = await fetch(`/api/reports/weekly-cashflow?${qs.toString()}`);
      const data = (await res.json().catch(() => ({}))) as {
        report?: WeeklyCashFlowReportData;
        error?: string;
      };

      if (!res.ok || !data.report) {
        throw new Error(
          data.error || `Failed to load cash flow data (HTTP ${res.status}).`,
        );
      }

      const filename = generateWeeklyCashFlowPdf(data.report);
      setSuccessMsg(
        `Generated vector A4 PDF "${filename}" (${data.report.rows.length} entry row(s) + ${data.report.blankRows} blank handwritten row(s)).`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to generate Weekly Cash Flow PDF.",
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div
      className="liquid-glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cashflow-pdf-modal-title"
      onClick={() => {
        if (!generating) onClose();
      }}
    >
      <form
        onSubmit={handleGeneratePdf}
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-modal max-h-[90vh] w-full max-w-[95vw] overflow-y-auto overscroll-contain p-4 sm:max-w-lg sm:p-6"
      >
        <div className="relative z-10 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="glass-subpanel flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-secondary">
                <Printer className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <h3
                  id="cashflow-pdf-modal-title"
                  className="break-words text-base font-medium text-ink"
                >
                  Supplier cash flow PDF
                </h3>
                <p className="text-xs text-ink-muted">
                  A4 receivable statement
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={generating}
              onClick={onClose}
              aria-label="Close modal"
              className="neu-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-secondary sm:h-8 sm:w-8"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="alert-danger flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="alert-success flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* 1. Supplier Selector */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
              1. Select Supplier or Blank Printable Sheet
            </label>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
            >
              {suppliers.map((sup) => (
                <option key={sup.id} value={sup.id}>
                  {sup.supplierName.toUpperCase()} — Running Bal:{" "}
                  {formatCurrency(sup.runningBalance, currency)}
                </option>
              ))}
              <option value="BLANK_MANUAL">
                Blank Manual Sheet (Empty Printable A4 Ledger)
              </option>
            </select>
          </div>

          {/* 2. Period Filter */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
              2. Statement Period Filter
            </label>
            <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-3">
              {(
                [
                  { id: "weekly", label: "Weekly" },
                  { id: "monthly", label: "Monthly" },
                  { id: "custom", label: "Custom Range" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPeriodType(opt.id)}
                  className={`min-h-[44px] rounded-xl px-3 text-xs font-medium transition-all sm:h-9 sm:min-h-[36px] ${
                    periodType === opt.id
                      ? "neu-btn-primary"
                      : "neu-btn text-ink-secondary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {periodType === "weekly" && (
            <div className="glass-subpanel space-y-3 rounded-xl p-3.5">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-ink-secondary">
                  Choose Business Week (Mon – Sun)
                </label>
                <select
                  value={
                    weekOptions.some((w) => w.startDate === selectedWeekStart)
                      ? selectedWeekStart
                      : "__custom_week"
                  }
                  onChange={(e) => {
                    if (e.target.value !== "__custom_week") {
                      setSelectedWeekStart(e.target.value);
                    }
                  }}
                  className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-9 sm:min-h-[36px] sm:px-3 sm:text-xs"
                >
                  {weekOptions.map((w) => (
                    <option key={w.startDate} value={w.startDate}>
                      {w.label}
                    </option>
                  ))}
                  {!weekOptions.some((w) => w.startDate === selectedWeekStart) && (
                    <option value="__custom_week">{resolvedPeriod.label}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-ink-secondary">
                  Or Jump to Any Date in Target Week
                </label>
                <input
                  type="date"
                  value={selectedWeekStart}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedWeekStart(
                        getWeekDateBounds(e.target.value).startDate,
                      );
                    }
                  }}
                  className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-9 sm:min-h-[36px] sm:px-3 sm:text-xs"
                />
              </div>
            </div>
          )}

          {periodType === "monthly" && (
            <div className="glass-subpanel grid grid-cols-1 gap-3 rounded-xl p-3.5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-ink-secondary">
                  Month
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-9 sm:min-h-[36px] sm:px-3 sm:text-xs"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-ink-secondary">
                  Year
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-9 sm:min-h-[36px] sm:px-3 sm:text-xs"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {periodType === "custom" && (
            <div className="glass-subpanel grid grid-cols-1 gap-3 rounded-xl p-3.5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-ink-secondary">
                  From Date
                </label>
                <input
                  type="date"
                  required
                  value={customFromDate}
                  onChange={(e) => setCustomFromDate(e.target.value)}
                  className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-9 sm:min-h-[36px] sm:px-3 sm:text-xs"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-ink-secondary">
                  To Date
                </label>
                <input
                  type="date"
                  required
                  value={customToDate}
                  onChange={(e) => setCustomToDate(e.target.value)}
                  className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-9 sm:min-h-[36px] sm:px-3 sm:text-xs"
                />
              </div>
            </div>
          )}

          {/* 3. Extra Handwritten Rows */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
              3. Extra Blank Handwritten Rows (Equal-Height Ruled Rows)
            </label>
            <input
              type="number"
              min={0}
              max={40}
              step={1}
              value={blankRows}
              onChange={(e) => setBlankRows(e.target.value)}
              className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
            />
            <p className="mt-1 text-[11px] text-ink-muted">
              Selected Period: <strong className="text-ink">{resolvedPeriod.label}</strong>{" "}
              · Opening Balance carries forward automatically; add blank rows only if filling extra lines by hand.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2.5">
            <button
              type="button"
              disabled={generating}
              onClick={onClose}
              className="neu-btn min-h-[44px] w-full rounded-xl px-4 text-sm font-medium text-ink sm:h-10 sm:min-h-[40px] sm:w-auto sm:text-xs"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={generating}
              className="neu-btn-primary inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium sm:h-10 sm:min-h-[40px] sm:w-auto sm:text-xs"
            >
              <FileDown className="h-4 w-4 shrink-0" />
              <span>
                {generating ? "Generating Vector PDF..." : "Download Cash Flow PDF"}
              </span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

