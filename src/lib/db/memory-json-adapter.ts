import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  computeInventoryAssetValue,
  computeRestockValues,
  computeRunningReceivableBalance,
  computeSaleDispatch,
  computeWeeklyMetrics,
  getCurrentWeekLabel,
  parseOptionalPrice,
  roundMoney,
} from "@/lib/accounting";
import type {
  AdjustStockInput,
  CommitScannedBillInput,
  CommitScannedBillResult,
  CreateCategoryInput,
  CreateItemInput,
  DatabaseAdapter,
  RecordSaleInput,
  RecordSettlementInput,
  RegisterTenantInput,
  RestockItemInput,
  UpdateItemInput,
  UpdateTenantProfileInput,
  UpsertSupplierBalanceInput,
} from "@/lib/db/adapter";
import { computeUpdatedSupplierBalance, normalizeScannedItem } from "@/lib/bill-helpers";
import { buildDemoSeedDataset, type SeedDataset } from "@/lib/db/seed";
import { BUSINESS_PRESETS, slugifyCategory } from "@/lib/presets";
import type {
  Category,
  InventoryItem,
  LedgerEntry,
  SupplierAccount,
  Tenant,
  TenantOverview,
  User,
  WeeklySettlement,
} from "@/types/domain";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function generateUniqueSku(
  prefix: string,
  existingSkus: Set<string>,
): string {
  const cleanPrefix = prefix.replace(/-+$/, "") || "SKU";
  let seq = 101;
  while (existingSkus.has(`${cleanPrefix}-${seq}`)) {
    seq += 1;
  }
  return `${cleanPrefix}-${seq}`;
}

function normalizeLegacyItem(raw: InventoryItem & { defaultSalePrice?: number | null }): InventoryItem {
  const { defaultSalePrice, ...rest } = raw;
  const resolvedTarget =
    rest.targetSalePrice !== undefined
      ? rest.targetSalePrice
      : defaultSalePrice !== undefined
        ? defaultSalePrice
        : null;
  return {
    ...rest,
    targetSalePrice: resolvedTarget,
  };
}

function resolveStoreFilePath(): string | null {
  const localDir = path.join(process.cwd(), ".data");
  try {
    fs.mkdirSync(localDir, { recursive: true });
    const testPath = path.join(localDir, ".write-check");
    fs.writeFileSync(testPath, "ok");
    fs.unlinkSync(testPath);
    return path.join(localDir, "aliems-store.json");
  } catch {
    try {
      const tmpPath = path.join("/tmp", "aliems-store.json");
      fs.writeFileSync(tmpPath, fs.existsSync(tmpPath) ? fs.readFileSync(tmpPath) : "");
      return tmpPath;
    } catch {
      return null;
    }
  }
}

export class MemoryJsonAdapter implements DatabaseAdapter {
  readonly mode = "fallback" as const;

  private data: SeedDataset | null = null;
  private filePath: string | null = null;
  private lock: Promise<void> = Promise.resolve();
  private customFilePath?: string;

  constructor(customFilePath?: string) {
    this.customFilePath = customFilePath;
  }

  private async withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    const prev = this.lock;
    let release!: () => void;
    this.lock = new Promise<void>((res) => {
      release = res;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private loadIfNeeded(): SeedDataset {
    if (this.data) return this.data;

    if (this.customFilePath) {
      this.filePath = this.customFilePath;
    } else if (process.env.NODE_ENV !== "test") {
      this.filePath = resolveStoreFilePath();
    }

    if (this.filePath && fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, "utf8");
        if (raw.trim()) {
          const parsed = JSON.parse(raw) as SeedDataset;
          if (Array.isArray(parsed.tenants) && Array.isArray(parsed.users)) {
            parsed.items = (parsed.items || []).map(normalizeLegacyItem);
            this.data = parsed;
            return this.data;
          }
        }
      } catch {
        // Fall through to seed
      }
    }

    this.data = buildDemoSeedDataset();
    this.persist();
    return this.data;
  }

