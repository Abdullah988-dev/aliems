"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, PackageCheck } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { Category, InventoryItem, TenantOverview } from "@/types/domain";

interface SaleDispatchPanelProps {
  currency: string;
  items: InventoryItem[];
  categories: Category[];
  currentInventoryValue: number;
  currentReceivableBalance: number;
  onOverviewUpdate: (overview: TenantOverview) => void;
}

function initialPriceForItem(item: InventoryItem | null | undefined): string {
  if (!item || item.targetSalePrice === null || item.targetSalePrice === undefined) {
    return "";
  }
  return String(item.targetSalePrice);
}

export function SaleDispatchPanel({
  currency,
  items,
  categories,
  currentInventoryValue,
  currentReceivableBalance,
  onOverviewUpdate,
}: SaleDispatchPanelProps) {
  const availableItems = useMemo(
    () => items.filter((i) => !i.isDeleted && i.qtyOnHand > 0),
    [items],
  );

  const [selectedItemId, setSelectedItemId] = useState<string>(
    availableItems[0]?.id || "",
  );

  const activeItem =
    availableItems.find((i) => i.id === selectedItemId) ?? availableItems[0] ?? null;

  const [quantity, setQuantity] = useState<string>("1");
  const [unitSalePrice, setUnitSalePrice] = useState<string>(() =>
    initialPriceForItem(availableItems[0]),
  );
  const [customerName, setCustomerName] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  useEffect(() => {
    if (!activeItem) {
      if (selectedItemId !== "") setSelectedItemId("");
      setUnitSalePrice("");
      return;
    }
    if (activeItem.id !== selectedItemId) {
      setSelectedItemId(activeItem.id);
      setUnitSalePrice(initialPriceForItem(activeItem));
      setQuantity("1");
    }
  }, [activeItem, selectedItemId]);

  function handleSelectItem(itemId: string) {
    setSelectedItemId(itemId);
    const found = availableItems.find((i) => i.id === itemId);
    setUnitSalePrice(initialPriceForItem(found));
    setQuantity("1");
    setError(null);
    setSuccessMsg(null);
  }

  const parsedQtyNum = Number(quantity);
  const parsedQty =
    Number.isInteger(parsedQtyNum) && parsedQtyNum > 0 ? parsedQtyNum : 0;

  const hasSalePriceInput = unitSalePrice.trim() !== "";
  const parsedSalePrice = Number(unitSalePrice);
  const validSalePrice =
    hasSalePriceInput && Number.isFinite(parsedSalePrice) && parsedSalePrice >= 0
      ? parsedSalePrice
      : null;

  const costDeduction = activeItem ? parsedQty * activeItem.unitCostPrice : 0;
  const receivableAddition =
    validSalePrice !== null ? parsedQty * validSalePrice : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeItem) return;
    if (parsedQty <= 0) {
      setError("Quantity must be at least 1.");
      return;
    }
    if (validSalePrice === null) {
      setError("Enter a valid unit sale price before committing dispatch.");
      return;
    }

    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const committedSku = activeItem.sku;
      const committedName = activeItem.name;
      const committedBrand = activeItem.brand;
      const committedQty = parsedQty;
      const committedCustomer = customerName.trim();
      const committedCostDeduction = costDeduction;
      const committedReceivableAdd = receivableAddition;

      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: activeItem.id,
          quantity: committedQty,
          unitSalePrice: validSalePrice,
          customerName: committedCustomer,
          reference: reference.trim(),
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Dispatch failed.");

      const nextOverview = data.overview as TenantOverview;
      onOverviewUpdate(nextOverview);

      const nextAvailable = nextOverview.items.filter(
        (i) => !i.isDeleted && i.qtyOnHand > 0,
      );
      const stillInStock = nextAvailable.find((i) => i.id === activeItem.id);
      const nextTargetItem = stillInStock ?? nextAvailable[0] ?? null;

      setSelectedItemId(nextTargetItem?.id || "");
      setQuantity("1");
      setUnitSalePrice(initialPriceForItem(nextTargetItem));
      setCustomerName("");
      setReference("");
      setNotes("");

      const brandLabel = committedBrand ? ` (${committedBrand})` : "";
      const customerLabel = committedCustomer ? ` to ${committedCustomer}` : "";
      setSuccessMsg(
        `Dispatched ${committedQty}x ${committedName}${brandLabel} [${committedSku}]${customerLabel}: deducted ${formatCurrency(
          committedCostDeduction,
          currency,
        )} from inventory cost and routed ${formatCurrency(
          committedReceivableAdd,
          currency,
        )} to receivables.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dispatch failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="glass-card min-w-0 overflow-hidden rounded-xl">
      <div className="glass-divider-b flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
          <h2 className="text-sm font-medium text-ink">
            Stock sale dispatch
          </h2>
        </div>
        <span className="text-xs text-ink-muted">
          Cost deducted · Sale to receivable
        </span>
      </div>

      <div className="p-4 sm:p-5">
        {availableItems.length === 0 ? (
          <div className="glass-subpanel rounded-lg p-6 text-center text-xs text-ink-secondary">
            No sellable units in stock. Add or restock an item in Inventory to record a dispatch.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="alert-danger rounded-lg px-3.5 py-2.5 text-xs font-medium">
                {error}
              </div>
            )}
            {successMsg && (
              <div className="alert-success flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-xs font-medium">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span>{successMsg}</span>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                Stock SKU
              </label>
              <select
                value={activeItem?.id || ""}
                onChange={(e) => handleSelectItem(e.target.value)}
                className="neu-input min-h-[44px] w-full rounded-lg px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
              >
                {availableItems.map((item) => {
                  const brandText = item.brand ? ` (${item.brand})` : "";
                  return (
                    <option key={item.id} value={item.id}>
                      [{item.sku}] {item.name}
                      {brandText} — {item.qtyOnHand} in stock · Cost{" "}
                      {formatCurrency(item.unitCostPrice, currency)}
                    </option>
                  );
                })}
              </select>
              {activeItem && (
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                  <span>
                    {categoryMap.get(activeItem.categoryId) || "General"}
                    {activeItem.brand ? ` · ${activeItem.brand}` : ""}
                  </span>
                  <span className="tabular-nums font-medium text-ink-secondary">
                    {activeItem.qtyOnHand} available
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Quantity
                </label>
                <input
                  type="number"
                  min={1}
                  max={activeItem?.qtyOnHand || 1}
                  step={1}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="neu-input tabular-nums min-h-[44px] w-full rounded-lg px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Unit sale price ({currency})
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={unitSalePrice}
                  onChange={(e) => setUnitSalePrice(e.target.value)}
                  placeholder="Enter unit sale price"
                  className="neu-input tabular-nums min-h-[44px] w-full rounded-lg px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Customer name (optional)
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Gulberg Electronics"
                  className="neu-input min-h-[44px] w-full rounded-lg px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Reference (optional)
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="DSP-1045"
                  className="neu-input font-mono-code tabular-nums min-h-[44px] w-full rounded-lg px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                Note (optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Counter pickup or van delivery"
                className="neu-input min-h-[44px] w-full rounded-lg px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
              />
            </div>

            {/* Dual-Ledger Accounting Preview */}
            {activeItem && (
              <div className="glass-subpanel rounded-lg p-3.5">
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-ink-secondary">
                    Accounting split preview
                  </span>
                  <span className="text-xs text-ink-muted">
                    Profit deferred until settlement
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="glass-card min-w-0 rounded-md p-3">
                    <div className="flex items-center justify-between text-xs text-ink-secondary">
                      <span>Inventory asset (cost)</span>
                      <ArrowDownRight className="h-3.5 w-3.5 shrink-0 text-danger" strokeWidth={1.75} />
                    </div>
                    <div className="tabular-nums mt-1 break-words text-sm font-semibold text-danger">
                      -{formatCurrency(costDeduction, currency)}
                    </div>
                    <div className="tabular-nums mt-0.5 break-words text-xs text-ink-muted">
                      After:{" "}
                      {formatCurrency(currentInventoryValue - costDeduction, currency)}
                    </div>
                  </div>

                  <div className="glass-card min-w-0 rounded-md p-3">
                    <div className="flex items-center justify-between text-xs text-ink-secondary">
                      <span>Running receivable (sale)</span>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.75} />
                    </div>
                    <div className="tabular-nums mt-1 break-words text-sm font-semibold text-accent">
                      {validSalePrice !== null
                        ? `+${formatCurrency(receivableAddition, currency)}`
                        : "Enter sale price"}
                    </div>
                    <div className="tabular-nums mt-0.5 break-words text-xs text-ink-muted">
                      After:{" "}
                      {formatCurrency(
                        currentReceivableBalance + receivableAddition,
                        currency,
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !activeItem || parsedQty <= 0 || validSalePrice === null}
              className="neu-btn-primary min-h-[44px] w-full rounded-lg px-4 text-sm font-medium sm:h-10"
            >
              {submitting ? "Posting to ledger..." : "Commit sale dispatch"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
