import { describe, expect, it } from "vitest";
import { parseOptionalPrice } from "@/lib/accounting";
import { hashPassword, signSessionToken, verifyPassword, verifySessionToken } from "@/lib/auth";
import { buildSampleScannedBill, computeUpdatedSupplierBalance } from "@/lib/bill-helpers";
import { MemoryJsonAdapter } from "@/lib/db/memory-json-adapter";

describe("AliEMS Multi-Tenant Isolation, Onboarding, CRUD & Accounting", () => {
  it("provisions dynamic categories based on business type and isolates tenant partitions", async () => {
    const db = new MemoryJsonAdapter();
    await db.ensureSeeded();

    const regA = await db.registerTenant({
      businessName: "Prime Cool Appliances",
      businessType: "appliances",
      currency: "PKR",
      fullName: "Ahmed Khan",
      email: "ahmed@primecool.test",
      passwordHash: hashPassword("secret123"),
      includeStarterStock: false,
    });

    const regB = await db.registerTenant({
      businessName: "Volt Solar & Tools",
      businessType: "custom",
      customBusinessLabel: "Solar & Hardware",
      customCategories: ["Solar Inverters", "DC Breakers"],
      currency: "PKR",
      fullName: "Zainab Ali",
      email: "zainab@voltsolar.test",
      passwordHash: hashPassword("secret456"),
      includeStarterStock: false,
    });

    const overviewA = await db.getTenantOverview(regA.tenant.id, regA.user.id);
    const overviewB = await db.getTenantOverview(regB.tenant.id, regB.user.id);

    expect(overviewA).not.toBeNull();
    expect(overviewB).not.toBeNull();

    const catNamesA = overviewA!.categories.map((c) => c.name);
    expect(catNamesA).toContain("Washing Machines");
    expect(catNamesA).toContain("Fans & Air Cooling");

    const catNamesB = overviewB!.categories.map((c) => c.name);
    expect(catNamesB).toEqual(["DC Breakers", "Solar Inverters"]);

    const washerCat = overviewA!.categories.find((c) => c.name === "Washing Machines")!;
    const createdA = await db.createInventoryItem({
      tenantId: regA.tenant.id,
      userId: regA.user.id,
      categoryId: washerCat.id,
      sku: "APP-WM-900",
      name: "Heavy Twin Tub 12kg",
      brand: "Dawlance",
      unitCostPrice: 30000,
      targetSalePrice: null,
      qtyOnHand: 5,
      reorderLevel: 2,
    });

    expect(createdA.item.targetSalePrice).toBeNull();
    expect(createdA.ledgerEntry?.itemBrand).toBe("Dawlance");

    // Cross-tenant isolation: Tenant B cannot sell, restock, edit, or delete Tenant A's item
    await expect(
      db.recordSaleDispatch({
        tenantId: regB.tenant.id,
        userId: regB.user.id,
        itemId: createdA.item.id,
        quantity: 1,
        unitSalePrice: 36500,
      }),
    ).rejects.toThrow(/not found/i);

    await expect(
      db.updateInventoryItem({
        tenantId: regB.tenant.id,
        userId: regB.user.id,
        itemId: createdA.item.id,
        name: "Tampered",
      }),
    ).rejects.toThrow(/not found/i);

    await expect(
      db.deleteInventoryItem(regB.tenant.id, regB.user.id, createdA.item.id),
    ).rejects.toThrow(/not found/i);

    const afterB = await db.getTenantOverview(regB.tenant.id, regB.user.id);
    expect(afterB!.items).toHaveLength(0);
    expect(afterB!.metrics.inventoryAssetValue).toBe(0);
    expect(afterB!.metrics.runningReceivableBalance).toBe(0);
  });

  it("supports optional targetSalePrice, SKU edits with cost revaluation, and soft-delete preserving ledger history", async () => {
    const db = new MemoryJsonAdapter();
    await db.ensureSeeded();

    expect(parseOptionalPrice(null)).toBeNull();
    expect(parseOptionalPrice(undefined)).toBeNull();
    expect(parseOptionalPrice("")).toBeNull();
    expect(parseOptionalPrice("   ")).toBeNull();
    expect(parseOptionalPrice("4250.5")).toBe(4250.5);

    const reg = await db.registerTenant({
      businessName: "Metro Electronics",
      businessType: "electronics",
      currency: "PKR",
      fullName: "Bilal Ahmed",
      email: "bilal@metroelec.test",
      passwordHash: hashPassword("pass1234"),
      includeStarterStock: false,
    });

    const ov0 = await db.getTenantOverview(reg.tenant.id, reg.user.id);
    const catId = ov0!.categories[0].id;

    // 1. Item without ledger history (qty = 0) -> hard delete
    const unused = await db.createInventoryItem({
      tenantId: reg.tenant.id,
      userId: reg.user.id,
      categoryId: catId,
      sku: "ELC-TMP-01",
      name: "Draft Cable",
      brand: "Belkin",
      unitCostPrice: 500,
      targetSalePrice: null,
      qtyOnHand: 0,
      reorderLevel: 1,
    });
    expect(unused.ledgerEntry).toBeNull();
    const hardDel = await db.deleteInventoryItem(
      reg.tenant.id,
      reg.user.id,
      unused.item.id,
    );
    expect(hardDel.mode).toBe("hard");

    // 2. Item with stock & sales -> edit + soft delete
    const created = await db.createInventoryItem({
      tenantId: reg.tenant.id,
      userId: reg.user.id,
      categoryId: catId,
      sku: "ELC-TV-75",
      name: "75-Inch QLED Panel",
      brand: "TCL",
      unitCostPrice: 100000,
      targetSalePrice: null,
      qtyOnHand: 4,
      reorderLevel: 1,
    });

    // Dispatch 1 unit manually priced at 118,000
    await db.recordSaleDispatch({
      tenantId: reg.tenant.id,
      userId: reg.user.id,
      itemId: created.item.id,
      quantity: 1,
      unitSalePrice: 118000,
    });

    // Edit SKU name, brand, targetSalePrice, and cost (3 units remaining: +5,000 each = +15,000 revaluation)
    const edited = await db.updateInventoryItem({
      tenantId: reg.tenant.id,
      userId: reg.user.id,
      itemId: created.item.id,
      name: "75-Inch MiniLED Panel",
      brand: "Hisense",
      targetSalePrice: 125000,
      unitCostPrice: 105000,
    });

    expect(edited.item.name).toBe("75-Inch MiniLED Panel");
    expect(edited.item.brand).toBe("Hisense");
    expect(edited.item.targetSalePrice).toBe(125000);
    expect(edited.ledgerEntry?.inventoryCostDelta).toBe(15000);

    const ovAfterEdit = await db.getTenantOverview(reg.tenant.id, reg.user.id);
    expect(ovAfterEdit!.metrics.inventoryAssetValue).toBe(315000); // 3 * 105,000
    expect(ovAfterEdit!.metrics.runningReceivableBalance).toBe(118000);

    // Clear targetSalePrice back to null & update qtyOnHand directly
    const clearedPrice = await db.updateInventoryItem({
      tenantId: reg.tenant.id,
      userId: reg.user.id,
      itemId: created.item.id,
      targetSalePrice: null,
      qtyOnHand: 5,
    });
    expect(clearedPrice.item.targetSalePrice).toBeNull();
    expect(clearedPrice.item.qtyOnHand).toBe(5);
    expect(clearedPrice.ledgerEntry?.inventoryCostDelta).toBe(210000); // +2 units * 105,000

    // Auto-generated unique SKUs when blank or prefix-only (e.g. "ELC-")
    const auto1 = await db.createInventoryItem({
      tenantId: reg.tenant.id,
      userId: reg.user.id,
      categoryId: catId,
      sku: "ELC-",
      name: "Auto SKU One",
      brand: "Sony",
      unitCostPrice: 1000,
      targetSalePrice: null,
      qtyOnHand: 1,
      reorderLevel: 1,
    });
    const auto2 = await db.createInventoryItem({
      tenantId: reg.tenant.id,
      userId: reg.user.id,
      categoryId: catId,
      sku: "ELC-",
      name: "Auto SKU Two",
      brand: "Sony",
      unitCostPrice: 1000,
      targetSalePrice: null,
      qtyOnHand: 1,
      reorderLevel: 1,
    });
    expect(auto1.item.sku).toBe("ELC-101");
    expect(auto2.item.sku).toBe("ELC-102");

    // Soft-delete item -> active items lose created.item, remaining 525,000 written off, past ledger preserved
    const softDel = await db.deleteInventoryItem(
      reg.tenant.id,
      reg.user.id,
      created.item.id,
    );
    expect(softDel.mode).toBe("soft");

    const ovAfterDelete = await db.getTenantOverview(reg.tenant.id, reg.user.id);
    expect(ovAfterDelete!.items).toHaveLength(2);
    expect(ovAfterDelete!.metrics.inventoryAssetValue).toBe(2000);
    expect(ovAfterDelete!.metrics.runningReceivableBalance).toBe(118000);
    expect(ovAfterDelete!.ledger.length).toBeGreaterThanOrEqual(7);
  });

  it("enforces cost-only inventory deduction and sale-price receivable routing", async () => {
    const db = new MemoryJsonAdapter();
    await db.ensureSeeded();

    const reg = await db.registerTenant({
      businessName: "City Electronics",
      businessType: "electronics",
      currency: "PKR",
      fullName: "Usman Tariq",
      email: "usman@cityelec.test",
      passwordHash: hashPassword("pass1234"),
      includeStarterStock: false,
    });

    const ov0 = await db.getTenantOverview(reg.tenant.id, reg.user.id);
    const catId = ov0!.categories[0].id;

    const { item } = await db.createInventoryItem({
      tenantId: reg.tenant.id,
      userId: reg.user.id,
      categoryId: catId,
      sku: "ELC-TV-55",
      name: "55-Inch UHD Panel",
      brand: "TCL",
      unitCostPrice: 30000,
      targetSalePrice: 36500,
      qtyOnHand: 5,
      reorderLevel: 1,
    });

    const ov1 = await db.getTenantOverview(reg.tenant.id, reg.user.id);
    expect(ov1!.metrics.inventoryAssetValue).toBe(150000);
    expect(ov1!.metrics.runningReceivableBalance).toBe(0);

    const sale = await db.recordSaleDispatch({
      tenantId: reg.tenant.id,
      userId: reg.user.id,
      itemId: item.id,
      quantity: 2,
      unitSalePrice: 36500,
      customerName: "Saeed Electronics",
      reference: "DSP-TEST-1",
    });

    expect(sale.item.qtyOnHand).toBe(3);
    expect(sale.ledgerEntry.itemBrand).toBe("TCL");
    expect(sale.ledgerEntry.partyName).toBe("Saeed Electronics");
    expect(sale.ledgerEntry.inventoryCostDelta).toBe(-60000);
    expect(sale.ledgerEntry.receivableDelta).toBe(73000);
    expect(sale.ledgerEntry.inventoryCostBalanceAfter).toBe(90000);
    expect(sale.ledgerEntry.receivableBalanceAfter).toBe(73000);

    const stl = await db.recordWeeklySettlement({
      tenantId: reg.tenant.id,
      userId: reg.user.id,
      settledAmount: 50000,
      recipientName: "Head Office Cash Desk",
      settlementMethod: "bank_transfer",
      reference: "STL-TEST-1",
    });

    expect(stl.settlement.recipientName).toBe("Head Office Cash Desk");
    expect(stl.settlement.receivableBefore).toBe(73000);
    expect(stl.settlement.settledAmount).toBe(50000);
    expect(stl.settlement.receivableAfter).toBe(23000);
    expect(stl.ledgerEntry.partyName).toBe("Head Office Cash Desk");
    const ov2 = await db.getTenantOverview(reg.tenant.id, reg.user.id);
    expect(ov2!.metrics.inventoryAssetValue).toBe(90000);
    expect(ov2!.metrics.runningReceivableBalance).toBe(23000);

    await db.restockInventoryItem({
      tenantId: reg.tenant.id,
      userId: reg.user.id,
      itemId: item.id,
      addedQty: 3,
      unitCostPrice: 32000,
    });

    const ov3 = await db.getTenantOverview(reg.tenant.id, reg.user.id);
    expect(ov3!.metrics.totalUnitsInStock).toBe(6);
    expect(ov3!.metrics.inventoryAssetValue).toBe(186000);
    expect(ov3!.metrics.runningReceivableBalance).toBe(23000);
  });

  it("verifies password hashing and HMAC session tokens", () => {
    const hash = hashPassword("strong-pass-99");
    expect(verifyPassword("strong-pass-99", hash)).toBe(true);
    expect(verifyPassword("wrong-pass", hash)).toBe(false);

    const token = signSessionToken({
      userId: "usr_1",
      tenantId: "ten_1",
      email: "test@aliems.local",
    });
    const decoded = verifySessionToken(token);
    expect(decoded?.tenantId).toBe("ten_1");
    expect(decoded?.userId).toBe("usr_1");

    const tampered = `${token.slice(0, -2)}xx`;
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("persists scanned bills with smart SKU upsert, auto-categories, and supplier old balances per tenant", async () => {
    const db = new MemoryJsonAdapter();
    await db.ensureSeeded();

    const regA = await db.registerTenant({
      businessName: "Sunrise Electric",
      businessType: "appliances",
      currency: "PKR",
      fullName: "Bilal Khan",
      email: "bilal@sunrise.test",
      passwordHash: hashPassword("pass1234"),
      includeStarterStock: false,
    });

    const regB = await db.registerTenant({
      businessName: "Other Shop",
      businessType: "mobile",
      currency: "PKR",
      fullName: "Sara Ali",
      email: "sara@other.test",
      passwordHash: hashPassword("pass1234"),
      includeStarterStock: false,
    });

    const ov0 = await db.getTenantOverview(regA.tenant.id, regA.user.id);
    const fanCat = ov0!.categories.find((c) => c.name === "Fans & Air Cooling")!;

    // Pre-existing SKU that matches PAK-CF-56 from sample bill
    await db.createInventoryItem({
      tenantId: regA.tenant.id,
      userId: regA.user.id,
      categoryId: fanCat.id,
      sku: "PAK-CF-56",
      name: "Inverter Ceiling Fan 56-Inch",
      brand: "Pak Fan",
      unitCostPrice: 6500,
      targetSalePrice: 8200,
      qtyOnHand: 4,
      reorderLevel: 2,
    });

    const sampleBill = buildSampleScannedBill();
    expect(sampleBill.billTotal).toBe(128100);
    expect(computeUpdatedSupplierBalance(50000, 128100)).toBe(178100);

    // Commit bill: 1 existing SKU updated (4 + 6 = 10 @ 6750), 2 new SKUs created
    const res = await db.commitScannedBill({
      tenantId: regA.tenant.id,
      userId: regA.user.id,
      supplierName: sampleBill.supplierName,
      billDate: sampleBill.billDate,
      oldBalance: 50000,
      items: sampleBill.items,
    });

    expect(res.updatedCount).toBe(1);
    expect(res.addedCount).toBe(2);
    expect(res.billTotal).toBe(128100);
    expect(res.supplier?.oldBalance).toBe(50000);
    expect(res.supplier?.runningBalance).toBe(178100);

    const ov1 = await db.getTenantOverview(regA.tenant.id, regA.user.id);
    const updatedFan = ov1!.items.find((i) => i.sku === "PAK-CF-56")!;
    expect(updatedFan.qtyOnHand).toBe(10);
    expect(updatedFan.unitCostPrice).toBe(6750);

    // Inventory Asset Value: 10*6750 (67500) + 2*31200 (62400) + 3*8400 (25200) = 155100
    expect(ov1!.metrics.inventoryAssetValue).toBe(155100);
    expect(ov1!.metrics.totalSupplierPayable).toBe(178100);
    expect(ov1!.suppliers).toHaveLength(1);

    // Upsert another supplier balance directly
    await db.upsertSupplierBalance({
      tenantId: regA.tenant.id,
      userId: regA.user.id,
      supplierName: "Karachi Cables Depot",
      oldBalance: 22500,
      currentBillAmount: 14500,
    });

    const ov2 = await db.getTenantOverview(regA.tenant.id, regA.user.id);
    expect(ov2!.suppliers).toHaveLength(2);
    expect(ov2!.metrics.totalSupplierPayable).toBe(215100);

    // Tenant B remains completely isolated
    const ovB = await db.getTenantOverview(regB.tenant.id, regB.user.id);
    expect(ovB!.items).toHaveLength(0);
    expect(ovB!.suppliers).toHaveLength(0);
    expect(ovB!.metrics.totalSupplierPayable).toBe(0);
  });
});
