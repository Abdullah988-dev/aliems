import crypto from "crypto";
import { MongoClient, type Db } from "mongodb";
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
import { buildDemoSeedDataset } from "@/lib/db/seed";
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

function normalizeMongoItem(raw: InventoryItem & { defaultSalePrice?: number | null }): InventoryItem {
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

declare global {
  var __aliemsMongoClientPromise: Promise<MongoClient> | undefined;
  var __aliemsMongoClientUri: string | undefined;
  var __aliemsMongoIndexesEnsured: boolean | undefined;
}

function formatMongoConnectionError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (
    lower.includes("authentication failed") ||
    lower.includes("bad auth") ||
    lower.includes("auth failed") ||
    lower.includes("code 8000")
  ) {
    return "MongoDB Atlas authentication failed. Verify the username and password in MONGODB_URI.";
  }

  if (
    lower.includes("serverselectionerror") ||
    lower.includes("etimedout") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("querysrv") ||
    lower.includes("whitelist") ||
    lower.includes("replicasetnoprimary") ||
    lower.includes("ssl") ||
    lower.includes("tls")
  ) {
    return "Unable to reach MongoDB Atlas. Check your internet connection, cluster URI, and MongoDB Atlas Network Access (IP Access List).";
  }

  return `MongoDB connection error: ${raw}`;
}

export class MongoAdapter implements DatabaseAdapter {
  readonly mode = "mongodb" as const;

  private uri: string;
  private dbName: string;

  constructor(uri: string, dbName = "aliems") {
    this.uri = uri;
    this.dbName = dbName;
  }

  private async getDb(): Promise<Db> {
    if (
      !globalThis.__aliemsMongoClientPromise ||
      globalThis.__aliemsMongoClientUri !== this.uri
    ) {
      globalThis.__aliemsMongoIndexesEnsured = false;
      const client = new MongoClient(this.uri, {
        maxPoolSize: 10,
        minPoolSize: 1,
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
      });

      globalThis.__aliemsMongoClientUri = this.uri;
      globalThis.__aliemsMongoClientPromise = client
        .connect()
        .then(async (connectedClient) => {
          await connectedClient.db(this.dbName).command({ ping: 1 });
          console.info(
            `[AliEMS DB] Connected to MongoDB Atlas (database: "${this.dbName}")`,
          );
          return connectedClient;
        })
        .catch((err) => {
          globalThis.__aliemsMongoClientPromise = undefined;
          globalThis.__aliemsMongoClientUri = undefined;
          globalThis.__aliemsMongoIndexesEnsured = false;
          const friendly = formatMongoConnectionError(err);
          console.error(`[AliEMS DB] ${friendly}`);
          throw new Error(friendly);
        });
    }

    const client = await globalThis.__aliemsMongoClientPromise;
    const db = client.db(this.dbName);

    if (!globalThis.__aliemsMongoIndexesEnsured) {
      await Promise.all([
        db.collection("users").createIndex({ email: 1 }, { unique: true }),
        db.collection("users").createIndex({ tenantId: 1, id: 1 }, { unique: true }),
        db.collection("tenants").createIndex({ id: 1 }, { unique: true }),
        db.collection("categories").createIndex({ tenantId: 1, slug: 1 }, { unique: true }),
        db.collection("items").createIndex({ tenantId: 1, id: 1 }, { unique: true }),
        db.collection("suppliers").createIndex(
          { tenantId: 1, supplierNameLower: 1 },
          { unique: true },
        ),
        db.collection("ledger").createIndex({ tenantId: 1, createdAt: -1 }),
        db.collection("settlements").createIndex({ tenantId: 1, createdAt: -1 }),
      ]);

      try {
        await db.collection("items").dropIndex("tenantId_1_sku_1");
      } catch {
        // Index may not exist or already be partial
      }
      await db
        .collection("items")
        .updateMany(
          { isDeleted: { $exists: false } },
          { $set: { isDeleted: false } },
        );
      await db.collection("items").createIndex(
        { tenantId: 1, sku: 1 },
        {
          unique: true,
          partialFilterExpression: { isDeleted: false },
        },
      );

      globalThis.__aliemsMongoIndexesEnsured = true;
      console.info("[AliEMS DB] MongoDB indexes verified.");
    }

    return db;
  }

