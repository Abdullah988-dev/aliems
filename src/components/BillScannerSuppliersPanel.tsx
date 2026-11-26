"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileDown,
  FileText,
  Plus,
  ScanLine,
  Trash2,
  Upload,
  Wallet,
} from "lucide-react";
import { CashFlowPdfModal } from "@/components/CashFlowPdfModal";
import {
  buildSampleScannedBill,
  computeBillItemsTotal,
  computeUpdatedSupplierBalance,
  normalizeScannedItem,
} from "@/lib/bill-helpers";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type {
  ScannedBillItem,
  ScannedBillPayload,
  SupplierAccount,
  TenantOverview,
} from "@/types/domain";

interface BillScannerSuppliersPanelProps {
  currency: string;
  suppliers: SupplierAccount[];
  onOverviewUpdate: (overview: TenantOverview) => void;
}

export function BillScannerSuppliersPanel({
  currency,
  suppliers,
  onOverviewUpdate,
}: BillScannerSuppliersPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Scanner upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [savingBill, setSavingBill] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Editable extracted bill state
  const [draftBill, setDraftBill] = useState<ScannedBillPayload | null>(null);
  const [billOldBalanceInput, setBillOldBalanceInput] = useState<string>("0");

  // Supplier Old Balance form state
  const [supName, setSupName] = useState("");
  const [supOldBalance, setSupOldBalance] = useState("0");
  const [supBillAmount, setSupBillAmount] = useState("0");
  const [supDate, setSupDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [supNotes, setSupNotes] = useState("");
  const [savingSup, setSavingSup] = useState(false);
  const [supError, setSupError] = useState<string | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfInitialSupplierId, setPdfInitialSupplierId] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function isSupportedUpload(file: File): boolean {
    const allowedMime = new Set([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]);
    if (allowedMime.has(file.type.toLowerCase())) return true;
    const lower = file.name.toLowerCase();
    return (
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".png") ||
      lower.endsWith(".webp") ||
      lower.endsWith(".pdf")
    );
  }

  function handleFilePicked(file: File | null) {
    setScanError(null);
    setNotice(null);
    if (!file) return;
    if (!isSupportedUpload(file)) {
      setScanError(
        `Unsupported format "${file.type || file.name}". Please choose a JPG, PNG, WebP, or PDF bill file.`,
      );
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    setPreviewUrl(isPdf ? null : URL.createObjectURL(file));
  }

  function prefillOldBalanceForSupplier(supplierName: string) {
    const existing = suppliers.find(
      (s) => s.supplierName.toLowerCase() === supplierName.trim().toLowerCase(),
    );
    setBillOldBalanceInput(existing ? String(existing.runningBalance) : "0");
  }

  async function handleScanWithGemini() {
    if (!selectedFile) {
      setScanError("Choose or drop a bill image or PDF first.");
      return;
    }
    setScanError(null);
    setNotice(null);
    setScanning(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      // Do NOT set Content-Type manually so browser sets multipart boundary
      const res = await fetch("/api/ai/scan-bill", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Scan failed with HTTP ${res.status}.`);
      }

      const extracted = data.extracted as ScannedBillPayload;
      setDraftBill(extracted);
      prefillOldBalanceForSupplier(extracted.supplierName);
      setNotice(
        `Extracted ${extracted.items.length} line item(s) via ${data.model}. Review details below and click Save to Live Stock.`,
      );
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Bill scan failed.");
    } finally {
      setScanning(false);
    }
  }

  function handleLoadSampleBill() {
    setScanError(null);
    const sample = buildSampleScannedBill();
    setDraftBill(sample);
    prefillOldBalanceForSupplier(sample.supplierName);
    setNotice(
      "Loaded sample bill preview. Edit any row or supplier balance and click Save to Live Stock.",
    );
  }

  function updateDraftItem(
    itemId: string,
    patch: Partial<Omit<ScannedBillItem, "id" | "lineTotal">>,
  ) {
    if (!draftBill) return;
    const nextItems = draftBill.items.map((item) => {
      if (item.id !== itemId) return item;
      const qty =
        patch.quantity !== undefined
          ? Math.max(1, Math.round(Number(patch.quantity) || 1))
          : item.quantity;
      const unitCost =
        patch.unitCost !== undefined
          ? Math.max(0, Number(patch.unitCost) || 0)
          : item.unitCost;
      return {
        ...item,
        ...patch,
        quantity: qty,
        unitCost,
        lineTotal: Math.round((qty * unitCost + Number.EPSILON) * 100) / 100,
      };
    });
    setDraftBill({
      ...draftBill,
      items: nextItems,
      billTotal: computeBillItemsTotal(nextItems),
    });
  }

  function removeDraftItem(itemId: string) {
    if (!draftBill) return;
    const nextItems = draftBill.items.filter((i) => i.id !== itemId);
    setDraftBill({
      ...draftBill,
      items: nextItems,
      billTotal: computeBillItemsTotal(nextItems),
    });
  }

  function addBlankDraftItem() {
    if (!draftBill) return;
    const nextRow = normalizeScannedItem(
      { itemName: "", skuOrModel: "", category: "General", quantity: 1, unitCost: 0 },
      draftBill.items.length,
    );
    const nextItems = [...draftBill.items, nextRow];
    setDraftBill({
      ...draftBill,
      items: nextItems,
      billTotal: computeBillItemsTotal(nextItems),
    });
  }

  async function handleCommitBillToLiveStock() {
    if (!draftBill || draftBill.items.length === 0) {
      setScanError("Add at least one item row before saving to live stock.");
      return;
    }
    const parsedOld =
      billOldBalanceInput.trim() === "" ? 0 : Number(billOldBalanceInput);
    if (!Number.isFinite(parsedOld) || parsedOld < 0) {
      setScanError("Supplier Old Balance must be a valid non-negative number.");
      return;
    }

    setScanError(null);
    setNotice(null);
    setSavingBill(true);
    try {
      const res = await fetch("/api/inventory/commit-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName: draftBill.supplierName.trim(),
          billDate: draftBill.billDate.trim(),
          oldBalance: parsedOld,
          items: draftBill.items,
          billTotal: computeBillItemsTotal(draftBill.items),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to save scanned bill to live stock.");
      }

      onOverviewUpdate(data.overview as TenantOverview);
      const { addedCount, updatedCount, createdCategoriesCount, billTotal } =
        data.summary as {
          addedCount: number;
          updatedCount: number;
          createdCategoriesCount: number;
          billTotal: number;
        };

      setNotice(
        `Saved bill (${formatCurrency(billTotal, currency)}) to live database: ${updatedCount} SKU(s) restocked, ${addedCount} new SKU(s) created${
          createdCategoriesCount > 0
            ? `, ${createdCategoriesCount} new category(ies) added`
            : ""
        }.`,
      );
      setDraftBill(null);
      setSelectedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setBillOldBalanceInput("0");
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : "Failed to save scanned bill.",
      );
    } finally {
      setSavingBill(false);
    }
  }

  async function handleSupplierSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSupError(null);
    setNotice(null);
    setSavingSup(true);
    try {
      const oldVal = supOldBalance.trim() === "" ? 0 : Number(supOldBalance);
      const billVal = supBillAmount.trim() === "" ? 0 : Number(supBillAmount);
      if (!Number.isFinite(oldVal) || oldVal < 0) {
        throw new Error("Old Balance must be a valid non-negative number.");
      }
      if (!Number.isFinite(billVal) || billVal < 0) {
        throw new Error("Current Bill / New Stock Amount must be non-negative.");
      }

      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName: supName.trim(),
          oldBalance: oldVal,
          currentBillAmount: billVal,
          billDate: supDate,
          notes: supNotes.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to save supplier balance.");
      }

      onOverviewUpdate(data.overview as TenantOverview);
      setNotice(
        `Saved supplier "${data.supplier.supplierName}" to live database (Updated Balance: ${formatCurrency(
          data.supplier.runningBalance,
          currency,
        )}).`,
      );
      setSupName("");
      setSupOldBalance("0");
      setSupBillAmount("0");
      setSupNotes("");
    } catch (err) {
      setSupError(err instanceof Error ? err.message : "Failed to save balance.");
    } finally {
      setSavingSup(false);
    }
  }

  const supplierTotals = useMemo(() => {
    const totalOldBalance = suppliers.reduce((sum, s) => sum + s.oldBalance, 0);
    const totalLastBills = suppliers.reduce((sum, s) => sum + s.lastBillAmount, 0);
    const totalPayable = suppliers.reduce((sum, s) => sum + s.runningBalance, 0);
    return { totalOldBalance, totalLastBills, totalPayable };
  }, [suppliers]);

  const draftBillTotal = draftBill ? computeBillItemsTotal(draftBill.items) : 0;
  const draftOldNum = Number(billOldBalanceInput) || 0;
  const draftUpdatedTotal = computeUpdatedSupplierBalance(draftOldNum, draftBillTotal);

  const formOldNum = Number(supOldBalance) || 0;
  const formBillNum = Number(supBillAmount) || 0;
  const formTotalUpdated = computeUpdatedSupplierBalance(formOldNum, formBillNum);

  return (
    <div className="space-y-5 sm:space-y-6">
      <CashFlowPdfModal
        open={pdfModalOpen}
        currency={currency}
        suppliers={suppliers}
        initialSupplierId={pdfInitialSupplierId}
        onClose={() => setPdfModalOpen(false)}
      />

      {/* Live Persistence Summary Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="glass-card min-w-0 rounded-2xl p-4 sm:p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
            Active Suppliers
          </div>
          <div className="tabular-nums mt-1.5 text-lg font-semibold text-ink sm:text-xl xl:text-2xl">
            {suppliers.length}
          </div>
          <div className="mt-1 text-[11px] text-ink-muted">
            Persisted in tenant partition
          </div>
        </div>
        <div className="glass-card min-w-0 rounded-2xl p-4 sm:p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
            Supplier Old Balances
          </div>
          <div className="tabular-nums mt-1.5 break-words text-lg font-semibold text-warning sm:text-xl xl:text-2xl">
            {formatCurrency(supplierTotals.totalOldBalance, currency)}
          </div>
          <div className="mt-1 text-[11px] text-ink-muted">
            Previous / opening supplier balances
          </div>
        </div>
        <div className="glass-card-accent min-w-0 rounded-2xl p-4 sm:p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            Total Supplier Running Balance
          </div>
          <div className="tabular-nums mt-1.5 break-words text-lg font-semibold text-accent sm:text-xl xl:text-2xl">
            {formatCurrency(supplierTotals.totalPayable, currency)}
          </div>
          <div className="mt-1 text-[11px] text-ink-secondary">
            Old balance + billed purchases
          </div>
        </div>
      </div>

      {notice && (
        <div className="alert-success flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Main Split: AI Bill Scanner & Supplier Old Balance */}
      <div className="grid gap-5 sm:gap-6 lg:grid-cols-12">
        {/* AI Bill Scanner */}
        <section className="glass-card min-w-0 overflow-hidden rounded-2xl lg:col-span-7">
          <div className="glass-divider-b flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <ScanLine className="h-4 w-4 shrink-0 text-accent" />
              <h2 className="text-sm font-semibold text-ink">
                AI Bill Scanner (Purchase Invoice to Live Stock)
              </h2>
            </div>
            <button
              type="button"
              onClick={handleLoadSampleBill}
              className="neu-btn inline-flex min-h-[44px] items-center rounded-xl px-3 text-xs font-medium text-accent sm:min-h-[32px] sm:rounded-lg sm:py-1 sm:text-[11px]"
            >
              Load Sample Bill
            </button>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            {scanError && (
              <div
                role="alert"
                className="alert-danger flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{scanError}</span>
              </div>
            )}

            {/* Drag-and-Drop / Upload Area */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const dropped = e.dataTransfer.files?.[0] ?? null;
                handleFilePicked(dropped);
              }}
              className={`glass-subpanel flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-4 text-center transition-colors sm:p-5 ${
                dragActive ? "border-[#0f4c5c]" : ""
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => handleFilePicked(e.target.files?.[0] ?? null)}
              />

              {selectedFile ? (
                <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    {previewUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={previewUrl}
                        alt="Uploaded bill preview"
                        className="h-16 w-16 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="glass-chip flex h-16 w-16 shrink-0 items-center justify-center rounded-xl">
                        <FileText className="h-7 w-7 text-accent" />
                      </div>
                    )}
                    <div className="min-w-0 text-left">
                      <div className="truncate text-xs font-semibold text-ink">
                        {selectedFile.name}
                      </div>
                      <div className="tabular-nums text-[11px] text-ink-muted">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                        {selectedFile.type ? ` · ${selectedFile.type}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="neu-btn min-h-[44px] w-full rounded-xl px-3.5 text-xs font-medium text-ink sm:h-9 sm:min-h-[36px] sm:w-auto sm:px-3"
                    >
                      Change File
                    </button>
                    <button
                      type="button"
                      disabled={scanning}
                      onClick={handleScanWithGemini}
                      className="neu-btn-primary min-h-[44px] w-full rounded-xl px-4 text-xs font-medium sm:h-9 sm:min-h-[36px] sm:w-auto"
                    >
                      {scanning ? "Scanning with Gemini..." : "Scan Bill"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-accent" />
                  <div>
                    <p className="text-xs font-medium text-ink">
                      Drag and drop a supplier bill here (JPG, PNG, WebP, or PDF)
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      Smart upsert increments existing SKUs and saves directly to your
                      database.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="neu-btn min-h-[44px] w-full rounded-xl px-4 text-xs font-medium text-ink sm:h-9 sm:min-h-[36px] sm:w-auto"
                  >
                    Select Bill Image / PDF
                  </button>
                </>
              )}
            </div>

            {/* Editable Extracted Items Preview */}
            {draftBill && (
              <div className="min-w-0 space-y-4">
                <div className="glass-subpanel grid grid-cols-1 gap-3 rounded-xl p-3.5 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-ink-secondary">
                      Supplier Name
                    </label>
                    <input
                      type="text"
                      value={draftBill.supplierName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraftBill({ ...draftBill, supplierName: val });
                        prefillOldBalanceForSupplier(val);
                      }}
                      placeholder="Supplier / Vendor"
                      className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-9 sm:min-h-[36px] sm:px-3 sm:text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-ink-secondary">
                      Bill Date
                    </label>
                    <input
                      type="text"
                      value={draftBill.billDate}
                      onChange={(e) =>
                        setDraftBill({ ...draftBill, billDate: e.target.value })
                      }
                      placeholder="YYYY-MM-DD"
                      className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-9 sm:min-h-[36px] sm:px-3 sm:text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-ink-secondary">
                      Supplier Old Balance ({currency})
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={billOldBalanceInput}
                      onChange={(e) => setBillOldBalanceInput(e.target.value)}
                      className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-9 sm:min-h-[36px] sm:px-3 sm:text-xs"
                    />
                  </div>
                </div>

                <div className="glass-card min-w-0 overflow-hidden rounded-xl">
                  <div className="table-scroll-container">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="glass-thead text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                          <th className="min-w-[165px] px-3 py-2.5">Item Name</th>
                          <th className="min-w-[120px] px-3 py-2.5">SKU / Model</th>
                          <th className="min-w-[125px] px-3 py-2.5">Category</th>
                          <th className="min-w-[85px] px-3 py-2.5 text-right">Qty</th>
                          <th className="min-w-[110px] px-3 py-2.5 text-right">
                            Unit Cost
                          </th>
                          <th className="whitespace-nowrap px-3 py-2.5 text-right">
                            Line Total
                          </th>
                          <th className="px-3 py-2.5 text-right"></th>
                        </tr>
                      </thead>
                      <tbody className="glass-tbody">
                        {draftBill.items.map((row) => (
                          <tr key={row.id}>
                            <td className="px-2.5 py-2">
                              <input
                                type="text"
                                value={row.itemName}
                                onChange={(e) =>
                                  updateDraftItem(row.id, { itemName: e.target.value })
                                }
                                className="neu-input min-h-[44px] w-full rounded-lg px-2.5 text-base sm:h-8 sm:min-h-[32px] sm:px-2 sm:text-xs"
                              />
                            </td>
                            <td className="px-2.5 py-2">
                              <input
                                type="text"
                                value={row.skuOrModel}
                                onChange={(e) =>
                                  updateDraftItem(row.id, {
                                    skuOrModel: e.target.value,
                                  })
                                }
                                className="neu-input tabular-nums min-h-[44px] w-full rounded-lg px-2.5 text-base uppercase sm:h-8 sm:min-h-[32px] sm:px-2 sm:text-xs"
                              />
                            </td>
                            <td className="px-2.5 py-2">
                              <input
                                type="text"
                                value={row.category}
                                onChange={(e) =>
                                  updateDraftItem(row.id, { category: e.target.value })
                                }
                                className="neu-input min-h-[44px] w-full rounded-lg px-2.5 text-base sm:h-8 sm:min-h-[32px] sm:px-2 sm:text-xs"
                              />
                            </td>
                            <td className="px-2.5 py-2">
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={row.quantity}
                                onChange={(e) =>
                                  updateDraftItem(row.id, {
                                    quantity: Number(e.target.value),
                                  })
                                }
                                className="neu-input tabular-nums min-h-[44px] w-full rounded-lg px-2.5 text-right text-base sm:h-8 sm:min-h-[32px] sm:px-2 sm:text-xs"
                              />
                            </td>
                            <td className="px-2.5 py-2">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={row.unitCost}
                                onChange={(e) =>
                                  updateDraftItem(row.id, {
                                    unitCost: Number(e.target.value),
                                  })
                                }
                                className="neu-input tabular-nums min-h-[44px] w-full rounded-lg px-2.5 text-right text-base sm:h-8 sm:min-h-[32px] sm:px-2 sm:text-xs"
                              />
                            </td>
                            <td className="tabular-nums whitespace-nowrap px-3 py-2 text-right font-semibold text-ink">
                              {formatCurrency(row.lineTotal, currency)}
                            </td>
                            <td className="px-2.5 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeDraftItem(row.id)}
                                className="neu-btn-danger inline-flex h-11 w-11 items-center justify-center rounded-xl sm:h-8 sm:w-8 sm:rounded-lg"
                                title="Remove row"
                              >
                                <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Live Supplier Balance Summary before Saving */}
                <div className="glass-subpanel flex flex-col gap-3 rounded-xl p-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                    <div>
                      <span className="text-ink-muted">Old Balance: </span>
                      <span className="tabular-nums font-semibold text-warning">
                        {formatCurrency(draftOldNum, currency)}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-muted">Current Bill: </span>
                      <span className="tabular-nums font-semibold text-ink">
                        {formatCurrency(draftBillTotal, currency)}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-muted">Total Updated Balance: </span>
                      <span className="tabular-nums font-semibold text-accent">
                        {formatCurrency(draftUpdatedTotal, currency)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <button
                      type="button"
                      disabled={savingBill}
                      onClick={addBlankDraftItem}
                      className="neu-btn inline-flex min-h-[44px] w-full items-center justify-center gap-1 rounded-xl px-3.5 text-xs font-medium text-ink sm:h-9 sm:min-h-[36px] sm:w-auto sm:px-3"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Row
                    </button>
                    <button
                      type="button"
                      disabled={savingBill}
                      onClick={handleCommitBillToLiveStock}
                      className="neu-btn-primary min-h-[44px] w-full rounded-xl px-4 text-xs font-medium sm:h-9 sm:min-h-[36px] sm:w-auto"
                    >
                      {savingBill ? "Saving to Database..." : "Save to Live Stock"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Supplier Old Balance (Opening Balance) Manager */}
        <section className="glass-card min-w-0 overflow-hidden rounded-2xl lg:col-span-5">
          <div className="glass-divider-b flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 shrink-0 text-accent" />
              <h2 className="text-sm font-semibold text-ink">
                Supplier Old Balance Tracker
              </h2>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted">
              <Database className="h-3 w-3 shrink-0 text-accent" />
              Live DB
            </span>
          </div>

          <form onSubmit={handleSupplierSubmit} className="space-y-4 p-4 sm:p-5">
            {supError && (
              <div className="alert-danger rounded-xl px-3.5 py-2.5 text-xs font-medium">
                {supError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Supplier Name
                </label>
                <input
                  type="text"
                  required
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  placeholder="e.g., Lahore Electric Co."
                  className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Date
                </label>
                <input
                  type="date"
                  value={supDate}
                  onChange={(e) => setSupDate(e.target.value)}
                  className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Old Balance ({currency})
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={supOldBalance}
                  onChange={(e) => setSupOldBalance(e.target.value)}
                  className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Current Bill / New Stock ({currency})
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={supBillAmount}
                  onChange={(e) => setSupBillAmount(e.target.value)}
                  className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                Note (Optional)
              </label>
              <input
                type="text"
                value={supNotes}
                onChange={(e) => setSupNotes(e.target.value)}
                placeholder="Opening payable / bill reference"
                className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
              />
            </div>

            <div className="glass-subpanel space-y-1.5 rounded-xl p-3.5 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-ink-muted">Old Balance</span>
                <span className="tabular-nums font-medium text-warning">
                  {formatCurrency(formOldNum, currency)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-ink-muted">Current Bill / New Stock</span>
                <span className="tabular-nums font-medium text-ink">
                  {formatCurrency(formBillNum, currency)}
                </span>
              </div>
              <div className="glass-divider-b my-1" />
              <div className="flex justify-between gap-3">
                <span className="font-semibold text-ink">Total Updated Balance</span>
                <span className="tabular-nums font-semibold text-accent">
                  {formatCurrency(formTotalUpdated, currency)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingSup}
              className="neu-btn-primary min-h-[44px] w-full rounded-xl px-4 text-sm font-medium sm:h-10 sm:text-xs"
            >
              {savingSup ? "Saving Supplier Balance..." : "Save Supplier Balance"}
            </button>
          </form>
        </section>
      </div>

      {/* Persisted Supplier Accounts & Old Balances */}
      <div className="glass-card min-w-0 overflow-hidden rounded-2xl">
        <div className="glass-divider-b flex flex-wrap items-center justify-between gap-2.5 px-4 py-3.5 sm:px-5">
          <div>
            <h3 className="text-sm font-semibold text-ink">
              Supplier Accounts & Running Balances ({suppliers.length})
            </h3>
            <span className="text-[11px] text-ink-muted">
              Click Edit to update a supplier&apos;s opening balance or export A4 Cash Flow PDF
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setPdfInitialSupplierId(suppliers[0]?.id || "BLANK_MANUAL");
              setPdfModalOpen(true);
            }}
            className="neu-btn-primary inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold sm:h-9 sm:min-h-[36px] sm:w-auto"
          >
            <FileDown className="h-4 w-4 shrink-0" />
            <span>Generate Cash Flow PDF</span>
          </button>
        </div>
        <div className="table-scroll-container">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="glass-thead text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                <th className="min-w-[160px] px-4 py-2.5">Supplier</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-right">
                  Old Balance
                </th>
                <th className="whitespace-nowrap px-4 py-2.5 text-right">
                  Last Bill Amount
                </th>
                <th className="whitespace-nowrap px-4 py-2.5 text-right">
                  Updated Balance
                </th>
                <th className="whitespace-nowrap px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="glass-tbody">
              {suppliers.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-xs text-ink-muted"
                  >
                    No supplier accounts saved yet. Scan a bill or add a supplier
                    balance above.
                  </td>
                </tr>
              ) : (
                suppliers.map((sup) => (
                  <tr key={sup.id} className="glass-row-hover">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-ink">
                        {sup.supplierName}
                      </div>
                      <div className="tabular-nums text-[11px] text-ink-muted">
                        Updated {formatDateTime(sup.updatedAt)}
                        {sup.billDate ? ` · Bill: ${sup.billDate}` : ""}
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
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-2 sm:gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPdfInitialSupplierId(sup.id);
                            setPdfModalOpen(true);
                          }}
                          className="neu-btn inline-flex min-h-[44px] items-center gap-1 rounded-xl px-3 text-xs font-medium text-ink sm:min-h-[30px] sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-[11px]"
                        >
                          <FileDown className="h-3.5 w-3.5 shrink-0 text-accent sm:h-3 sm:w-3" />
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSupName(sup.supplierName);
                            setSupOldBalance(String(sup.oldBalance));
                            setSupBillAmount(String(sup.lastBillAmount));
                            if (sup.billDate) setSupDate(sup.billDate);
                            setSupNotes(sup.notes || "");
                          }}
                          className="neu-btn inline-flex min-h-[44px] items-center rounded-xl px-3.5 text-xs font-medium text-accent sm:min-h-[30px] sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-[11px]"
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

