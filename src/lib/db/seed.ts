import crypto from "crypto";
import {
  computeInventoryAssetValue,
  computeRunningReceivableBalance,
  computeSaleDispatch,
  getCurrentWeekLabel,
} from "@/lib/accounting";
import { hashPassword } from "@/lib/auth";
import { BUSINESS_PRESETS, slugifyCategory } from "@/lib/presets";
import type {
  Category,
  InventoryItem,
  LedgerEntry,
  SupplierAccount,
  Tenant,
  User,
  WeeklySettlement,
} from "@/types/domain";

export interface SeedDataset {
  tenants: Tenant[];
  users: User[];
  categories: Category[];
  items: InventoryItem[];
  suppliers?: SupplierAccount[];
  ledger: LedgerEntry[];
  settlements: WeeklySettlement[];
}

export const DEMO_ACCOUNT_PASSWORD = "aliems-demo-pass";

export function buildDemoSeedDataset(): SeedDataset {
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();

  const passwordHash = hashPassword(DEMO_ACCOUNT_PASSWORD);

  // Tenant 1: Appliances Store (Al-Noor Appliances)
  const t1Id = "tenant_alnoor_appliances";
  const u1Id = "user_alnoor_owner";
  const t1Preset = BUSINESS_PRESETS.appliances;

  const t1: Tenant = {
    id: t1Id,
    businessName: "Al-Noor Appliances",
    businessType: "appliances",
    currency: "PKR",
    skuPrefix: "APP",
    createdAt: hoursAgo(120),
  };

  const u1: User = {
    id: u1Id,
    tenantId: t1Id,
    fullName: "Tariq Mahmood",
    email: "appliances@aliems.demo",
    passwordHash,
    role: "owner",
    createdAt: hoursAgo(120),
  };

  const t1Categories: Category[] = t1Preset.categories.map((c, idx) => ({
    id: `cat_t1_${idx + 1}`,
    tenantId: t1Id,
    name: c.name,
    slug: slugifyCategory(c.name),
    description: c.description,
    isDefault: true,
    createdAt: hoursAgo(120),
  }));

  const findT1Cat = (name: string) =>
    t1Categories.find((c) => c.name === name)?.id || t1Categories[0].id;

  const t1Items: InventoryItem[] = t1Preset.starterItems.map((s, idx) => ({
    id: `item_t1_${idx + 1}`,
    tenantId: t1Id,
    categoryId: findT1Cat(s.categoryName),
    sku: `${t1.skuPrefix}-${s.skuSuffix}`,
    name: s.name,
    brand: s.brand,
    unitCostPrice: s.unitCostPrice,
    targetSalePrice: s.targetSalePrice ?? null,
    qtyOnHand: s.qtyOnHand,
    reorderLevel: s.reorderLevel,
    supplierRef: s.supplierRef,
    isDeleted: false,
    createdAt: hoursAgo(96),
    updatedAt: hoursAgo(12),
  }));

  const t1Ledger: LedgerEntry[] = [];
  const t1Settlements: WeeklySettlement[] = [];

  const initialT1Items = t1Items.map((it) => {
    if (it.id === "item_t1_1") return { ...it, qtyOnHand: it.qtyOnHand + 2 };
    if (it.id === "item_t1_2") return { ...it, qtyOnHand: it.qtyOnHand + 3 };
    return { ...it };
  });

  let runningInv = 0;
  for (const it of initialT1Items) {
    const costVal = it.qtyOnHand * it.unitCostPrice;
    runningInv += costVal;
    t1Ledger.push({
      id: `led_t1_open_${it.id}`,
      tenantId: t1Id,
      type: "OPENING_STOCK",
      itemId: it.id,
      itemSku: it.sku,
      itemName: it.name,
      itemBrand: it.brand,
      quantity: it.qtyOnHand,
      unitCostPrice: it.unitCostPrice,
      inventoryCostDelta: costVal,
      receivableDelta: 0,
      inventoryCostBalanceAfter: runningInv,
      receivableBalanceAfter: 0,
      reference: `INIT-${it.sku}`,
      notes: "Initial stock batch capitalization at cost",
      createdByUserId: u1Id,
      createdAt: hoursAgo(72),
    });
  }

  let runningRec = 0;
  const washerItem = initialT1Items[0];
  const washerSalePrice = washerItem.targetSalePrice ?? 36500;
  const sale1 = computeSaleDispatch({
    item: washerItem,
    quantity: 2,
    unitSalePrice: washerSalePrice,
    currentInventoryAssetValue: runningInv,
    currentRunningReceivableBalance: runningRec,
  });
  runningInv = sale1.newInventoryAssetValue;
  runningRec = sale1.newRunningReceivableBalance;
  t1Ledger.push({
    id: "led_t1_sale_1",
    tenantId: t1Id,
    type: "SALE_DISPATCH",
    itemId: washerItem.id,
    itemSku: washerItem.sku,
    itemName: washerItem.name,
    itemBrand: washerItem.brand,
    partyName: "Gulberg Electronics",
    quantity: 2,
    unitCostPrice: washerItem.unitCostPrice,
    unitSalePrice: washerSalePrice,
    inventoryCostDelta: -sale1.costDeduction,
    receivableDelta: sale1.receivableAddition,
    inventoryCostBalanceAfter: runningInv,
    receivableBalanceAfter: runningRec,
    reference: "DSP-1041",
    notes: "Counter dispatch to Gulberg dealer",
    createdByUserId: u1Id,
    createdAt: hoursAgo(20),
  });

  const fanItem = initialT1Items[1];
  const fanSalePrice = fanItem.targetSalePrice ?? 8200;
  const sale2 = computeSaleDispatch({
    item: fanItem,
    quantity: 3,
    unitSalePrice: fanSalePrice,
    currentInventoryAssetValue: runningInv,
    currentRunningReceivableBalance: runningRec,
  });
  runningInv = sale2.newInventoryAssetValue;
  runningRec = sale2.newRunningReceivableBalance;
  t1Ledger.push({
    id: "led_t1_sale_2",
    tenantId: t1Id,
    type: "SALE_DISPATCH",
    itemId: fanItem.id,
    itemSku: fanItem.sku,
    itemName: fanItem.name,
    itemBrand: fanItem.brand,
    partyName: "Kamran Brothers",
    quantity: 3,
    unitCostPrice: fanItem.unitCostPrice,
    unitSalePrice: fanSalePrice,
    inventoryCostDelta: -sale2.costDeduction,
    receivableDelta: sale2.receivableAddition,
    inventoryCostBalanceAfter: runningInv,
    receivableBalanceAfter: runningRec,
    reference: "DSP-1042",
    notes: "Walk-in trade pickup",
    createdByUserId: u1Id,
    createdAt: hoursAgo(6),
  });

  const settledAmt = 40000;
  const recBefore = runningRec;
  runningRec -= settledAmt;
  t1Settlements.push({
    id: "set_t1_1",
    tenantId: t1Id,
    weekLabel: getCurrentWeekLabel(now),
    recipientName: "Main Treasury Desk",
    settledAmount: settledAmt,
    receivableBefore: recBefore,
    receivableAfter: runningRec,
    settlementMethod: "bank_transfer",
    reference: "STL-WK-01",
    notes: "Mid-week clearing transfer",
    createdByUserId: u1Id,
    createdAt: hoursAgo(3),
  });
  t1Ledger.push({
    id: "led_t1_stl_1",
    tenantId: t1Id,
    type: "WEEKLY_SETTLEMENT",
    partyName: "Main Treasury Desk",
    inventoryCostDelta: 0,
    receivableDelta: -settledAmt,
    inventoryCostBalanceAfter: runningInv,
    receivableBalanceAfter: runningRec,
    reference: "STL-WK-01",
    notes: `Weekly settlement (${getCurrentWeekLabel(now)}) via bank transfer`,
    createdByUserId: u1Id,
    createdAt: hoursAgo(3),
  });

  // Tenant 2: Mobile Shop (CellCore Hub) — completely isolated second tenant
  const t2Id = "tenant_cellcore_mobile";
  const u2Id = "user_cellcore_owner";
  const t2Preset = BUSINESS_PRESETS.mobile;

  const t2: Tenant = {
    id: t2Id,
    businessName: "CellCore Hub",
    businessType: "mobile",
    currency: "PKR",
    skuPrefix: "MOB",
    createdAt: hoursAgo(100),
  };

  const u2: User = {
    id: u2Id,
    tenantId: t2Id,
    fullName: "Bilal Raza",
    email: "mobile@aliems.demo",
    passwordHash,
    role: "owner",
    createdAt: hoursAgo(100),
  };

  const t2Categories: Category[] = t2Preset.categories.map((c, idx) => ({
    id: `cat_t2_${idx + 1}`,
    tenantId: t2Id,
    name: c.name,
    slug: slugifyCategory(c.name),
    description: c.description,
    isDefault: true,
    createdAt: hoursAgo(100),
  }));

  const findT2Cat = (name: string) =>
    t2Categories.find((c) => c.name === name)?.id || t2Categories[0].id;

  const t2Items: InventoryItem[] = t2Preset.starterItems.map((s, idx) => ({
    id: `item_t2_${idx + 1}`,
    tenantId: t2Id,
    categoryId: findT2Cat(s.categoryName),
    sku: `${t2.skuPrefix}-${s.skuSuffix}`,
    name: s.name,
    brand: s.brand,
    unitCostPrice: s.unitCostPrice,
    targetSalePrice: s.targetSalePrice ?? null,
    qtyOnHand: s.qtyOnHand,
    reorderLevel: s.reorderLevel,
    supplierRef: s.supplierRef,
    isDeleted: false,
    createdAt: hoursAgo(80),
    updatedAt: hoursAgo(10),
  }));

  const t2Ledger: LedgerEntry[] = [];
  let t2Inv = 0;
  for (const it of t2Items) {
    const costVal = it.qtyOnHand * it.unitCostPrice;
    t2Inv += costVal;
    t2Ledger.push({
      id: `led_t2_open_${it.id}`,
      tenantId: t2Id,
      type: "OPENING_STOCK",
      itemId: it.id,
      itemSku: it.sku,
      itemName: it.name,
      itemBrand: it.brand,
      quantity: it.qtyOnHand,
      unitCostPrice: it.unitCostPrice,
      inventoryCostDelta: costVal,
      receivableDelta: 0,
      inventoryCostBalanceAfter: t2Inv,
      receivableBalanceAfter: 0,
      reference: `INIT-${it.sku}`,
      notes: "Initial stock batch capitalization at cost",
      createdByUserId: u2Id,
      createdAt: hoursAgo(60),
    });
  }

  void computeInventoryAssetValue;
  void computeRunningReceivableBalance;
  void crypto;

  return {
    tenants: [t1, t2],
    users: [u1, u2],
    categories: [...t1Categories, ...t2Categories],
    items: [...t1Items, ...t2Items],
    suppliers: [],
    ledger: [...t1Ledger, ...t2Ledger],
    settlements: t1Settlements,
  };
}
