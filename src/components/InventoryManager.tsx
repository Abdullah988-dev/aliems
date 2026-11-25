"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Pencil,
  Plus,
  ScanLine,
  Search,
  SlidersHorizontal,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { LiquidGlassModal } from "@/components/LiquidGlassModal";
import { formatCurrency } from "@/lib/format";
import type {
  Category,
  InventoryItem,
  SupplierAccount,
  TenantOverview,
} from "@/types/domain";

interface InventoryManagerProps {
  currency: string;
  skuPrefix: string;
  categories: Category[];
  items: InventoryItem[];
  suppliers?: SupplierAccount[];
  onOverviewUpdate: (overview: TenantOverview) => void;
  onOpenBillScanner?: () => void;
}

type ActiveRowPanel =
  | { itemId: string; mode: "restock" }
  | { itemId: string; mode: "adjust" }
  | { itemId: string; mode: "edit" }
  | null;

type PendingDeleteAction =
  | { kind: "item"; item: InventoryItem }
  | { kind: "category"; category: Category }
  | null;

function suggestNextSku(skuPrefix: string, items: InventoryItem[]): string {
  const cleanPrefix = skuPrefix.replace(/-+$/, "") || "SKU";
  const used = new Set(
    items.filter((i) => !i.isDeleted).map((i) => i.sku.toUpperCase()),
  );
  let seq = 101;
  while (used.has(`${cleanPrefix}-${seq}`)) {
    seq += 1;
  }
  return `${cleanPrefix}-${seq}`;
}

