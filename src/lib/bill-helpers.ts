import { roundMoney } from "@/lib/accounting";
import type { ScannedBillItem, ScannedBillPayload } from "@/types/domain";

export function normalizeScannedItem(
  raw: Partial<ScannedBillItem>,
  index: number,
): ScannedBillItem {
  const quantity =
    typeof raw.quantity === "number" && Number.isFinite(raw.quantity) && raw.quantity > 0
      ? Math.round(raw.quantity)
      : 1;
  const unitCost =
    typeof raw.unitCost === "number" && Number.isFinite(raw.unitCost) && raw.unitCost >= 0
      ? roundMoney(raw.unitCost)
      : 0;
  const computedLineTotal = roundMoney(quantity * unitCost);
  const lineTotal =
    typeof raw.lineTotal === "number" &&
    Number.isFinite(raw.lineTotal) &&
    raw.lineTotal > 0 &&
    unitCost === 0
      ? roundMoney(raw.lineTotal)
      : computedLineTotal;

  const resolvedUnitCost =
    unitCost === 0 && lineTotal > 0 && quantity > 0
      ? roundMoney(lineTotal / quantity)
      : unitCost;

  return {
    id: raw.id || `scan_row_${index}_${Math.random().toString(36).slice(2, 7)}`,
    itemName: (raw.itemName || "").trim() || `Scanned Item ${index + 1}`,
    skuOrModel: (raw.skuOrModel || "").trim() || `SKU-${101 + index}`,
    category: (raw.category || "").trim() || "General",
    quantity,
    unitCost: resolvedUnitCost,
    lineTotal: roundMoney(quantity * resolvedUnitCost),
  };
}

export function computeBillItemsTotal(items: ScannedBillItem[]): number {
  return roundMoney(items.reduce((sum, item) => sum + roundMoney(item.lineTotal), 0));
}

export function computeUpdatedSupplierBalance(
  oldBalance: number,
  currentBillAmount: number,
): number {
  const safeOld = Number.isFinite(oldBalance) ? oldBalance : 0;
  const safeBill = Number.isFinite(currentBillAmount) ? currentBillAmount : 0;
  return roundMoney(safeOld + safeBill);
}

export function buildSampleScannedBill(): ScannedBillPayload {
  const items = [
    normalizeScannedItem(
      {
        itemName: "Inverter Ceiling Fan 56-Inch",
        skuOrModel: "PAK-CF-56",
        category: "Fans & Air Cooling",
        quantity: 6,
        unitCost: 6750,
      },
      0,
    ),
    normalizeScannedItem(
      {
        itemName: "Twin-Tub Washer 10kg",
        skuOrModel: "DWL-TT-10",
        category: "Washing Machines",
        quantity: 2,
        unitCost: 31200,
      },
      1,
    ),
    normalizeScannedItem(
      {
        itemName: "Digital Voltage Stabilizer 3000VA",
        skuOrModel: "STB-3000",
        category: "Power Inverters & UPS",
        quantity: 3,
        unitCost: 8400,
      },
      2,
    ),
  ];

  return {
    supplierName: "Lahore Wholesale Electric Co.",
    billDate: new Date().toISOString().slice(0, 10),
    items,
    billTotal: computeBillItemsTotal(items),
  };
}

