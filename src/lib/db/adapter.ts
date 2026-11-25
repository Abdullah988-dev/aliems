import type {
  BusinessType,
  Category,
  InventoryItem,
  LedgerEntry,
  ScannedBillItem,
  SupplierAccount,
  Tenant,
  TenantOverview,
  User,
  WeeklySettlement,
} from "@/types/domain";

export type StorageMode = "mongodb" | "fallback";

export interface RegisterTenantInput {
  businessName: string;
  businessType: BusinessType;
  customBusinessLabel?: string;
  customCategories?: string[];
  currency?: string;
  fullName: string;
  email: string;
  passwordHash: string;
  includeStarterStock?: boolean;
}

export interface CreateCategoryInput {
  tenantId: string;
  name: string;
  description?: string;
}

export interface CreateItemInput {
  tenantId: string;
  userId: string;
  categoryId: string;
  sku?: string;
  name: string;
  brand: string;
  unitCostPrice: number;
  targetSalePrice?: number | null;
  qtyOnHand: number;
  reorderLevel: number;
  supplierRef?: string;
}

export interface UpdateItemInput {
  tenantId: string;
  userId: string;
  itemId: string;
  categoryId?: string;
  sku?: string;
  name?: string;
  brand?: string;
  unitCostPrice?: number;
  targetSalePrice?: number | null;
  qtyOnHand?: number;
  reorderLevel?: number;
  supplierRef?: string;
}

export interface RestockItemInput {
  tenantId: string;
  userId: string;
  itemId: string;
  addedQty: number;
  unitCostPrice: number;
  reference?: string;
  notes?: string;
}

export interface AdjustStockInput {
  tenantId: string;
  userId: string;
  itemId: string;
  qtyDelta: number;
  reference?: string;
  notes: string;
}

export interface RecordSaleInput {
  tenantId: string;
  userId: string;
  itemId: string;
  quantity: number;
  unitSalePrice: number;
  customerName?: string;
  reference?: string;
  notes?: string;
}

export interface RecordSettlementInput {
  tenantId: string;
  userId: string;
  settledAmount: number;
  weekLabel?: string;
  recipientName?: string;
  settlementMethod: WeeklySettlement["settlementMethod"];
  reference?: string;
  notes?: string;
}

export interface UpsertSupplierBalanceInput {
  tenantId: string;
  userId: string;
  supplierName: string;
  oldBalance: number;
  currentBillAmount: number;
  billDate?: string;
  notes?: string;
}

export interface CommitScannedBillInput {
  tenantId: string;
  userId: string;
  supplierName?: string;
  billDate?: string;
  oldBalance?: number;
  items: Array<Partial<ScannedBillItem>>;
}

export interface CommitScannedBillResult {
  addedCount: number;
  updatedCount: number;
  createdCategoriesCount: number;
  billTotal: number;
  supplier: SupplierAccount | null;
}

export interface UpdateTenantProfileInput {
  tenantId: string;
  businessName?: string;
  businessType?: BusinessType;
  customBusinessLabel?: string;
  currency?: string;
  provisionPresetCategories?: boolean;
}

export interface DatabaseAdapter {
  readonly mode: StorageMode;

  ensureSeeded(): Promise<void>;

  findUserByEmail(email: string): Promise<User | null>;
  findUserById(tenantId: string, userId: string): Promise<User | null>;
  findTenantById(tenantId: string): Promise<Tenant | null>;
  listDemoTenants(): Promise<
    Array<{
      tenantId: string;
      businessName: string;
      businessType: BusinessType;
      email: string;
    }>
  >;

  registerTenant(input: RegisterTenantInput): Promise<{
    tenant: Tenant;
    user: User;
  }>;

  updateTenantProfile(input: UpdateTenantProfileInput): Promise<Tenant>;

  getTenantOverview(tenantId: string, userId: string): Promise<TenantOverview | null>;

  createCategory(input: CreateCategoryInput): Promise<Category>;
  deleteCategory(tenantId: string, categoryId: string): Promise<void>;

  createInventoryItem(input: CreateItemInput): Promise<{
    item: InventoryItem;
    ledgerEntry: LedgerEntry | null;
  }>;

  updateInventoryItem(input: UpdateItemInput): Promise<{
    item: InventoryItem;
    ledgerEntry: LedgerEntry | null;
  }>;

  deleteInventoryItem(
    tenantId: string,
    userId: string,
    itemId: string,
  ): Promise<{ mode: "soft" | "hard" }>;

  restockInventoryItem(input: RestockItemInput): Promise<{
    item: InventoryItem;
    ledgerEntry: LedgerEntry;
  }>;

  adjustInventoryStock(input: AdjustStockInput): Promise<{
    item: InventoryItem;
    ledgerEntry: LedgerEntry;
  }>;

  recordSaleDispatch(input: RecordSaleInput): Promise<{
    item: InventoryItem;
    ledgerEntry: LedgerEntry;
  }>;

  recordWeeklySettlement(input: RecordSettlementInput): Promise<{
    settlement: WeeklySettlement;
    ledgerEntry: LedgerEntry;
  }>;

  upsertSupplierBalance(input: UpsertSupplierBalanceInput): Promise<{
    supplier: SupplierAccount;
    ledgerEntry: LedgerEntry;
  }>;

  commitScannedBill(input: CommitScannedBillInput): Promise<CommitScannedBillResult>;
}