  async ensureSeeded(): Promise<void> {
    const db = await this.getDb();
    const count = await db.collection("tenants").countDocuments();
    if (count > 0) return;

    const seed = buildDemoSeedDataset();
    if (seed.tenants.length) await db.collection("tenants").insertMany(seed.tenants);
    if (seed.users.length) await db.collection("users").insertMany(seed.users);
    if (seed.categories.length) await db.collection("categories").insertMany(seed.categories);
    if (seed.items.length) await db.collection("items").insertMany(seed.items);
    if (seed.ledger.length) await db.collection("ledger").insertMany(seed.ledger);
    if (seed.settlements.length) await db.collection("settlements").insertMany(seed.settlements);
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const db = await this.getDb();
    const doc = await db
      .collection<User>("users")
      .findOne({ email: email.trim().toLowerCase() }, { projection: { _id: 0 } });
    return doc ?? null;
  }

  async findUserById(tenantId: string, userId: string): Promise<User | null> {
    const db = await this.getDb();
    const doc = await db
      .collection<User>("users")
      .findOne({ tenantId, id: userId }, { projection: { _id: 0 } });
    return doc ?? null;
  }

  async findTenantById(tenantId: string): Promise<Tenant | null> {
    const db = await this.getDb();
    const doc = await db
      .collection<Tenant>("tenants")
      .findOne({ id: tenantId }, { projection: { _id: 0 } });
    return doc ?? null;
  }

  async listDemoTenants() {
    const db = await this.getDb();
    const tenants = await db
      .collection<Tenant>("tenants")
      .find({ id: { $regex: /^tenant_/ } }, { projection: { _id: 0 } })
      .toArray();
    const out = [];
    for (const t of tenants) {
      const owner = await db
        .collection<User>("users")
        .findOne({ tenantId: t.id, role: "owner" }, { projection: { _id: 0 } });
      if (owner) {
        out.push({
          tenantId: t.id,
          businessName: t.businessName,
          businessType: t.businessType,
          email: owner.email,
        });
      }
    }
    return out;
  }

