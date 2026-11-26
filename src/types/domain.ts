export type BusinessType = "electronics" | "mobile" | "appliances" | "custom";

export interface Tenant {
  id: string;
  businessName: string;
  businessType: BusinessType;
  customBusinessLabel?: string;
  currency: string;
  skuPrefix: string;
  createdAt: string;
}

export interface User {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: "owner" | "operator";
  createdAt: string;
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string;
  isDefault: boolean;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  tenantId: string;
  categoryId: string;
  sku: string;
  name: string;
  brand: string;
  unitCostPrice: number;
  /** Optional target/suggested sale price. Null or undefined requires manual entry at dispatch. */
  targetSalePrice?: number | null;
  qtyOnHand: number;
  reorderLevel: number;
  supplierRef: string;
  isDeleted?: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierAccount {
  id: string;
  tenantId: string;
  supplierName: string;
  supplierNameLower: string;
  oldBalance: number;
  lastBillAmount: number;
  runningBalance: number;
  billDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScannedBillItem {
  id: string;
  itemName: string;
  skuOrModel: string;
  category: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface ScannedBillPayload {
  supplierName: string;
  billDate: string;
  items: ScannedBillItem[];
  billTotal: number;
}

export type LedgerEntryType =
  | "OPENING_STOCK"
  | "STOCK_IN"
  | "SALE_DISPATCH"
  | "WEEKLY_SETTLEMENT"
  | "STOCK_ADJUSTMENT"
  | "SUPPLIER_BALANCE";

export interface LedgerEntry {
  id: string;
  tenantId: string;
  type: LedgerEntryType;
  itemId?: string;
  itemSku?: string;
  itemName?: string;
  itemBrand?: string;
  /** Optional customer (on SALE_DISPATCH) or recipient/supplier party. */
  partyName?: string;
  quantity?: number;
  unitCostPrice?: number;
  unitSalePrice?: number;
  /** Change to total inventory asset value (at cost price). Negative on sales. */
  inventoryCostDelta: number;
  /** Change to running receivable balance (at sale price). Positive on sales, negative on settlements. */
  receivableDelta: number;
  /** Snapshot of total inventory asset value (at cost) immediately after this entry. */
  inventoryCostBalanceAfter: number;
  /** Snapshot of running receivable balance immediately after this entry. */
  receivableBalanceAfter: number;
  reference: string;
  notes: string;
  /** Optional invoice/bill date (YYYY-MM-DD) for supplier bills and balance updates. */
  billDate?: string;
  /** Optional batch id grouping items from a single bill commit. */
  billBatchId?: string;
  createdByUserId: string;
  createdAt: string;
}

export type CashFlowPeriodType = "weekly" | "monthly" | "custom";

export interface CashFlowLedgerRow {
  date: string;
  thisWeekAmount: number;
  amountPaid: number;
  totalAmount: number;
  remainingBalance: number;
  description: string;
  sourceType: "bill" | "payment";
  reference?: string;
}

export interface WeeklyCashFlowReportData {
  tenantId: string;
  shopName: string;
  currency: string;
  supplierId: string | "BLANK_MANUAL";
  supplierName: string;
  isBlankManual: boolean;
  periodType: CashFlowPeriodType;
  startDate: string;
  endDate: string;
  periodLabel: string;
  printDate: string;
  openingBalance: number;
  totalWeekBills: number;
  totalAmount: number;
  totalAmountPaid: number;
  finalRemainingBalance: number;
  blankRows: number;
  rows: CashFlowLedgerRow[];
}

export interface WeeklySettlement {
  id: string;
  tenantId: string;
  weekLabel: string;
  recipientName?: string;
  settledAmount: number;
  receivableBefore: number;
  receivableAfter: number;
  settlementMethod: "bank_transfer" | "cash_handover" | "cheque" | "other";
  reference: string;
  notes: string;
  createdByUserId: string;
  createdAt: string;
}

export interface SessionPayload {
  userId: string;
  tenantId: string;
  email: string;
  exp: number;
}

export interface TenantOverview {
  tenant: Tenant;
  user: Omit<User, "passwordHash">;
  storageMode: "mongodb" | "fallback";
  metrics: {
    inventoryAssetValue: number;
    runningReceivableBalance: number;
    totalUnitsInStock: number;
    totalSkuCount: number;
    lowStockCount: number;
    dispatchedThisWeekSaleTotal: number;
    dispatchedThisWeekCostTotal: number;
    settledThisWeekTotal: number;
    totalSettledAllTime: number;
    totalSupplierPayable: number;
  };
  categories: Category[];
  items: InventoryItem[];
  suppliers: SupplierAccount[];
  ledger: LedgerEntry[];
  settlements: WeeklySettlement[];
}