  private persist(): void {
    if (!this.filePath || !this.data) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
    } catch {
      // Ignore write failures in read-only environments
    }
  }

  async ensureSeeded(): Promise<void> {
    await this.withLock(() => {
      this.loadIfNeeded();
    });
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      const norm = email.trim().toLowerCase();
      return db.users.find((u) => u.email.toLowerCase() === norm) ?? null;
    });
  }

  async findUserById(tenantId: string, userId: string): Promise<User | null> {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      return db.users.find((u) => u.tenantId === tenantId && u.id === userId) ?? null;
    });
  }

  async findTenantById(tenantId: string): Promise<Tenant | null> {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      return db.tenants.find((t) => t.id === tenantId) ?? null;
    });
  }

  async listDemoTenants() {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      return db.tenants
        .filter((t) => t.id.startsWith("tenant_"))
        .map((t) => {
          const owner = db.users.find((u) => u.tenantId === t.id && u.role === "owner");
          return {
            tenantId: t.id,
            businessName: t.businessName,
            businessType: t.businessType,
            email: owner?.email ?? "",
          };
        })
        .filter((d) => Boolean(d.email));
    });
  }

  async registerTenant(input: RegisterTenantInput): Promise<{ tenant: Tenant; user: User }> {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      const normEmail = input.email.trim().toLowerCase();
      if (db.users.some((u) => u.email.toLowerCase() === normEmail)) {
        throw new Error("An account with this email already exists.");
      }

      const nowIso = new Date().toISOString();
      const preset = BUSINESS_PRESETS[input.businessType];
      const tenantId = newId("ten");
      const userId = newId("usr");

      const tenant: Tenant = {
        id: tenantId,
        businessName: input.businessName.trim(),
        businessType: input.businessType,
        customBusinessLabel: input.customBusinessLabel?.trim() || undefined,
        currency: (input.currency || preset.defaultCurrency).trim().toUpperCase(),
        skuPrefix: preset.skuPrefix,
        createdAt: nowIso,
      };

      const user: User = {
        id: userId,
        tenantId,
        fullName: input.fullName.trim(),
        email: normEmail,
        passwordHash: input.passwordHash,
        role: "owner",
        createdAt: nowIso,
      };

      const rawCustomCats = (input.customCategories || [])
        .map((c) => c.trim())
        .filter(Boolean);

      const categorySeeds =
        rawCustomCats.length > 0
          ? rawCustomCats.map((name) => ({
              name,
              description: `${name} inventory category`,
            }))
          : preset.categories;

      const createdCategories: Category[] = categorySeeds.map((c) => ({
        id: newId("cat"),
        tenantId,
        name: c.name,
        slug: slugifyCategory(c.name) || newId("cat"),
        description: c.description,
        isDefault: true,
        createdAt: nowIso,
      }));

      const createdItems: InventoryItem[] = [];
      const createdLedger: LedgerEntry[] = [];

      if (input.includeStarterStock && preset.starterItems.length > 0) {
        let runningInv = 0;
        for (const s of preset.starterItems) {
          const cat =
            createdCategories.find((c) => c.name === s.categoryName) ??
            createdCategories[0];
          const item: InventoryItem = {
            id: newId("itm"),
            tenantId,
            categoryId: cat.id,
            sku: `${tenant.skuPrefix}-${s.skuSuffix}`,
            name: s.name,
            brand: s.brand,
            unitCostPrice: s.unitCostPrice,
            targetSalePrice: s.targetSalePrice ?? null,
            qtyOnHand: s.qtyOnHand,
            reorderLevel: s.reorderLevel,
            supplierRef: s.supplierRef,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          createdItems.push(item);

          const costDelta = roundMoney(item.qtyOnHand * item.unitCostPrice);
          runningInv = roundMoney(runningInv + costDelta);
          createdLedger.push({
            id: newId("led"),
            tenantId,
            type: "OPENING_STOCK",
            itemId: item.id,
            itemSku: item.sku,
            itemName: item.name,
            itemBrand: item.brand,
            quantity: item.qtyOnHand,
            unitCostPrice: item.unitCostPrice,
            inventoryCostDelta: costDelta,
            receivableDelta: 0,
            inventoryCostBalanceAfter: runningInv,
            receivableBalanceAfter: 0,
            reference: `INIT-${item.sku}`,
            notes: "Onboarding starter stock at cost",
            createdByUserId: userId,
            createdAt: nowIso,
          });
        }
      }

      db.tenants.push(tenant);
      db.users.push(user);
      db.categories.push(...createdCategories);
      db.items.push(...createdItems);
      db.ledger.push(...createdLedger);
      this.persist();

      return { tenant, user };
    });
  }

  async updateTenantProfile(input: UpdateTenantProfileInput): Promise<Tenant> {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      const tenant = db.tenants.find((t) => t.id === input.tenantId);
      if (!tenant) {
        throw new Error("Tenant workspace not found.");
      }

      if (input.businessName?.trim()) {
        tenant.businessName = input.businessName.trim();
      }
      if (input.businessType) {
        tenant.businessType = input.businessType;
        tenant.skuPrefix = BUSINESS_PRESETS[input.businessType].skuPrefix;
      }
      if (input.customBusinessLabel !== undefined) {
        tenant.customBusinessLabel = input.customBusinessLabel.trim() || undefined;
      }
      if (input.currency?.trim()) {
        tenant.currency = input.currency.trim().toUpperCase();
      }

      if (input.provisionPresetCategories && input.businessType) {
        const preset = BUSINESS_PRESETS[input.businessType];
        const existingSlugs = new Set(
          db.categories
            .filter((c) => c.tenantId === input.tenantId)
            .map((c) => c.slug),
        );
        const nowIso = new Date().toISOString();
        for (const cat of preset.categories) {
          const slug = slugifyCategory(cat.name);
          if (!existingSlugs.has(slug)) {
            db.categories.push({
              id: newId("cat"),
              tenantId: input.tenantId,
              name: cat.name,
              slug,
              description: cat.description,
              isDefault: true,
              createdAt: nowIso,
            });
          }
        }
      }

      this.persist();
      return { ...tenant };
    });
  }

  async getTenantOverview(tenantId: string, userId: string): Promise<TenantOverview | null> {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      const tenant = db.tenants.find((t) => t.id === tenantId);
      const user = db.users.find((u) => u.tenantId === tenantId && u.id === userId);
      if (!tenant || !user) return null;

      const categories = db.categories
        .filter((c) => c.tenantId === tenantId)
        .sort((a, b) => a.name.localeCompare(b.name));
      const items = db.items
        .filter((i) => i.tenantId === tenantId && !i.isDeleted)
        .sort((a, b) => a.name.localeCompare(b.name));
      const ledger = db.ledger
        .filter((l) => l.tenantId === tenantId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const settlements = db.settlements
        .filter((s) => s.tenantId === tenantId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const suppliers = (db.suppliers || [])
        .filter((s) => s.tenantId === tenantId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      const metrics = computeWeeklyMetrics({ items, ledger, settlements, suppliers });
      const { passwordHash: _ignored, ...safeUser } = user;
      void _ignored;

      return {
        tenant: { ...tenant },
        user: safeUser,
        storageMode: this.mode,
        metrics,
        categories,
        items,
        suppliers,
        ledger,
        settlements,
      };
    });
  }

  async createCategory(input: CreateCategoryInput): Promise<Category> {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      const name = input.name.trim();
      if (!name) throw new Error("Category name is required.");
      const slug = slugifyCategory(name) || newId("cat");
      const duplicate = db.categories.find(
        (c) => c.tenantId === input.tenantId && c.slug === slug,
      );
      if (duplicate) {
        throw new Error(`Category "${name}" already exists in this workspace.`);
      }
      const category: Category = {
        id: newId("cat"),
        tenantId: input.tenantId,
        name,
        slug,
        description: input.description?.trim() || `${name} stock category`,
        isDefault: false,
        createdAt: new Date().toISOString(),
      };
      db.categories.push(category);
      this.persist();
      return category;
    });
  }

  async deleteCategory(tenantId: string, categoryId: string): Promise<void> {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      const hasItems = db.items.some(
        (i) => i.tenantId === tenantId && i.categoryId === categoryId && !i.isDeleted,
      );
      if (hasItems) {
        throw new Error("Cannot delete a category that still contains active inventory items.");
      }
      const idx = db.categories.findIndex(
        (c) => c.tenantId === tenantId && c.id === categoryId,
      );
      if (idx === -1) {
        throw new Error("Category not found in this workspace.");
      }
      db.categories.splice(idx, 1);
      this.persist();
    });
  }

  async createInventoryItem(input: CreateItemInput): Promise<{
    item: InventoryItem;
    ledgerEntry: LedgerEntry | null;
  }> {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      const cat = db.categories.find(
        (c) => c.tenantId === input.tenantId && c.id === input.categoryId,
      );
      if (!cat) {
        throw new Error("Selected category does not belong to this workspace.");
      }

      const tenant = db.tenants.find((t) => t.id === input.tenantId);
      const tenantItems = db.items.filter(
        (i) => i.tenantId === input.tenantId && !i.isDeleted,
      );
      const existingSkus = new Set(tenantItems.map((i) => i.sku.toUpperCase()));

      const rawSku = (input.sku ?? "").trim().toUpperCase();
      const sku =
        !rawSku || rawSku.endsWith("-")
          ? generateUniqueSku(rawSku || tenant?.skuPrefix || "SKU", existingSkus)
          : rawSku;

      if (existingSkus.has(sku)) {
        throw new Error(`SKU "${sku}" already exists in your inventory.`);
      }
      if (!input.name.trim()) {
        throw new Error("Item name is required.");
      }
      if (!Number.isInteger(input.qtyOnHand) || input.qtyOnHand < 0) {
        throw new Error("Initial quantity must be a non-negative integer.");
      }
      if (!Number.isFinite(input.unitCostPrice) || input.unitCostPrice < 0) {
        throw new Error("Unit cost price must be a non-negative number.");
      }
      const targetSalePrice = parseOptionalPrice(input.targetSalePrice);

      const tenantLedger = db.ledger.filter((l) => l.tenantId === input.tenantId);
      const currentInvValue = computeInventoryAssetValue(tenantItems);
      const currentReceivable = computeRunningReceivableBalance(tenantLedger);

      const nowIso = new Date().toISOString();
      const item: InventoryItem = {
        id: newId("itm"),
        tenantId: input.tenantId,
        categoryId: input.categoryId,
        sku,
        name: input.name.trim(),
        brand: input.brand.trim(),
        unitCostPrice: roundMoney(input.unitCostPrice),
        targetSalePrice,
        qtyOnHand: input.qtyOnHand,
        reorderLevel: Math.max(0, Math.floor(input.reorderLevel)),
        supplierRef: input.supplierRef?.trim() || "DIRECT",
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      db.items.push(item);

      let ledgerEntry: LedgerEntry | null = null;
      if (item.qtyOnHand > 0) {
        const costDelta = roundMoney(item.qtyOnHand * item.unitCostPrice);
        ledgerEntry = {
          id: newId("led"),
          tenantId: input.tenantId,
          type: "OPENING_STOCK",
          itemId: item.id,
          itemSku: item.sku,
          itemName: item.name,
          itemBrand: item.brand,
          quantity: item.qtyOnHand,
          unitCostPrice: item.unitCostPrice,
          inventoryCostDelta: costDelta,
          receivableDelta: 0,
          inventoryCostBalanceAfter: roundMoney(currentInvValue + costDelta),
          receivableBalanceAfter: currentReceivable,
          reference: `INIT-${item.sku}`,
          notes: `New SKU added (${item.qtyOnHand} units @ cost)`,
          createdByUserId: input.userId,
          createdAt: nowIso,
        };
        db.ledger.push(ledgerEntry);
      }

      this.persist();
      return { item: { ...item }, ledgerEntry };
    });
  }

  async updateInventoryItem(input: UpdateItemInput): Promise<{
    item: InventoryItem;
    ledgerEntry: LedgerEntry | null;
  }> {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      const item = db.items.find(
        (i) => i.tenantId === input.tenantId && i.id === input.itemId && !i.isDeleted,
      );
      if (!item) {
        throw new Error("Inventory item not found in this workspace.");
      }

      if (input.categoryId !== undefined) {
        const cat = db.categories.find(
          (c) => c.tenantId === input.tenantId && c.id === input.categoryId,
        );
        if (!cat) {
          throw new Error("Selected category does not belong to this workspace.");
        }
        item.categoryId = input.categoryId;
      }

      if (input.sku !== undefined) {
        const nextSku = input.sku.trim().toUpperCase();
        if (!nextSku) throw new Error("SKU cannot be empty.");
        const dup = db.items.find(
          (i) =>
            i.tenantId === input.tenantId &&
            i.id !== item.id &&
            !i.isDeleted &&
            i.sku === nextSku,
        );
        if (dup) {
          throw new Error(`SKU "${nextSku}" is already assigned to another item.`);
        }
        item.sku = nextSku;
      }

      if (input.name !== undefined) {
        const nextName = input.name.trim();
        if (!nextName) throw new Error("Item name cannot be empty.");
        item.name = nextName;
      }

      if (input.brand !== undefined) {
        item.brand = input.brand.trim();
      }

      if (input.targetSalePrice !== undefined) {
        item.targetSalePrice = parseOptionalPrice(input.targetSalePrice);
      }

      if (input.reorderLevel !== undefined) {
        item.reorderLevel = Math.max(0, Math.floor(input.reorderLevel));
      }

      if (input.supplierRef !== undefined) {
        item.supplierRef = input.supplierRef.trim() || "DIRECT";
      }

      let ledgerEntry: LedgerEntry | null = null;
      const nowIso = new Date().toISOString();

      const oldCost = item.unitCostPrice;
      const oldQty = item.qtyOnHand;
      let nextCost = oldCost;
      let nextQty = oldQty;

      if (input.unitCostPrice !== undefined) {
        if (!Number.isFinite(input.unitCostPrice) || input.unitCostPrice < 0) {
          throw new Error("Unit cost price must be a non-negative number.");
        }
        nextCost = roundMoney(input.unitCostPrice);
      }

      if (input.qtyOnHand !== undefined) {
        if (!Number.isInteger(input.qtyOnHand) || input.qtyOnHand < 0) {
          throw new Error("Quantity on hand must be a non-negative integer.");
        }
        nextQty = input.qtyOnHand;
      }

      if (nextCost !== oldCost || nextQty !== oldQty) {
        const tenantItems = db.items.filter(
          (i) => i.tenantId === input.tenantId && !i.isDeleted,
        );
        const tenantLedger = db.ledger.filter((l) => l.tenantId === input.tenantId);
        const currentInvValue = computeInventoryAssetValue(tenantItems);
        const currentReceivable = computeRunningReceivableBalance(tenantLedger);

        const costDelta = roundMoney(nextQty * nextCost - oldQty * oldCost);
        item.unitCostPrice = nextCost;
        item.qtyOnHand = nextQty;

        if (costDelta !== 0 || nextQty !== oldQty) {
          const notesParts: string[] = [];
          if (nextQty !== oldQty) {
            notesParts.push(`Qty ${oldQty} -> ${nextQty}`);
          }
          if (nextCost !== oldCost) {
            notesParts.push(`Cost ${oldCost} -> ${nextCost}`);
          }

          ledgerEntry = {
            id: newId("led"),
            tenantId: input.tenantId,
            type: "STOCK_ADJUSTMENT",
            itemId: item.id,
            itemSku: item.sku,
            itemName: item.name,
            itemBrand: item.brand,
            quantity: Math.abs(nextQty - oldQty) || nextQty,
            unitCostPrice: nextCost,
            inventoryCostDelta: costDelta,
            receivableDelta: 0,
            inventoryCostBalanceAfter: roundMoney(currentInvValue + costDelta),
            receivableBalanceAfter: currentReceivable,
            reference: `UPD-${item.sku}`,
            notes: `SKU updated (${notesParts.join(" · ")})`,
            createdByUserId: input.userId,
            createdAt: nowIso,
          };
          db.ledger.push(ledgerEntry);
        }
      }

      item.updatedAt = nowIso;
      this.persist();
      return { item: { ...item }, ledgerEntry };
    });
  }

  async deleteInventoryItem(
    tenantId: string,
    userId: string,
    itemId: string,
  ): Promise<{ mode: "soft" | "hard" }> {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      const idx = db.items.findIndex(
        (i) => i.tenantId === tenantId && i.id === itemId && !i.isDeleted,
      );
      if (idx === -1) {
        throw new Error("Inventory item not found in this workspace.");
      }

      const item = db.items[idx];
      const hasLedgerHistory = db.ledger.some(
        (l) => l.tenantId === tenantId && l.itemId === itemId,
      );

      if (!hasLedgerHistory && item.qtyOnHand === 0) {
        db.items.splice(idx, 1);
        this.persist();
        return { mode: "hard" };
      }

      const nowIso = new Date().toISOString();
      if (item.qtyOnHand > 0) {
        const tenantItems = db.items.filter(
          (i) => i.tenantId === tenantId && !i.isDeleted,
        );
        const tenantLedger = db.ledger.filter((l) => l.tenantId === tenantId);
        const currentInvValue = computeInventoryAssetValue(tenantItems);
        const currentReceivable = computeRunningReceivableBalance(tenantLedger);
        const costWriteOff = -roundMoney(item.qtyOnHand * item.unitCostPrice);

        db.ledger.push({
          id: newId("led"),
          tenantId,
          type: "STOCK_ADJUSTMENT",
          itemId: item.id,
          itemSku: item.sku,
          itemName: item.name,
          itemBrand: item.brand,
          quantity: item.qtyOnHand,
          unitCostPrice: item.unitCostPrice,
          inventoryCostDelta: costWriteOff,
          receivableDelta: 0,
          inventoryCostBalanceAfter: roundMoney(currentInvValue + costWriteOff),
          receivableBalanceAfter: currentReceivable,
          reference: `DEL-${item.sku}`,
          notes: `SKU archived (${item.qtyOnHand} units written off at cost; history preserved)`,
          createdByUserId: userId,
          createdAt: nowIso,
        });
        item.qtyOnHand = 0;
      }

      item.isDeleted = true;
      item.deletedAt = nowIso;
      item.updatedAt = nowIso;
      this.persist();
      return { mode: "soft" };
    });
  }

  async restockInventoryItem(input: RestockItemInput): Promise<{
    item: InventoryItem;
    ledgerEntry: LedgerEntry;
  }> {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      const item = db.items.find(
        (i) => i.tenantId === input.tenantId && i.id === input.itemId && !i.isDeleted,
      );
      if (!item) {
        throw new Error("Inventory item not found in this workspace.");
      }

      const tenantItems = db.items.filter(
        (i) => i.tenantId === input.tenantId && !i.isDeleted,
      );
      const tenantLedger = db.ledger.filter((l) => l.tenantId === input.tenantId);
      const currentInvValue = computeInventoryAssetValue(tenantItems);
      const currentReceivable = computeRunningReceivableBalance(tenantLedger);

      const calc = computeRestockValues({
        item,
        addedQty: input.addedQty,
        unitCostPrice: input.unitCostPrice,
        currentInventoryAssetValue: currentInvValue,
      });

      const nowIso = new Date().toISOString();
      item.qtyOnHand = calc.newQtyOnHand;
      item.unitCostPrice = calc.newUnitCostPrice;
      item.updatedAt = nowIso;

      const ledgerEntry: LedgerEntry = {
        id: newId("led"),
        tenantId: input.tenantId,
        type: "STOCK_IN",
        itemId: item.id,
        itemSku: item.sku,
        itemName: item.name,
        itemBrand: item.brand,
        quantity: input.addedQty,
        unitCostPrice: roundMoney(input.unitCostPrice),
        inventoryCostDelta: calc.costAddition,
        receivableDelta: 0,
        inventoryCostBalanceAfter: calc.newInventoryAssetValue,
        receivableBalanceAfter: currentReceivable,
        reference: input.reference?.trim() || `RST-${Date.now().toString().slice(-5)}`,
        notes: input.notes?.trim() || `Restocked ${input.addedQty} units`,
        createdByUserId: input.userId,
        createdAt: nowIso,
      };
      db.ledger.push(ledgerEntry);
      this.persist();

      return { item: { ...item }, ledgerEntry };
    });
  }

  async adjustInventoryStock(input: AdjustStockInput): Promise<{
    item: InventoryItem;
    ledgerEntry: LedgerEntry;
  }> {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      const item = db.items.find(
        (i) => i.tenantId === input.tenantId && i.id === input.itemId && !i.isDeleted,
      );
      if (!item) {
        throw new Error("Inventory item not found in this workspace.");
      }
      if (!Number.isInteger(input.qtyDelta) || input.qtyDelta === 0) {
        throw new Error("Adjustment quantity must be a non-zero integer.");
      }
      const nextQty = item.qtyOnHand + input.qtyDelta;
      if (nextQty < 0) {
        throw new Error("Stock adjustment cannot reduce quantity below zero.");
      }

      const tenantItems = db.items.filter(
        (i) => i.tenantId === input.tenantId && !i.isDeleted,
      );
      const tenantLedger = db.ledger.filter((l) => l.tenantId === input.tenantId);
      const currentInvValue = computeInventoryAssetValue(tenantItems);
      const currentReceivable = computeRunningReceivableBalance(tenantLedger);

      const costDelta = roundMoney(input.qtyDelta * item.unitCostPrice);
      const nowIso = new Date().toISOString();
      item.qtyOnHand = nextQty;
      item.updatedAt = nowIso;

      const ledgerEntry: LedgerEntry = {
        id: newId("led"),
        tenantId: input.tenantId,
        type: "STOCK_ADJUSTMENT",
        itemId: item.id,
        itemSku: item.sku,
        itemName: item.name,
        itemBrand: item.brand,
        quantity: Math.abs(input.qtyDelta),
        unitCostPrice: item.unitCostPrice,
        inventoryCostDelta: costDelta,
        receivableDelta: 0,
        inventoryCostBalanceAfter: roundMoney(currentInvValue + costDelta),
        receivableBalanceAfter: currentReceivable,
        reference: input.reference?.trim() || `ADJ-${Date.now().toString().slice(-5)}`,
        notes: input.notes.trim() || "Manual inventory audit adjustment",
        createdByUserId: input.userId,
        createdAt: nowIso,
      };
      db.ledger.push(ledgerEntry);
      this.persist();

      return { item: { ...item }, ledgerEntry };
    });
  }

  async recordSaleDispatch(input: RecordSaleInput): Promise<{
    item: InventoryItem;
    ledgerEntry: LedgerEntry;
  }> {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      const item = db.items.find(
        (i) => i.tenantId === input.tenantId && i.id === input.itemId && !i.isDeleted,
      );
      if (!item) {
        throw new Error("Inventory item not found in this workspace.");
      }

      const tenantItems = db.items.filter(
        (i) => i.tenantId === input.tenantId && !i.isDeleted,
      );
      const tenantLedger = db.ledger.filter((l) => l.tenantId === input.tenantId);
      const currentInvValue = computeInventoryAssetValue(tenantItems);
      const currentReceivable = computeRunningReceivableBalance(tenantLedger);

      const calc = computeSaleDispatch({
        item,
        quantity: input.quantity,
        unitSalePrice: input.unitSalePrice,
        currentInventoryAssetValue: currentInvValue,
        currentRunningReceivableBalance: currentReceivable,
      });

      const nowIso = new Date().toISOString();
      item.qtyOnHand = calc.newQtyOnHand;
      item.updatedAt = nowIso;
      const customerName = input.customerName?.trim() || undefined;

      const ledgerEntry: LedgerEntry = {
        id: newId("led"),
        tenantId: input.tenantId,
        type: "SALE_DISPATCH",
        itemId: item.id,
        itemSku: item.sku,
        itemName: item.name,
        itemBrand: item.brand,
        partyName: customerName,
        quantity: input.quantity,
        unitCostPrice: item.unitCostPrice,
        unitSalePrice: roundMoney(input.unitSalePrice),
        inventoryCostDelta: -calc.costDeduction,
        receivableDelta: calc.receivableAddition,
        inventoryCostBalanceAfter: calc.newInventoryAssetValue,
        receivableBalanceAfter: calc.newRunningReceivableBalance,
        reference: input.reference?.trim() || `DSP-${Date.now().toString().slice(-5)}`,
        notes:
          input.notes?.trim() ||
          (customerName
            ? `Dispatched ${input.quantity}x ${item.sku} to ${customerName}`
            : `Dispatched ${input.quantity}x ${item.sku} (cost deducted, sale routed to receivable)`),
        createdByUserId: input.userId,
        createdAt: nowIso,
      };

      db.ledger.push(ledgerEntry);
      this.persist();

      return { item: { ...item }, ledgerEntry };
    });
  }

  async recordWeeklySettlement(input: RecordSettlementInput): Promise<{
    settlement: WeeklySettlement;
    ledgerEntry: LedgerEntry;
  }> {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      const amount = roundMoney(input.settledAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Settlement amount must be greater than zero.");
      }

      const tenantItems = db.items.filter(
        (i) => i.tenantId === input.tenantId && !i.isDeleted,
      );
      const tenantLedger = db.ledger.filter((l) => l.tenantId === input.tenantId);
      const currentInvValue = computeInventoryAssetValue(tenantItems);
      const currentReceivable = computeRunningReceivableBalance(tenantLedger);

      if (amount > currentReceivable) {
        throw new Error(
          `Settlement amount (${amount}) exceeds running receivable balance (${currentReceivable}).`,
        );
      }

      const nowIso = new Date().toISOString();
      const nextReceivable = roundMoney(currentReceivable - amount);
      const weekLabel = input.weekLabel?.trim() || getCurrentWeekLabel();
      const recipientName = input.recipientName?.trim() || undefined;
      const ref = input.reference?.trim() || `STL-${Date.now().toString().slice(-5)}`;

      const settlement: WeeklySettlement = {
        id: newId("set"),
        tenantId: input.tenantId,
        weekLabel,
        recipientName,
        settledAmount: amount,
        receivableBefore: currentReceivable,
        receivableAfter: nextReceivable,
        settlementMethod: input.settlementMethod,
        reference: ref,
        notes: input.notes?.trim() || `Weekly settlement for ${weekLabel}`,
        createdByUserId: input.userId,
        createdAt: nowIso,
      };

      const ledgerEntry: LedgerEntry = {
        id: newId("led"),
        tenantId: input.tenantId,
        type: "WEEKLY_SETTLEMENT",
        partyName: recipientName,
        inventoryCostDelta: 0,
        receivableDelta: -amount,
        inventoryCostBalanceAfter: currentInvValue,
        receivableBalanceAfter: nextReceivable,
        reference: ref,
        notes: `${settlement.notes} (${input.settlementMethod.replace("_", " ")})`,
        createdByUserId: input.userId,
        createdAt: nowIso,
      };

      db.settlements.push(settlement);
      db.ledger.push(ledgerEntry);
      this.persist();

      return { settlement, ledgerEntry };
    });
  }

  async upsertSupplierBalance(input: UpsertSupplierBalanceInput): Promise<{
    supplier: SupplierAccount;
    ledgerEntry: LedgerEntry;
  }> {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      if (!Array.isArray(db.suppliers)) db.suppliers = [];

      const supplierName = input.supplierName.trim();
      if (!supplierName) throw new Error("Supplier name is required.");
      const supplierNameLower = supplierName.toLowerCase();

      const oldBalance = roundMoney(input.oldBalance);
      const currentBillAmount = roundMoney(input.currentBillAmount);
      if (!Number.isFinite(oldBalance) || oldBalance < 0) {
        throw new Error("Old balance must be a non-negative number.");
      }
      if (!Number.isFinite(currentBillAmount) || currentBillAmount < 0) {
        throw new Error("Current bill amount must be a non-negative number.");
      }

      const runningBalance = computeUpdatedSupplierBalance(oldBalance, currentBillAmount);
      const nowIso = new Date().toISOString();
      const billDate = input.billDate?.trim() || nowIso.slice(0, 10);

      let supplier = db.suppliers.find(
        (s) => s.tenantId === input.tenantId && s.supplierNameLower === supplierNameLower,
      );

      if (supplier) {
        supplier.supplierName = supplierName;
        supplier.oldBalance = oldBalance;
        supplier.lastBillAmount = currentBillAmount;
        supplier.runningBalance = runningBalance;
        supplier.billDate = billDate;
        supplier.notes = input.notes?.trim() || supplier.notes;
        supplier.updatedAt = nowIso;
      } else {
        supplier = {
          id: newId("sup"),
          tenantId: input.tenantId,
          supplierName,
          supplierNameLower,
          oldBalance,
          lastBillAmount: currentBillAmount,
          runningBalance,
          billDate,
          notes: input.notes?.trim() || undefined,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        db.suppliers.push(supplier);
      }

      const tenantItems = db.items.filter(
        (i) => i.tenantId === input.tenantId && !i.isDeleted,
      );
      const tenantLedger = db.ledger.filter((l) => l.tenantId === input.tenantId);
      const currentInvValue = computeInventoryAssetValue(tenantItems);
      const currentReceivable = computeRunningReceivableBalance(tenantLedger);

      const ledgerEntry: LedgerEntry = {
        id: newId("led"),
        tenantId: input.tenantId,
        type: "SUPPLIER_BALANCE",
        partyName: supplierName,
        inventoryCostDelta: 0,
        receivableDelta: 0,
        inventoryCostBalanceAfter: currentInvValue,
        receivableBalanceAfter: currentReceivable,
        reference: `SUP-${Date.now().toString().slice(-5)}`,
        notes:
          input.notes?.trim() ||
          `Supplier balance updated (Old: ${oldBalance} + Bill: ${currentBillAmount} = ${runningBalance})`,
        createdByUserId: input.userId,
        createdAt: nowIso,
      };
      db.ledger.push(ledgerEntry);
      this.persist();

      return { supplier: { ...supplier }, ledgerEntry };
    });
  }

  async commitScannedBill(input: CommitScannedBillInput): Promise<CommitScannedBillResult> {
    return this.withLock(() => {
      const db = this.loadIfNeeded();
      if (!Array.isArray(db.suppliers)) db.suppliers = [];
      if (!Array.isArray(input.items) || input.items.length === 0) {
        throw new Error("At least one bill item is required to commit to stock.");
      }

      const tenant = db.tenants.find((t) => t.id === input.tenantId);
      const supplierName = input.supplierName?.trim() || "";
      const billDate = input.billDate?.trim() || new Date().toISOString().slice(0, 10);
      const nowIso = new Date().toISOString();

      let runningInv = computeInventoryAssetValue(
        db.items.filter((i) => i.tenantId === input.tenantId && !i.isDeleted),
      );
      const currentReceivable = computeRunningReceivableBalance(
        db.ledger.filter((l) => l.tenantId === input.tenantId),
      );

      let addedCount = 0;
      let updatedCount = 0;
      let createdCategoriesCount = 0;
      let billTotal = 0;

      const existingSkus = new Set(
        db.items
          .filter((i) => i.tenantId === input.tenantId && !i.isDeleted)
          .map((i) => i.sku.toUpperCase()),
      );

      for (let idx = 0; idx < input.items.length; idx++) {
        const norm = normalizeScannedItem(input.items[idx], idx);
        const qty = norm.quantity;
        const unitCost = roundMoney(norm.unitCost);
        const lineTotal = roundMoney(qty * unitCost);
        billTotal = roundMoney(billTotal + lineTotal);

        const normSku = norm.skuOrModel.trim().toUpperCase();
        const normNameLower = norm.itemName.trim().toLowerCase();

        const existingItem = db.items.find(
          (i) =>
            i.tenantId === input.tenantId &&
            !i.isDeleted &&
            ((normSku && i.sku.toUpperCase() === normSku) ||
              i.name.trim().toLowerCase() === normNameLower),
        );

        if (existingItem) {
          const oldVal = roundMoney(existingItem.qtyOnHand * existingItem.unitCostPrice);
          const nextQty = existingItem.qtyOnHand + qty;
          const nextVal = roundMoney(nextQty * unitCost);
          const costDelta = roundMoney(nextVal - oldVal);

          existingItem.qtyOnHand = nextQty;
          existingItem.unitCostPrice = unitCost;
          if (supplierName) existingItem.supplierRef = supplierName;
          existingItem.updatedAt = nowIso;

          runningInv = roundMoney(runningInv + costDelta);
          db.ledger.push({
            id: newId("led"),
            tenantId: input.tenantId,
            type: "STOCK_IN",
            itemId: existingItem.id,
            itemSku: existingItem.sku,
            itemName: existingItem.name,
            itemBrand: existingItem.brand,
            partyName: supplierName || undefined,
            quantity: qty,
            unitCostPrice: unitCost,
            inventoryCostDelta: costDelta,
            receivableDelta: 0,
            inventoryCostBalanceAfter: runningInv,
            receivableBalanceAfter: currentReceivable,
            reference: `BILL-${existingItem.sku}`,
            notes: supplierName
              ? `Bill stock-in (+${qty} units) from ${supplierName}`
              : `Bill stock-in (+${qty} units @ ${unitCost})`,
            createdByUserId: input.userId,
            createdAt: nowIso,
          });
          updatedCount += 1;
        } else {
          const catSlug = slugifyCategory(norm.category) || "general";
          let cat = db.categories.find(
            (c) =>
              c.tenantId === input.tenantId &&
              (c.slug === catSlug ||
                c.name.trim().toLowerCase() === norm.category.trim().toLowerCase()),
          );
          if (!cat) {
            cat = {
              id: newId("cat"),
              tenantId: input.tenantId,
              name: norm.category.trim() || "General",
              slug: catSlug,
              description: `${norm.category.trim() || "General"} inventory category`,
              isDefault: false,
              createdAt: nowIso,
            };
            db.categories.push(cat);
            createdCategoriesCount += 1;
          }

          const finalSku =
            !normSku || normSku.endsWith("-") || existingSkus.has(normSku)
              ? generateUniqueSku(normSku || tenant?.skuPrefix || "SKU", existingSkus)
              : normSku;
          existingSkus.add(finalSku);

          const newItem: InventoryItem = {
            id: newId("itm"),
            tenantId: input.tenantId,
            categoryId: cat.id,
            sku: finalSku,
            name: norm.itemName,
            brand: "",
            unitCostPrice: unitCost,
            targetSalePrice: null,
            qtyOnHand: qty,
            reorderLevel: 2,
            supplierRef: supplierName || "BILL-SCAN",
            isDeleted: false,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          db.items.push(newItem);

          const costDelta = roundMoney(qty * unitCost);
          runningInv = roundMoney(runningInv + costDelta);
          db.ledger.push({
            id: newId("led"),
            tenantId: input.tenantId,
            type: "STOCK_IN",
            itemId: newItem.id,
            itemSku: newItem.sku,
            itemName: newItem.name,
            itemBrand: newItem.brand,
            partyName: supplierName || undefined,
            quantity: qty,
            unitCostPrice: unitCost,
            inventoryCostDelta: costDelta,
            receivableDelta: 0,
            inventoryCostBalanceAfter: runningInv,
            receivableBalanceAfter: currentReceivable,
            reference: `BILL-${newItem.sku}`,
            notes: supplierName
              ? `New SKU from bill (${qty} units) · ${supplierName}`
              : `New SKU from bill (${qty} units)`,
            createdByUserId: input.userId,
            createdAt: nowIso,
          });
          addedCount += 1;
        }
      }

      let supplier: SupplierAccount | null = null;
      if (supplierName) {
        const lower = supplierName.toLowerCase();
        const existingSup = db.suppliers.find(
          (s) => s.tenantId === input.tenantId && s.supplierNameLower === lower,
        );
        const oldBalance =
          input.oldBalance !== undefined && Number.isFinite(input.oldBalance)
            ? roundMoney(input.oldBalance)
            : existingSup
              ? existingSup.runningBalance
              : 0;
        const runningBalance = computeUpdatedSupplierBalance(oldBalance, billTotal);

        if (existingSup) {
          existingSup.supplierName = supplierName;
          existingSup.oldBalance = oldBalance;
          existingSup.lastBillAmount = billTotal;
          existingSup.runningBalance = runningBalance;
          existingSup.billDate = billDate;
          existingSup.updatedAt = nowIso;
          supplier = { ...existingSup };
        } else {
          supplier = {
            id: newId("sup"),
            tenantId: input.tenantId,
            supplierName,
            supplierNameLower: lower,
            oldBalance,
            lastBillAmount: billTotal,
            runningBalance,
            billDate,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          db.suppliers.push(supplier);
        }

        db.ledger.push({
          id: newId("led"),
          tenantId: input.tenantId,
          type: "SUPPLIER_BALANCE",
          partyName: supplierName,
          inventoryCostDelta: 0,
          receivableDelta: 0,
          inventoryCostBalanceAfter: runningInv,
          receivableBalanceAfter: currentReceivable,
          reference: `BILL-${Date.now().toString().slice(-5)}`,
          notes: `Bill posted for ${supplierName} (Old: ${oldBalance} + Bill: ${billTotal} = Updated: ${runningBalance})`,
          createdByUserId: input.userId,
          createdAt: nowIso,
        });
      }

      this.persist();
      return {
        addedCount,
        updatedCount,
        createdCategoriesCount,
        billTotal,
        supplier,
      };
    });
  }
}