  async registerTenant(input: RegisterTenantInput): Promise<{ tenant: Tenant; user: User }> {
    const db = await this.getDb();
    const normEmail = input.email.trim().toLowerCase();
    const existing = await db.collection<User>("users").findOne({ email: normEmail });
    if (existing) {
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

    const rawCustomCats = (input.customCategories || []).map((c) => c.trim()).filter(Boolean);
    const categorySeeds =
      rawCustomCats.length > 0
        ? rawCustomCats.map((name) => ({ name, description: `${name} inventory category` }))
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
          createdCategories.find((c) => c.name === s.categoryName) ?? createdCategories[0];
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
          isDeleted: false,
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

    await db.collection("tenants").insertOne({ ...tenant });
    await db.collection("users").insertOne({ ...user });
    if (createdCategories.length) {
      await db.collection("categories").insertMany(createdCategories.map((c) => ({ ...c })));
    }
    if (createdItems.length) {
      await db.collection("items").insertMany(createdItems.map((i) => ({ ...i })));
    }
    if (createdLedger.length) {
      await db.collection("ledger").insertMany(createdLedger.map((l) => ({ ...l })));
    }

    return { tenant, user };
  }

  async updateTenantProfile(input: UpdateTenantProfileInput): Promise<Tenant> {
    const db = await this.getDb();
    const tenant = await this.findTenantById(input.tenantId);
    if (!tenant) {
      throw new Error("Tenant workspace not found.");
    }

    const patch: Partial<Tenant> = {};
    if (input.businessName?.trim()) patch.businessName = input.businessName.trim();
    if (input.businessType) {
      patch.businessType = input.businessType;
      patch.skuPrefix = BUSINESS_PRESETS[input.businessType].skuPrefix;
    }
    if (input.customBusinessLabel !== undefined) {
      patch.customBusinessLabel = input.customBusinessLabel.trim() || undefined;
    }
    if (input.currency?.trim()) {
      patch.currency = input.currency.trim().toUpperCase();
    }

    if (Object.keys(patch).length > 0) {
      await db.collection("tenants").updateOne({ id: input.tenantId }, { $set: patch });
    }

    if (input.provisionPresetCategories && input.businessType) {
      const preset = BUSINESS_PRESETS[input.businessType];
      const existing = await db
        .collection<Category>("categories")
        .find({ tenantId: input.tenantId }, { projection: { slug: 1 } })
        .toArray();
      const existingSlugs = new Set(existing.map((c) => c.slug));
      const nowIso = new Date().toISOString();
      const toInsert: Category[] = [];
      for (const cat of preset.categories) {
        const slug = slugifyCategory(cat.name);
        if (!existingSlugs.has(slug)) {
          toInsert.push({
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
      if (toInsert.length > 0) {
        await db.collection("categories").insertMany(toInsert);
      }
    }

    return (await this.findTenantById(input.tenantId))!;
  }

  async getTenantOverview(tenantId: string, userId: string): Promise<TenantOverview | null> {
    const db = await this.getDb();
    const [tenant, user, categories, rawItems, suppliers, ledger, settlements] = await Promise.all([
      this.findTenantById(tenantId),
      this.findUserById(tenantId, userId),
      db
        .collection<Category>("categories")
        .find({ tenantId }, { projection: { _id: 0 } })
        .sort({ name: 1 })
        .toArray(),
      db
        .collection<InventoryItem>("items")
        .find({ tenantId, isDeleted: { $ne: true } }, { projection: { _id: 0 } })
        .sort({ name: 1 })
        .toArray(),
      db
        .collection<SupplierAccount>("suppliers")
        .find({ tenantId }, { projection: { _id: 0 } })
        .sort({ updatedAt: -1 })
        .toArray(),
      db
        .collection<LedgerEntry>("ledger")
        .find({ tenantId }, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .toArray(),
      db
        .collection<WeeklySettlement>("settlements")
        .find({ tenantId }, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .toArray(),
    ]);

    if (!tenant || !user) return null;

    const items = rawItems.map(normalizeMongoItem);
    const metrics = computeWeeklyMetrics({ items, ledger, settlements, suppliers });
    const { passwordHash: _ignored, ...safeUser } = user;
    void _ignored;

    return {
      tenant,
      user: safeUser,
      storageMode: this.mode,
      metrics,
      categories,
      items,
      suppliers,
      ledger,
      settlements,
    };
  }

  async createCategory(input: CreateCategoryInput): Promise<Category> {
    const db = await this.getDb();
    const name = input.name.trim();
    if (!name) throw new Error("Category name is required.");
    const slug = slugifyCategory(name) || newId("cat");
    const dup = await db
      .collection<Category>("categories")
      .findOne({ tenantId: input.tenantId, slug });
    if (dup) {
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
    await db.collection("categories").insertOne({ ...category });
    return category;
  }

  async deleteCategory(tenantId: string, categoryId: string): Promise<void> {
    const db = await this.getDb();
    const used = await db
      .collection("items")
      .countDocuments({ tenantId, categoryId, isDeleted: { $ne: true } });
    if (used > 0) {
      throw new Error("Cannot delete a category that still contains active inventory items.");
    }
    const res = await db
      .collection("categories")
      .deleteOne({ tenantId, id: categoryId });
    if (res.deletedCount === 0) {
      throw new Error("Category not found in this workspace.");
    }
  }

  private async getTenantBalances(db: Db, tenantId: string) {
    const [rawItems, ledger] = await Promise.all([
      db
        .collection<InventoryItem>("items")
        .find({ tenantId, isDeleted: { $ne: true } }, { projection: { _id: 0 } })
        .toArray(),
      db
        .collection<LedgerEntry>("ledger")
        .find({ tenantId }, { projection: { _id: 0 } })
        .toArray(),
    ]);
    const items = rawItems.map(normalizeMongoItem);
    return {
      inventoryAssetValue: computeInventoryAssetValue(items),
      runningReceivableBalance: computeRunningReceivableBalance(ledger),
    };
  }

  async createInventoryItem(input: CreateItemInput): Promise<{
    item: InventoryItem;
    ledgerEntry: LedgerEntry | null;
  }> {
    const db = await this.getDb();
    const cat = await db
      .collection<Category>("categories")
      .findOne({ tenantId: input.tenantId, id: input.categoryId });
    if (!cat) {
      throw new Error("Selected category does not belong to this workspace.");
    }

    const [tenant, existingActive] = await Promise.all([
      this.findTenantById(input.tenantId),
      db
        .collection<InventoryItem>("items")
        .find({ tenantId: input.tenantId, isDeleted: { $ne: true } }, { projection: { sku: 1 } })
        .toArray(),
    ]);
    const existingSkus = new Set(existingActive.map((i) => i.sku.toUpperCase()));

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

    const { inventoryAssetValue, runningReceivableBalance } =
      await this.getTenantBalances(db, input.tenantId);

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
      isDeleted: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await db.collection("items").insertOne({ ...item });

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
        inventoryCostBalanceAfter: roundMoney(inventoryAssetValue + costDelta),
        receivableBalanceAfter: runningReceivableBalance,
        reference: `INIT-${item.sku}`,
        notes: `New SKU added (${item.qtyOnHand} units @ cost)`,
        createdByUserId: input.userId,
        createdAt: nowIso,
      };
      await db.collection("ledger").insertOne({ ...ledgerEntry });
    }

    return { item, ledgerEntry };
  }

  async updateInventoryItem(input: UpdateItemInput): Promise<{
    item: InventoryItem;
    ledgerEntry: LedgerEntry | null;
  }> {
    const db = await this.getDb();
    const existingRaw = await db
      .collection<InventoryItem>("items")
      .findOne(
        { tenantId: input.tenantId, id: input.itemId, isDeleted: { $ne: true } },
        { projection: { _id: 0 } },
      );
    if (!existingRaw) {
      throw new Error("Inventory item not found in this workspace.");
    }
    const item = normalizeMongoItem(existingRaw);

    if (input.categoryId !== undefined) {
      const cat = await db
        .collection<Category>("categories")
        .findOne({ tenantId: input.tenantId, id: input.categoryId });
      if (!cat) {
        throw new Error("Selected category does not belong to this workspace.");
      }
      item.categoryId = input.categoryId;
    }

    if (input.sku !== undefined) {
      const nextSku = input.sku.trim().toUpperCase();
      if (!nextSku) throw new Error("SKU cannot be empty.");
      const dup = await db.collection<InventoryItem>("items").findOne({
        tenantId: input.tenantId,
        id: { $ne: item.id },
        sku: nextSku,
        isDeleted: { $ne: true },
      });
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
      const { inventoryAssetValue, runningReceivableBalance } =
        await this.getTenantBalances(db, input.tenantId);

      const costDelta = roundMoney(nextQty * nextCost - oldQty * oldCost);
      item.unitCostPrice = nextCost;
      item.qtyOnHand = nextQty;

      if (costDelta !== 0 || nextQty !== oldQty) {
        const notesParts: string[] = [];
        if (nextQty !== oldQty) notesParts.push(`Qty ${oldQty} -> ${nextQty}`);
        if (nextCost !== oldCost) notesParts.push(`Cost ${oldCost} -> ${nextCost}`);

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
          inventoryCostBalanceAfter: roundMoney(inventoryAssetValue + costDelta),
          receivableBalanceAfter: runningReceivableBalance,
          reference: `UPD-${item.sku}`,
          notes: `SKU updated (${notesParts.join(" · ")})`,
          createdByUserId: input.userId,
          createdAt: nowIso,
        };
        await db.collection("ledger").insertOne({ ...ledgerEntry });
      }
    }

    item.updatedAt = nowIso;
    await db.collection("items").updateOne(
      { tenantId: input.tenantId, id: item.id, isDeleted: { $ne: true } },
      {
        $set: {
          categoryId: item.categoryId,
          sku: item.sku,
          name: item.name,
          brand: item.brand,
          unitCostPrice: item.unitCostPrice,
          targetSalePrice: item.targetSalePrice ?? null,
          qtyOnHand: item.qtyOnHand,
          reorderLevel: item.reorderLevel,
          supplierRef: item.supplierRef,
          updatedAt: nowIso,
        },
      },
    );

    return { item, ledgerEntry };
  }

  async deleteInventoryItem(
    tenantId: string,
    userId: string,
    itemId: string,
  ): Promise<{ mode: "soft" | "hard" }> {
    const db = await this.getDb();
    const existingRaw = await db
      .collection<InventoryItem>("items")
      .findOne(
        { tenantId, id: itemId, isDeleted: { $ne: true } },
        { projection: { _id: 0 } },
      );
    if (!existingRaw) {
      throw new Error("Inventory item not found in this workspace.");
    }
    const item = normalizeMongoItem(existingRaw);

    const ledgerCount = await db
      .collection("ledger")
      .countDocuments({ tenantId, itemId });

    if (ledgerCount === 0 && item.qtyOnHand === 0) {
      await db.collection("items").deleteOne({ tenantId, id: itemId });
      return { mode: "hard" };
    }

    const nowIso = new Date().toISOString();
    if (item.qtyOnHand > 0) {
      const { inventoryAssetValue, runningReceivableBalance } =
        await this.getTenantBalances(db, tenantId);
      const costWriteOff = -roundMoney(item.qtyOnHand * item.unitCostPrice);

      const ledgerEntry: LedgerEntry = {
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
        inventoryCostBalanceAfter: roundMoney(inventoryAssetValue + costWriteOff),
        receivableBalanceAfter: runningReceivableBalance,
        reference: `DEL-${item.sku}`,
        notes: `SKU archived (${item.qtyOnHand} units written off at cost; history preserved)`,
        createdByUserId: userId,
        createdAt: nowIso,
      };
      await db.collection("ledger").insertOne({ ...ledgerEntry });
    }

    await db.collection("items").updateOne(
      { tenantId, id: itemId },
      {
        $set: {
          qtyOnHand: 0,
          isDeleted: true,
          deletedAt: nowIso,
          updatedAt: nowIso,
        },
      },
    );

    return { mode: "soft" };
  }

  async restockInventoryItem(input: RestockItemInput): Promise<{
    item: InventoryItem;
    ledgerEntry: LedgerEntry;
  }> {
    const db = await this.getDb();
    const raw = await db
      .collection<InventoryItem>("items")
      .findOne(
        { tenantId: input.tenantId, id: input.itemId, isDeleted: { $ne: true } },
        { projection: { _id: 0 } },
      );
    if (!raw) {
      throw new Error("Inventory item not found in this workspace.");
    }
    const item = normalizeMongoItem(raw);

    const { inventoryAssetValue, runningReceivableBalance } =
      await this.getTenantBalances(db, input.tenantId);

    const calc = computeRestockValues({
      item,
      addedQty: input.addedQty,
      unitCostPrice: input.unitCostPrice,
      currentInventoryAssetValue: inventoryAssetValue,
    });

    const nowIso = new Date().toISOString();
    const updatedItem: InventoryItem = {
      ...item,
      qtyOnHand: calc.newQtyOnHand,
      unitCostPrice: calc.newUnitCostPrice,
      updatedAt: nowIso,
    };

    await db.collection("items").updateOne(
      { tenantId: input.tenantId, id: input.itemId, isDeleted: { $ne: true } },
      {
        $set: {
          qtyOnHand: updatedItem.qtyOnHand,
          unitCostPrice: updatedItem.unitCostPrice,
          updatedAt: nowIso,
        },
      },
    );

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
      receivableBalanceAfter: runningReceivableBalance,
      reference: input.reference?.trim() || `RST-${Date.now().toString().slice(-5)}`,
      notes: input.notes?.trim() || `Restocked ${input.addedQty} units`,
      createdByUserId: input.userId,
      createdAt: nowIso,
    };

    await db.collection("ledger").insertOne({ ...ledgerEntry });
    return { item: updatedItem, ledgerEntry };
  }

  async adjustInventoryStock(input: AdjustStockInput): Promise<{
    item: InventoryItem;
    ledgerEntry: LedgerEntry;
  }> {
    const db = await this.getDb();
    const raw = await db
      .collection<InventoryItem>("items")
      .findOne(
        { tenantId: input.tenantId, id: input.itemId, isDeleted: { $ne: true } },
        { projection: { _id: 0 } },
      );
    if (!raw) {
      throw new Error("Inventory item not found in this workspace.");
    }
    const item = normalizeMongoItem(raw);

    if (!Number.isInteger(input.qtyDelta) || input.qtyDelta === 0) {
      throw new Error("Adjustment quantity must be a non-zero integer.");
    }
    const nextQty = item.qtyOnHand + input.qtyDelta;
    if (nextQty < 0) {
      throw new Error("Stock adjustment cannot reduce quantity below zero.");
    }

    const { inventoryAssetValue, runningReceivableBalance } =
      await this.getTenantBalances(db, input.tenantId);

    const costDelta = roundMoney(input.qtyDelta * item.unitCostPrice);
    const nowIso = new Date().toISOString();
    const updatedItem: InventoryItem = {
      ...item,
      qtyOnHand: nextQty,
      updatedAt: nowIso,
    };

    await db.collection("items").updateOne(
      { tenantId: input.tenantId, id: input.itemId, isDeleted: { $ne: true } },
      { $set: { qtyOnHand: nextQty, updatedAt: nowIso } },
    );

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
      inventoryCostBalanceAfter: roundMoney(inventoryAssetValue + costDelta),
      receivableBalanceAfter: runningReceivableBalance,
      reference: input.reference?.trim() || `ADJ-${Date.now().toString().slice(-5)}`,
      notes: input.notes.trim() || "Manual inventory audit adjustment",
      createdByUserId: input.userId,
      createdAt: nowIso,
    };

    await db.collection("ledger").insertOne({ ...ledgerEntry });
    return { item: updatedItem, ledgerEntry };
  }

  async recordSaleDispatch(input: RecordSaleInput): Promise<{
    item: InventoryItem;
    ledgerEntry: LedgerEntry;
  }> {
    const db = await this.getDb();
    const raw = await db
      .collection<InventoryItem>("items")
      .findOne(
        { tenantId: input.tenantId, id: input.itemId, isDeleted: { $ne: true } },
        { projection: { _id: 0 } },
      );
    if (!raw) {
      throw new Error("Inventory item not found in this workspace.");
    }
    const item = normalizeMongoItem(raw);

    const { inventoryAssetValue, runningReceivableBalance } =
      await this.getTenantBalances(db, input.tenantId);

    const calc = computeSaleDispatch({
      item,
      quantity: input.quantity,
      unitSalePrice: input.unitSalePrice,
      currentInventoryAssetValue: inventoryAssetValue,
      currentRunningReceivableBalance: runningReceivableBalance,
    });

    const nowIso = new Date().toISOString();
    const updatedItem: InventoryItem = {
      ...item,
      qtyOnHand: calc.newQtyOnHand,
      updatedAt: nowIso,
    };

    const updateRes = await db.collection("items").updateOne(
      {
        tenantId: input.tenantId,
        id: input.itemId,
        isDeleted: { $ne: true },
        qtyOnHand: { $gte: input.quantity },
      },
      { $set: { qtyOnHand: calc.newQtyOnHand, updatedAt: nowIso } },
    );

    if (updateRes.modifiedCount === 0) {
      throw new Error("Stock level changed concurrently; please retry dispatch.");
    }

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

    await db.collection("ledger").insertOne({ ...ledgerEntry });
    return { item: updatedItem, ledgerEntry };
  }

  async recordWeeklySettlement(input: RecordSettlementInput): Promise<{
    settlement: WeeklySettlement;
    ledgerEntry: LedgerEntry;
  }> {
    const db = await this.getDb();
    const amount = roundMoney(input.settledAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Settlement amount must be greater than zero.");
    }

    const { inventoryAssetValue, runningReceivableBalance } =
      await this.getTenantBalances(db, input.tenantId);

    if (amount > runningReceivableBalance) {
      throw new Error(
        `Settlement amount (${amount}) exceeds running receivable balance (${runningReceivableBalance}).`,
      );
    }

    const nowIso = new Date().toISOString();
    const nextReceivable = roundMoney(runningReceivableBalance - amount);
    const weekLabel = input.weekLabel?.trim() || getCurrentWeekLabel();
    const recipientName = input.recipientName?.trim() || undefined;
    const ref = input.reference?.trim() || `STL-${Date.now().toString().slice(-5)}`;

    const settlement: WeeklySettlement = {
      id: newId("set"),
      tenantId: input.tenantId,
      weekLabel,
      recipientName,
      settledAmount: amount,
      receivableBefore: runningReceivableBalance,
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
      inventoryCostBalanceAfter: inventoryAssetValue,
      receivableBalanceAfter: nextReceivable,
      reference: ref,
      notes: `${settlement.notes} (${input.settlementMethod.replace("_", " ")})`,
      createdByUserId: input.userId,
      createdAt: nowIso,
    };

    await db.collection("settlements").insertOne({ ...settlement });
    await db.collection("ledger").insertOne({ ...ledgerEntry });

    return { settlement, ledgerEntry };
  }

  async upsertSupplierBalance(input: UpsertSupplierBalanceInput): Promise<{
    supplier: SupplierAccount;
    ledgerEntry: LedgerEntry;
  }> {
    const db = await this.getDb();
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

    const existing = await db
      .collection<SupplierAccount>("suppliers")
      .findOne(
        { tenantId: input.tenantId, supplierNameLower },
        { projection: { _id: 0 } },
      );

    let supplier: SupplierAccount;
    if (existing) {
      supplier = {
        ...existing,
        supplierName,
        oldBalance,
        lastBillAmount: currentBillAmount,
        runningBalance,
        billDate,
        notes: input.notes?.trim() || existing.notes,
        updatedAt: nowIso,
      };
      await db.collection("suppliers").updateOne(
        { tenantId: input.tenantId, supplierNameLower },
        {
          $set: {
            supplierName,
            oldBalance,
            lastBillAmount: currentBillAmount,
            runningBalance,
            billDate,
            notes: supplier.notes,
            updatedAt: nowIso,
          },
        },
      );
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
      await db.collection("suppliers").insertOne({ ...supplier });
    }

    const { inventoryAssetValue, runningReceivableBalance } =
      await this.getTenantBalances(db, input.tenantId);

    const ledgerEntry: LedgerEntry = {
      id: newId("led"),
      tenantId: input.tenantId,
      type: "SUPPLIER_BALANCE",
      partyName: supplierName,
      inventoryCostDelta: 0,
      receivableDelta: 0,
      inventoryCostBalanceAfter: inventoryAssetValue,
      receivableBalanceAfter: runningReceivableBalance,
      reference: `SUP-${Date.now().toString().slice(-5)}`,
      notes:
        input.notes?.trim() ||
        `Supplier balance updated (Old: ${oldBalance} + Bill: ${currentBillAmount} = ${runningBalance})`,
      createdByUserId: input.userId,
      createdAt: nowIso,
    };

    await db.collection("ledger").insertOne({ ...ledgerEntry });
    return { supplier, ledgerEntry };
  }

  async commitScannedBill(input: CommitScannedBillInput): Promise<CommitScannedBillResult> {
    const db = await this.getDb();
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error("At least one bill item is required to commit to stock.");
    }

    const [tenant, rawCategories, rawItems, balances] = await Promise.all([
      this.findTenantById(input.tenantId),
      db
        .collection<Category>("categories")
        .find({ tenantId: input.tenantId }, { projection: { _id: 0 } })
        .toArray(),
      db
        .collection<InventoryItem>("items")
        .find({ tenantId: input.tenantId, isDeleted: { $ne: true } }, { projection: { _id: 0 } })
        .toArray(),
      this.getTenantBalances(db, input.tenantId),
    ]);

    const categories: Category[] = rawCategories.map((c) => ({ ...c }));
    const activeItems = rawItems.map(normalizeMongoItem);
    const supplierName = input.supplierName?.trim() || "";
    const billDate = input.billDate?.trim() || new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();

    let runningInv = balances.inventoryAssetValue;
    const currentReceivable = balances.runningReceivableBalance;

    let addedCount = 0;
    let updatedCount = 0;
    let createdCategoriesCount = 0;
    let billTotal = 0;

    const existingSkus = new Set(activeItems.map((i) => i.sku.toUpperCase()));
    const ledgerToInsert: LedgerEntry[] = [];

    for (let idx = 0; idx < input.items.length; idx++) {
      const norm = normalizeScannedItem(input.items[idx], idx);
      const qty = norm.quantity;
      const unitCost = roundMoney(norm.unitCost);
      const lineTotal = roundMoney(qty * unitCost);
      billTotal = roundMoney(billTotal + lineTotal);

      const normSku = norm.skuOrModel.trim().toUpperCase();
      const normNameLower = norm.itemName.trim().toLowerCase();

      const existingItem = activeItems.find(
        (i) =>
          (normSku && i.sku.toUpperCase() === normSku) ||
          i.name.trim().toLowerCase() === normNameLower,
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

        await db.collection("items").updateOne(
          { tenantId: input.tenantId, id: existingItem.id, isDeleted: { $ne: true } },
          {
            $set: {
              qtyOnHand: nextQty,
              unitCostPrice: unitCost,
              supplierRef: existingItem.supplierRef,
              updatedAt: nowIso,
            },
          },
        );

        runningInv = roundMoney(runningInv + costDelta);
        ledgerToInsert.push({
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
        let cat = categories.find(
          (c) =>
            c.slug === catSlug ||
            c.name.trim().toLowerCase() === norm.category.trim().toLowerCase(),
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
          await db.collection("categories").insertOne({ ...cat });
          categories.push(cat);
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
        await db.collection("items").insertOne({ ...newItem });
        activeItems.push(newItem);

        const costDelta = roundMoney(qty * unitCost);
        runningInv = roundMoney(runningInv + costDelta);
        ledgerToInsert.push({
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
      const existingSup = await db
        .collection<SupplierAccount>("suppliers")
        .findOne(
          { tenantId: input.tenantId, supplierNameLower: lower },
          { projection: { _id: 0 } },
        );

      const oldBalance =
        input.oldBalance !== undefined && Number.isFinite(input.oldBalance)
          ? roundMoney(input.oldBalance)
          : existingSup
            ? existingSup.runningBalance
            : 0;
      const runningBalance = computeUpdatedSupplierBalance(oldBalance, billTotal);

      if (existingSup) {
        supplier = {
          ...existingSup,
          supplierName,
          oldBalance,
          lastBillAmount: billTotal,
          runningBalance,
          billDate,
          updatedAt: nowIso,
        };
        await db.collection("suppliers").updateOne(
          { tenantId: input.tenantId, supplierNameLower: lower },
          {
            $set: {
              supplierName,
              oldBalance,
              lastBillAmount: billTotal,
              runningBalance,
              billDate,
              updatedAt: nowIso,
            },
          },
        );
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
        await db.collection("suppliers").insertOne({ ...supplier });
      }

      ledgerToInsert.push({
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

    if (ledgerToInsert.length > 0) {
      await db.collection("ledger").insertMany(ledgerToInsert.map((l) => ({ ...l })));
    }

    return {
      addedCount,
      updatedCount,
      createdCategoriesCount,
      billTotal,
      supplier,
    };
  }
}