export function InventoryManager({
  currency,
  skuPrefix,
  categories,
  items,
  suppliers = [],
  onOverviewUpdate,
  onOpenBillScanner,
}: InventoryManagerProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);

  // Add Item state (targetSalePrice is optional -> blank allowed)
  const [newCategoryId, setNewCategoryId] = useState(categories[0]?.id || "");
  const [newSku, setNewSku] = useState(() => suggestNextSku(skuPrefix, items));
  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newCost, setNewCost] = useState("");
  const [newSale, setNewSale] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newReorder, setNewReorder] = useState("2");
  const [newSupplier, setNewSupplier] = useState("");

  // Add Category state
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");

  // Modal Restock / Adjust / Edit state
  const [activeAction, setActiveAction] = useState<ActiveRowPanel>(null);
  const [actionQty, setActionQty] = useState("5");
  const [actionCost, setActionCost] = useState("");
  const [actionNotes, setActionNotes] = useState("");

  // Edit SKU fields
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editSku, setEditSku] = useState("");
  const [editName, setEditName] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editSale, setEditSale] = useState("");
  const [editQty, setEditQty] = useState("0");
  const [editReorder, setEditReorder] = useState("2");
  const [editSupplier, setEditSupplier] = useState("");

  // Liquid Glass confirmation modal state for deletion actions
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteAction>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (item.isDeleted) return false;
      if (selectedCategory !== "all" && item.categoryId !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      return (
        item.sku.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q)
      );
    });
  }, [items, selectedCategory, searchQuery]);

  function openAddModal() {
    setError(null);
    setModalError(null);
    setNotice(null);
    setNewCategoryId(categories[0]?.id || "");
    setNewSku(suggestNextSku(skuPrefix, items));
    setNewName("");
    setNewBrand("");
    setNewCost("");
    setNewSale("");
    setNewQty("1");
    setNewReorder("2");
    setNewSupplier("");
    setShowAddForm(true);
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const targetSalePrice = newSale.trim() === "" ? null : Number(newSale);

      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: newCategoryId || categories[0]?.id,
          sku: newSku,
          name: newName,
          brand: newBrand,
          unitCostPrice: Number(newCost),
          targetSalePrice,
          qtyOnHand: Number(newQty),
          reorderLevel: Number(newReorder || 2),
          supplierRef: newSupplier,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add SKU.");
      const nextOverview = data.overview as TenantOverview;
      onOverviewUpdate(nextOverview);
      setShowAddForm(false);
      setNewSku(suggestNextSku(skuPrefix, nextOverview.items));
      setNotice(`Added SKU ${data.item.sku} (${data.item.name}).`);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Failed to add SKU.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: catName, description: catDesc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create category.");
      onOverviewUpdate(data.overview);
      setCatName("");
      setCatDesc("");
      setNotice(`Category "${data.category.name}" created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category.");
    } finally {
      setBusy(false);
    }
  }

  function openEditPanel(item: InventoryItem) {
    setError(null);
    setModalError(null);
    setNotice(null);
    setActiveAction({ itemId: item.id, mode: "edit" });
    setEditCategoryId(item.categoryId);
    setEditSku(item.sku);
    setEditName(item.name);
    setEditBrand(item.brand || "");
    setEditCost(String(item.unitCostPrice));
    setEditSale(
      item.targetSalePrice !== null && item.targetSalePrice !== undefined
        ? String(item.targetSalePrice)
        : "",
    );
    setEditQty(String(item.qtyOnHand));
    setEditReorder(String(item.reorderLevel));
    setEditSupplier(item.supplierRef || "");
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeAction || activeAction.mode !== "edit") return;
    setModalError(null);
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const targetSalePrice = editSale.trim() === "" ? null : Number(editSale);

      const res = await fetch(`/api/inventory/${activeAction.itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: editCategoryId,
          sku: editSku,
          name: editName,
          brand: editBrand,
          unitCostPrice: Number(editCost),
          targetSalePrice,
          qtyOnHand: Number(editQty),
          reorderLevel: Number(editReorder || 0),
          supplierRef: editSupplier,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update SKU.");
      onOverviewUpdate(data.overview);
      setActiveAction(null);
      setNotice(`Updated SKU ${data.item.sku} (${data.item.name}).`);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Failed to update SKU.");
    } finally {
      setBusy(false);
    }
  }

  async function handleStockAction(e: React.FormEvent) {
    e.preventDefault();
    if (!activeAction || activeAction.mode === "edit") return;
    setModalError(null);
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const endpoint =
        activeAction.mode === "restock"
          ? `/api/inventory/${activeAction.itemId}/restock`
          : `/api/inventory/${activeAction.itemId}/adjust`;

      const payload =
        activeAction.mode === "restock"
          ? {
              addedQty: Number(actionQty),
              unitCostPrice: Number(actionCost),
              notes: actionNotes,
            }
          : {
              qtyDelta: Number(actionQty),
              notes: actionNotes || "Manual audit adjustment",
            };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Stock update failed.");
      onOverviewUpdate(data.overview);
      setActiveAction(null);
      setActionNotes("");
      setNotice(`Updated stock for ${data.item.sku} (${data.item.name}).`);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Stock update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmPendingDelete() {
    if (!pendingDelete) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (pendingDelete.kind === "item") {
        const item = pendingDelete.item;
        const res = await fetch(`/api/inventory/${item.id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to delete SKU.");
        onOverviewUpdate(data.overview);
        if (activeAction?.itemId === item.id) setActiveAction(null);
        setNotice(
          data.deletedMode === "soft"
            ? `Archived SKU ${item.sku} (${item.name}). Past ledger records remain protected.`
            : `Deleted unused SKU ${item.sku} (${item.name}).`,
        );
      } else {
        const category = pendingDelete.category;
        const res = await fetch(
          `/api/categories?categoryId=${encodeURIComponent(category.id)}`,
          { method: "DELETE" },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to delete category.");
        if (selectedCategory === category.id) setSelectedCategory("all");
        onOverviewUpdate(data.overview);
        setNotice(`Deleted empty category "${category.name}".`);
      }
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deletion failed.");
      setPendingDelete(null);
    } finally {
      setBusy(false);
    }
  }

  const activeItemForModal = activeAction
    ? items.find((i) => i.id === activeAction.itemId) ?? null
    : null;

  return (
    <div className="space-y-5">
      {/* Liquid Glass Custom Confirmation Modal for Deletions */}
      <LiquidGlassModal
        open={pendingDelete !== null}
        busy={busy}
        tone="danger"
        title={
          pendingDelete?.kind === "item"
            ? "Delete Inventory SKU"
            : "Delete Product Category"
        }
        description={
          pendingDelete?.kind === "item"
            ? "Items with historical ledger entries are soft-archived (and any remaining units written off at cost) to protect past accounting records. Unused SKUs with zero stock are permanently removed."
            : "This empty category will be permanently removed from your workspace."
        }
        details={
          pendingDelete?.kind === "item"
            ? [
                { label: "SKU Code", value: pendingDelete.item.sku },
                {
                  label: "Item & Brand",
                  value: pendingDelete.item.brand
                    ? `${pendingDelete.item.name} (${pendingDelete.item.brand})`
                    : pendingDelete.item.name,
                },
                {
                  label: "Current Stock",
                  value: `${pendingDelete.item.qtyOnHand} units`,
                },
                {
                  label: "Asset Value (Cost)",
                  value: formatCurrency(
                    pendingDelete.item.qtyOnHand * pendingDelete.item.unitCostPrice,
                    currency,
                  ),
                },
              ]
            : pendingDelete?.kind === "category"
              ? [
                  { label: "Category Name", value: pendingDelete.category.name },
                  {
                    label: "Description",
                    value: pendingDelete.category.description || "—",
                  },
                ]
              : []
        }
        confirmLabel={
          pendingDelete?.kind === "item" ? "Delete / Archive SKU" : "Delete Category"
        }
        cancelLabel="Keep Record"
        onConfirm={handleConfirmPendingDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {/* Add Stock SKU Modal */}
      {showAddForm && (
        <div
          className="liquid-glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4"
          onClick={() => {
            if (!busy) setShowAddForm(false);
          }}
        >
          <form
            onSubmit={handleAddItem}
            onClick={(e) => e.stopPropagation()}
            className="liquid-glass-modal max-h-[90vh] w-full max-w-[95vw] overflow-y-auto overscroll-contain p-4 sm:max-w-2xl sm:p-6"
          >
            <div className="relative z-10 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">
                    Register New Inventory SKU
                  </h3>
                  <p className="text-xs text-ink-secondary">
                    Capitalize stock at cost price. Target sale price is optional.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setShowAddForm(false)}
                  aria-label="Close modal"
                  className="neu-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-secondary sm:h-8 sm:w-8 sm:rounded-lg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {modalError && (
                <div className="alert-danger rounded-xl px-3.5 py-2.5 text-xs font-medium">
                  {modalError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    Category
                  </label>
                  <select
                    value={newCategoryId}
                    onChange={(e) => setNewCategoryId(e.target.value)}
                    className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    SKU Code (auto-generated if blank)
                  </label>
                  <input
                    type="text"
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                    placeholder={`${skuPrefix}-101`}
                    className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base uppercase sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    Item / Model Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Inverter Pedestal Fan 18-In"
                    className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    Brand
                  </label>
                  <input
                    type="text"
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    placeholder="e.g., Dawlance / Samsung"
                    className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    Unit Cost Price ({currency})
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="0.01"
                    value={newCost}
                    onChange={(e) => setNewCost(e.target.value)}
                    placeholder="0"
                    className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    Target Sale Price ({currency}, Optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={newSale}
                    onChange={(e) => setNewSale(e.target.value)}
                    placeholder="Leave blank for manual entry"
                    className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    Opening Qty
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1}
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                    className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    Reorder Alert Level
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={newReorder}
                    onChange={(e) => setNewReorder(e.target.value)}
                    className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Supplier / Batch Reference (Optional)
                </label>
                <input
                  type="text"
                  value={newSupplier}
                  onChange={(e) => setNewSupplier(e.target.value)}
                  placeholder="Supplier or batch code"
                  className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                />
              </div>

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setShowAddForm(false)}
                  className="neu-btn min-h-[44px] w-full rounded-xl px-4 text-sm font-medium text-ink sm:h-9 sm:min-h-[36px] sm:w-auto sm:text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="neu-btn-primary min-h-[44px] w-full rounded-xl px-5 text-sm font-medium sm:h-9 sm:min-h-[36px] sm:w-auto sm:text-xs"
                >
                  {busy ? "Saving..." : "Capitalize & Add SKU"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Edit SKU Modal */}
      {activeAction && activeAction.mode === "edit" && (
        <div
          className="liquid-glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4"
          onClick={() => {
            if (!busy) setActiveAction(null);
          }}
        >
          <form
            onSubmit={handleEditSubmit}
            onClick={(e) => e.stopPropagation()}
            className="liquid-glass-modal max-h-[90vh] w-full max-w-[95vw] overflow-y-auto overscroll-contain p-4 sm:max-w-2xl sm:p-6"
          >
            <div className="relative z-10 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-base font-semibold text-ink">
                    Edit SKU Details — {editSku}
                  </h3>
                  <p className="text-xs text-ink-secondary">
                    Quantity or unit cost changes automatically post an audit
                    adjustment to keep ledger balances synchronized.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setActiveAction(null)}
                  aria-label="Close modal"
                  className="neu-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-secondary sm:h-8 sm:w-8 sm:rounded-lg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {modalError && (
                <div className="alert-danger rounded-xl px-3.5 py-2.5 text-xs font-medium">
                  {modalError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    Category
                  </label>
                  <select
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(e.target.value)}
                    className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    SKU Code
                  </label>
                  <input
                    type="text"
                    required
                    value={editSku}
                    onChange={(e) => setEditSku(e.target.value)}
                    className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base uppercase sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    Item / Model Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    Brand
                  </label>
                  <input
                    type="text"
                    value={editBrand}
                    onChange={(e) => setEditBrand(e.target.value)}
                    placeholder="Brand name (optional)"
                    className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    Unit Cost Price ({currency})
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="0.01"
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    Target Sale Price ({currency}, Optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editSale}
                    onChange={(e) => setEditSale(e.target.value)}
                    placeholder="Blank for manual dispatch entry"
                    className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    Quantity On Hand
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1}
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    Reorder Alert Level
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={editReorder}
                    onChange={(e) => setEditReorder(e.target.value)}
                    className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Supplier Ref
                </label>
                <input
                  type="text"
                  value={editSupplier}
                  onChange={(e) => setEditSupplier(e.target.value)}
                  className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                />
              </div>

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setActiveAction(null)}
                  className="neu-btn min-h-[44px] w-full rounded-xl px-4 text-sm font-medium text-ink sm:h-9 sm:min-h-[36px] sm:w-auto sm:text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="neu-btn-primary min-h-[44px] w-full rounded-xl px-5 text-sm font-medium sm:h-9 sm:min-h-[36px] sm:w-auto sm:text-xs"
                >
                  {busy ? "Updating..." : "Save SKU Changes"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Restock / Adjust Modal */}
      {activeAction && activeAction.mode !== "edit" && activeItemForModal && (
        <div
          className="liquid-glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4"
          onClick={() => {
            if (!busy) setActiveAction(null);
          }}
        >
          <form
            onSubmit={handleStockAction}
            onClick={(e) => e.stopPropagation()}
            className="liquid-glass-modal max-h-[90vh] w-full max-w-[95vw] overflow-y-auto overscroll-contain p-4 sm:max-w-md sm:p-6"
          >
            <div className="relative z-10 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">
                    {activeAction.mode === "restock"
                      ? "Stock-In / Restock Batch"
                      : "Manual Stock Audit Adjustment"}
                  </h3>
                  <p className="truncate text-xs text-ink-secondary">
                    [{activeItemForModal.sku}] {activeItemForModal.name}
                    {activeItemForModal.brand ? ` (${activeItemForModal.brand})` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setActiveAction(null)}
                  aria-label="Close modal"
                  className="neu-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-secondary sm:h-8 sm:w-8 sm:rounded-lg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {modalError && (
                <div className="alert-danger rounded-xl px-3.5 py-2.5 text-xs font-medium">
                  {modalError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    {activeAction.mode === "restock"
                      ? "Units Added"
                      : "Qty Delta (+/-)"}
                  </label>
                  <input
                    type="number"
                    required
                    step={1}
                    value={actionQty}
                    onChange={(e) => setActionQty(e.target.value)}
                    className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                  />
                </div>

                {activeAction.mode === "restock" && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                      Batch Unit Cost ({currency})
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      step="0.01"
                      value={actionCost}
                      onChange={(e) => setActionCost(e.target.value)}
                      className="neu-input tabular-nums min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Ledger Note / Reason
                </label>
                <input
                  type="text"
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder={
                    activeAction.mode === "restock"
                      ? "Supplier challan or batch ref"
                      : "Physical count variance or damage write-off"
                  }
                  className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
                />
              </div>

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setActiveAction(null)}
                  className="neu-btn min-h-[44px] w-full rounded-xl px-4 text-sm font-medium text-ink sm:h-9 sm:min-h-[36px] sm:w-auto sm:text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="neu-btn-primary min-h-[44px] w-full rounded-xl px-5 text-sm font-medium sm:h-9 sm:min-h-[36px] sm:w-auto sm:text-xs"
                >
                  {busy ? "Applying..." : "Apply Update"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className="alert-danger rounded-xl px-4 py-2.5 text-xs font-medium">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert-success flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="glass-card flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by SKU, model, or brand..."
            className="neu-input min-h-[44px] w-full rounded-xl pl-9 pr-3 text-base sm:h-10 sm:min-h-[40px] sm:text-sm"
          />
        </div>

        <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => setShowCategoryForm((v) => !v)}
            className="neu-btn inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-medium text-ink sm:h-10 sm:min-h-[40px] sm:w-auto"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-ink-secondary" />
            Manage Categories ({categories.length})
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="neu-btn-primary inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-medium sm:h-10 sm:min-h-[40px] sm:w-auto"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            Add Stock SKU
          </button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="no-scrollbar flex snap-x touch-pan-x items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        <button
          type="button"
          onClick={() => setSelectedCategory("all")}
          className={`tabular-nums min-h-[44px] shrink-0 snap-start whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-medium transition-all sm:min-h-[32px] ${
            selectedCategory === "all"
              ? "neu-btn-primary"
              : "neu-btn text-ink-secondary"
          }`}
        >
          All Categories ({items.filter((i) => !i.isDeleted).length})
        </button>
        {categories.map((cat) => {
          const count = items.filter(
            (i) => !i.isDeleted && i.categoryId === cat.id,
          ).length;
          const active = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`tabular-nums min-h-[44px] shrink-0 snap-start whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-medium transition-all sm:min-h-[32px] ${
                active ? "neu-btn-primary" : "neu-btn text-ink-secondary"
              }`}
            >
              {cat.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Manage Categories Panel */}
      {showCategoryForm && (
        <div className="glass-card rounded-2xl p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-ink">
            Product Categories
          </h3>
          <p className="mt-0.5 text-xs text-ink-secondary">
            Pre-populated from your business type. Add or remove empty categories.
          </p>

          <form
            onSubmit={handleAddCategory}
            className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            <input
              type="text"
              required
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="New category name"
              className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
            />
            <input
              type="text"
              value={catDesc}
              onChange={(e) => setCatDesc(e.target.value)}
              placeholder="Short description (optional)"
              className="neu-input min-h-[44px] w-full rounded-xl px-3.5 text-base sm:h-10 sm:min-h-[40px] sm:px-3 sm:text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="neu-btn-primary min-h-[44px] w-full rounded-xl px-4 text-xs font-medium sm:h-10 sm:min-h-[40px]"
            >
              Add Category
            </button>
          </form>

          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => {
              const itemCount = items.filter(
                (i) => !i.isDeleted && i.categoryId === cat.id,
              ).length;
              return (
                <div
                  key={cat.id}
                  className="glass-subpanel flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-ink">
                      {cat.name}
                    </div>
                    <div className="tabular-nums text-[11px] text-ink-muted">
                      {itemCount} SKUs
                    </div>
                  </div>
                  {itemCount === 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setPendingDelete({ kind: "category", category: cat })
                      }
                      className="neu-btn-danger flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-8 sm:w-8 sm:rounded-lg"
                      title="Delete empty category"
                    >
                      <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Inventory Table */}
      <div className="glass-card min-w-0 overflow-hidden rounded-2xl">
        <div className="table-scroll-container">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="glass-thead text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                <th className="min-w-[200px] px-4 py-3">SKU & Item</th>
                <th className="whitespace-nowrap px-4 py-3">Category</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Qty</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  Unit Cost
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  Target Sale
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  Asset Value (Cost)
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="glass-tbody">
              {filteredItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-xs text-ink-muted"
                  >
                    No inventory SKUs match this filter.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const cat = categoryMap.get(item.categoryId);
                  const lowStock = item.qtyOnHand <= item.reorderLevel;
                  const assetValue = item.qtyOnHand * item.unitCostPrice;
                  return (
                    <tr key={item.id} className="glass-row-hover">
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="glass-chip tabular-nums rounded-lg px-2 py-0.5 text-[11px] font-semibold">
                            {item.sku}
                          </span>
                          <span className="font-medium text-ink">
                            {item.name}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-ink-muted">
                          {item.brand ? `${item.brand} · ` : ""}
                          Supplier: {item.supplierRef}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-secondary">
                        {cat?.name || "Uncategorized"}
                      </td>
                      <td className="tabular-nums whitespace-nowrap px-4 py-3 text-right font-semibold">
                        <span
                          className={`inline-flex items-center gap-1 ${
                            lowStock ? "text-warning" : "text-ink"
                          }`}
                        >
                          {lowStock && (
                            <AlertTriangle className="h-3 w-3 text-warning-icon" />
                          )}
                          {item.qtyOnHand}
                        </span>
                      </td>
                      <td className="tabular-nums whitespace-nowrap px-4 py-3 text-right text-ink">
                        {formatCurrency(item.unitCostPrice, currency)}
                      </td>
                      <td className="tabular-nums whitespace-nowrap px-4 py-3 text-right text-ink-secondary">
                        {item.targetSalePrice !== null &&
                        item.targetSalePrice !== undefined ? (
                          formatCurrency(item.targetSalePrice, currency)
                        ) : (
                          <span className="text-ink-muted">Manual</span>
                        )}
                      </td>
                      <td className="tabular-nums whitespace-nowrap px-4 py-3 text-right font-medium text-ink">
                        {formatCurrency(assetValue, currency)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2 sm:gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setModalError(null);
                              setActiveAction({ itemId: item.id, mode: "restock" });
                              setActionQty("5");
                              setActionCost(String(item.unitCostPrice));
                              setActionNotes("");
                            }}
                            className="neu-btn inline-flex min-h-[44px] items-center rounded-xl px-3 text-xs font-medium text-ink sm:min-h-[30px] sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-[11px]"
                          >
                            Restock
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModalError(null);
                              setActiveAction({ itemId: item.id, mode: "adjust" });
                              setActionQty("-1");
                              setActionNotes("");
                            }}
                            className="neu-btn inline-flex min-h-[44px] items-center rounded-xl px-3 text-xs font-medium text-ink-secondary sm:min-h-[30px] sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-[11px]"
                          >
                            Adjust
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditPanel(item)}
                            className="neu-btn inline-flex min-h-[44px] items-center gap-1 rounded-xl px-3 text-xs font-medium text-accent sm:min-h-[30px] sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-[11px]"
                          >
                            <Pencil className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingDelete({ kind: "item", item })
                            }
                            className="neu-btn-danger inline-flex min-h-[44px] items-center gap-1 rounded-xl px-3 text-xs font-medium sm:min-h-[30px] sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-[11px]"
                          >
                            <Trash2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Supplier Old Balances & Running Payables */}
      {suppliers.length > 0 && (
        <div className="glass-card min-w-0 overflow-hidden rounded-2xl">
          <div className="glass-divider-b flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 shrink-0 text-accent" />
              <h3 className="text-sm font-semibold text-ink">
                Supplier Old Balances & Running Payables ({suppliers.length})
              </h3>
            </div>
            {onOpenBillScanner && (
              <button
                type="button"
                onClick={onOpenBillScanner}
                className="neu-btn inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-medium text-accent sm:min-h-[32px] sm:rounded-lg sm:px-3 sm:py-1 sm:text-[11px]"
              >
                <ScanLine className="h-3.5 w-3.5 shrink-0" />
                Scan Bill / Manage Suppliers
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {suppliers.map((sup) => (
              <div key={sup.id} className="glass-subpanel rounded-xl p-3 text-xs">
                <div className="font-semibold text-ink">{sup.supplierName}</div>
                <div className="mt-1.5 flex justify-between text-[11px]">
                  <span className="text-ink-muted">Old Balance</span>
                  <span className="tabular-nums font-medium text-warning">
                    {formatCurrency(sup.oldBalance, currency)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-ink-muted">Last Bill Amount</span>
                  <span className="tabular-nums text-ink">
                    {formatCurrency(sup.lastBillAmount, currency)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between border-t border-white/20 pt-1 text-[11px]">
                  <span className="font-semibold text-ink">Updated Balance</span>
                  <span className="tabular-nums font-semibold text-accent">
                    {formatCurrency(sup.runningBalance, currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
