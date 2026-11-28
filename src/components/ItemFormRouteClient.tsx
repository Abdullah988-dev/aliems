"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, PackagePlus, Save } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { setFlashToast } from "@/lib/flash-toast";
import type { InventoryItem, TenantOverview } from "@/types/domain";

interface ItemFormRouteClientProps {
  overview: TenantOverview;
  mode: "create" | "edit";
  item?: InventoryItem;
}

export function ItemFormRouteClient({
  overview,
  mode,
  item,
}: ItemFormRouteClientProps) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(
    item?.categoryId || overview.categories[0]?.id || "",
  );
  const [sku, setSku] = useState(item?.sku || "");
  const [name, setName] = useState(item?.name || "");
  const [brand, setBrand] = useState(item?.brand || "");
  const [unitCostPrice, setUnitCostPrice] = useState(
    item ? String(item.unitCostPrice) : "",
  );
  const [targetSalePrice, setTargetSalePrice] = useState(
    item?.targetSalePrice !== null && item?.targetSalePrice !== undefined
      ? String(item.targetSalePrice)
      : "",
  );
  const [qtyOnHand, setQtyOnHand] = useState(
    item ? String(item.qtyOnHand) : "0",
  );
  const [reorderLevel, setReorderLevel] = useState(
    item ? String(item.reorderLevel) : "2",
  );
  const [supplierRef, setSupplierRef] = useState(item?.supplierRef || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const endpoint =
        mode === "edit" && item ? `/api/inventory/${item.id}` : "/api/inventory";
      const method = mode === "edit" ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: categoryId || undefined,
          sku: sku.trim() || undefined,
          name,
          brand,
          unitCostPrice: Number(unitCostPrice),
          targetSalePrice: targetSalePrice.trim() ? Number(targetSalePrice) : null,
          qtyOnHand: qtyOnHand.trim() ? Number(qtyOnHand) : 0,
          reorderLevel: reorderLevel.trim() ? Number(reorderLevel) : 2,
          supplierRef: supplierRef.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unable to save inventory item.");
      }

      setFlashToast({
        kind: "success",
        message:
          mode === "edit"
            ? "Item updated successfully"
            : "Item added successfully",
      });
      router.replace("/inventory");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save inventory item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthGuard overview={overview} loginRedirect="/login">
      <div className="min-h-screen px-4 py-8 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="neu-btn-primary flex h-10 w-10 items-center justify-center rounded-xl">
                <PackagePlus className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-ink">
                  {mode === "edit" ? "Edit Inventory SKU" : "Add Inventory SKU"}
                </h1>
                <p className="text-xs text-ink-muted">
                  {overview.tenant.businessName} · Server-verified mutation via JSON API
                </p>
              </div>
            </div>
            <Link
              href="/inventory"
              className="neu-btn inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-medium text-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Inventory
            </Link>
          </div>

          <form
            onSubmit={handleSubmit}
            className="glass-card space-y-4 rounded-xl p-5 sm:p-6"
          >
            {error ? (
              <div className="alert-danger rounded-xl px-4 py-2.5 text-xs font-medium">
                {error}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs">
                <span className="font-medium text-ink-secondary">Category</span>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="neu-input min-h-[42px] w-full rounded-lg px-3 text-sm text-ink sm:text-xs"
                >
                  {overview.categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5 text-xs">
                <span className="font-medium text-ink-secondary">
                  SKU / Model Code (Optional)
                </span>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Auto-generated if blank"
                  className="neu-input min-h-[42px] w-full rounded-lg px-3 text-sm text-ink sm:text-xs"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs">
                <span className="font-medium text-ink-secondary">Item / Model Name</span>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. 1.5 Ton DC Inverter"
                  className="neu-input min-h-[42px] w-full rounded-lg px-3 text-sm text-ink sm:text-xs"
                />
              </label>

              <label className="space-y-1.5 text-xs">
                <span className="font-medium text-ink-secondary">Brand</span>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g. Haier / Gree"
                  className="neu-input min-h-[42px] w-full rounded-lg px-3 text-sm text-ink sm:text-xs"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs">
                <span className="font-medium text-ink-secondary">
                  Unit Cost Price ({overview.tenant.currency})
                </span>
                <input
                  type="number"
                  required
                  min={0}
                  step="any"
                  value={unitCostPrice}
                  onChange={(e) => setUnitCostPrice(e.target.value)}
                  className="neu-input min-h-[42px] w-full rounded-lg px-3 text-sm text-ink sm:text-xs"
                />
              </label>

              <label className="space-y-1.5 text-xs">
                <span className="font-medium text-ink-secondary">
                  Target Sale Price (Optional)
                </span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={targetSalePrice}
                  onChange={(e) => setTargetSalePrice(e.target.value)}
                  className="neu-input min-h-[42px] w-full rounded-lg px-3 text-sm text-ink sm:text-xs"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-1.5 text-xs">
                <span className="font-medium text-ink-secondary">Quantity On Hand</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={qtyOnHand}
                  onChange={(e) => setQtyOnHand(e.target.value)}
                  className="neu-input min-h-[42px] w-full rounded-lg px-3 text-sm text-ink sm:text-xs"
                />
              </label>

              <label className="space-y-1.5 text-xs">
                <span className="font-medium text-ink-secondary">Reorder Level</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(e.target.value)}
                  className="neu-input min-h-[42px] w-full rounded-lg px-3 text-sm text-ink sm:text-xs"
                />
              </label>

              <label className="space-y-1.5 text-xs">
                <span className="font-medium text-ink-secondary">Supplier Ref</span>
                <input
                  type="text"
                  value={supplierRef}
                  onChange={(e) => setSupplierRef(e.target.value)}
                  placeholder="DIRECT"
                  className="neu-input min-h-[42px] w-full rounded-lg px-3 text-sm text-ink sm:text-xs"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <Link
                href="/inventory"
                className="neu-btn inline-flex min-h-[42px] items-center rounded-lg px-4 text-xs font-medium text-ink"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="neu-btn-primary inline-flex min-h-[42px] items-center gap-2 rounded-lg px-5 text-xs font-medium disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving
                  ? "Saving..."
                  : mode === "edit"
                    ? "Update Item"
                    : "Save Item"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AuthGuard>
  );
}

