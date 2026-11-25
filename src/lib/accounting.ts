import type {
  InventoryItem,
  LedgerEntry,
  SupplierAccount,
  WeeklySettlement,
} from "@/types/domain";

/** Round currency amounts cleanly to 2 decimal places and eliminate negative zero. */
export function roundMoney(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Parse an optional price field (accepts null, undefined, or empty string -> null).
 * Throws an Error if a non-empty value is invalid or negative.
 */
export function parseOptionalPrice(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error("Target sale price must be a non-negative number or left blank.");
  }
  return roundMoney(num);
}

/**
 * Compute total inventory asset value strictly from remaining active units * unitCostPrice.
 */
export function computeInventoryAssetValue(items: InventoryItem[]): number {
  return roundMoney(
    items
      .filter((item) => !item.isDeleted)
      .reduce((sum, item) => sum + item.qtyOnHand * item.unitCostPrice, 0),
  );
}

/**
 * Compute running receivable balance from the tenant's ledger entries.
 * Each sale adds salePrice * qty; each settlement subtracts settledAmount.
 */
export function computeRunningReceivableBalance(ledger: LedgerEntry[]): number {
  return roundMoney(
    ledger.reduce((sum, entry) => sum + entry.receivableDelta, 0),
  );
}

export interface SaleDispatchComputation {
  costDeduction: number;
  receivableAddition: number;
  newQtyOnHand: number;
  newInventoryAssetValue: number;
  newRunningReceivableBalance: number;
}

/**
 * Core AliEMS Pricing & Profit Separation Rule:
 * - Deduct ONLY (quantity * unitCostPrice) from inventory asset value.
 * - Route (quantity * unitSalePrice) to the running receivable balance for weekly settlements.
 * - Never book immediate net profit at point of sale.
 */
export function computeSaleDispatch(params: {
  item: InventoryItem;
  quantity: number;
  unitSalePrice: number;
  currentInventoryAssetValue: number;
  currentRunningReceivableBalance: number;
}): SaleDispatchComputation {
  const {
    item,
    quantity,
    unitSalePrice,
    currentInventoryAssetValue,
    currentRunningReceivableBalance,
  } = params;

  if (item.isDeleted) {
    throw new Error(`Item ${item.name} (${item.sku}) has been deleted.`);
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Sale quantity must be a positive whole number.");
  }
  if (quantity > item.qtyOnHand) {
    throw new Error(
      `Insufficient stock for ${item.name} (${item.sku}): requested ${quantity}, available ${item.qtyOnHand}.`,
    );
  }
  if (!Number.isFinite(unitSalePrice) || unitSalePrice < 0) {
    throw new Error("Unit sale price must be a non-negative number.");
  }

  const costDeduction = roundMoney(quantity * item.unitCostPrice);
  const receivableAddition = roundMoney(quantity * unitSalePrice);
  const newQtyOnHand = item.qtyOnHand - quantity;
  const newInventoryAssetValue = roundMoney(
    currentInventoryAssetValue - costDeduction,
  );
  const newRunningReceivableBalance = roundMoney(
    currentRunningReceivableBalance + receivableAddition,
  );

  return {
    costDeduction,
    receivableAddition,
    newQtyOnHand,
    newInventoryAssetValue,
    newRunningReceivableBalance,
  };
}

/**
 * Compute weighted-average unit cost price when restocking an existing SKU,
 * ensuring sum(qty * unitCostPrice) tracks exact cumulative cost basis.
 */
export function computeRestockValues(params: {
  item: InventoryItem;
  addedQty: number;
  unitCostPrice: number;
  currentInventoryAssetValue: number;
}): {
  newQtyOnHand: number;
  newUnitCostPrice: number;
  costAddition: number;
  newInventoryAssetValue: number;
} {
  const { item, addedQty, unitCostPrice, currentInventoryAssetValue } = params;
  if (!Number.isInteger(addedQty) || addedQty <= 0) {
    throw new Error("Restock quantity must be a positive whole number.");
  }
  if (!Number.isFinite(unitCostPrice) || unitCostPrice < 0) {
    throw new Error("Unit cost price must be non-negative.");
  }

  const costAddition = roundMoney(addedQty * unitCostPrice);
  const oldTotalCost = roundMoney(item.qtyOnHand * item.unitCostPrice);
  const newQtyOnHand = item.qtyOnHand + addedQty;
  const newUnitCostPrice =
    newQtyOnHand > 0 ? roundMoney((oldTotalCost + costAddition) / newQtyOnHand) : unitCostPrice;
  const newInventoryAssetValue = roundMoney(currentInventoryAssetValue + costAddition);

  return {
    newQtyOnHand,
    newUnitCostPrice,
    costAddition,
    newInventoryAssetValue,
  };
}

export function getStartOfCurrentWeekIso(now: Date = new Date()): string {
  const d = new Date(now);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday as start of business week
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function getCurrentWeekLabel(now: Date = new Date()): string {
  const startIso = getStartOfCurrentWeekIso(now);
  const start = new Date(startIso);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (dt: Date) =>
    dt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function computeWeeklyMetrics(params: {
  items: InventoryItem[];
  ledger: LedgerEntry[];
  settlements: WeeklySettlement[];
  suppliers?: SupplierAccount[];
  now?: Date;
}) {
  const { items, ledger, settlements, suppliers = [], now = new Date() } = params;
  const weekStart = getStartOfCurrentWeekIso(now);
  const activeItems = items.filter((i) => !i.isDeleted);

  const inventoryAssetValue = computeInventoryAssetValue(activeItems);
  const runningReceivableBalance = computeRunningReceivableBalance(ledger);
  const totalUnitsInStock = activeItems.reduce((sum, i) => sum + i.qtyOnHand, 0);
  const lowStockCount = activeItems.filter((i) => i.qtyOnHand <= i.reorderLevel).length;
  const totalSupplierPayable = roundMoney(
    suppliers.reduce((sum, s) => sum + s.runningBalance, 0),
  );

  let dispatchedThisWeekSaleTotal = 0;
  let dispatchedThisWeekCostTotal = 0;

  for (const entry of ledger) {
    if (entry.type === "SALE_DISPATCH" && entry.createdAt >= weekStart) {
      dispatchedThisWeekSaleTotal += entry.receivableDelta;
      dispatchedThisWeekCostTotal += Math.abs(entry.inventoryCostDelta);
    }
  }

  let settledThisWeekTotal = 0;
  let totalSettledAllTime = 0;
  for (const s of settlements) {
    totalSettledAllTime += s.settledAmount;
    if (s.createdAt >= weekStart) {
      settledThisWeekTotal += s.settledAmount;
    }
  }

  return {
    inventoryAssetValue: roundMoney(inventoryAssetValue),
    runningReceivableBalance: roundMoney(runningReceivableBalance),
    totalUnitsInStock,
    totalSkuCount: activeItems.length,
    lowStockCount,
    dispatchedThisWeekSaleTotal: roundMoney(dispatchedThisWeekSaleTotal),
    dispatchedThisWeekCostTotal: roundMoney(dispatchedThisWeekCostTotal),
    settledThisWeekTotal: roundMoney(settledThisWeekTotal),
    totalSettledAllTime: roundMoney(totalSettledAllTime),
    totalSupplierPayable,
  };
}
