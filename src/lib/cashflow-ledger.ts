import { roundMoney } from "@/lib/accounting";
import type {
  CashFlowLedgerRow,
  CashFlowPeriodType,
  InventoryItem,
  LedgerEntry,
  SupplierAccount,
  Tenant,
  WeeklyCashFlowReportData,
  WeeklySettlement,
} from "@/types/domain";

interface InternalCashFlowEvent {
  date: string;
  timestamp: string;
  order: number;
  thisWeekAmount: number;
  amountPaid: number;
  description: string;
  sourceType: "bill" | "payment";
  reference?: string;
}

export function toIsoDateOnly(input: Date | string): string {
  if (typeof input === "string") {
    const match = input.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
  }
  return input.toISOString().slice(0, 10);
}

export function getWeekDateBounds(dateStr?: string): {
  startDate: string;
  endDate: string;
  label: string;
} {
  const base = dateStr ? new Date(`${toIsoDateOnly(dateStr)}T00:00:00Z`) : new Date();
  const safe = Number.isNaN(base.getTime()) ? new Date() : base;
  const day = safe.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(safe);
  start.setUTCDate(start.getUTCDate() + diffToMonday);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  return {
    startDate,
    endDate,
    label: formatPeriodRangeLabel(startDate, endDate),
  };
}

export function getMonthDateBounds(yearMonth?: string): {
  startDate: string;
  endDate: string;
  label: string;
} {
  const now = new Date();
  const match = (yearMonth || "").trim().match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const monthIdx = match ? Math.min(11, Math.max(0, Number(match[2]) - 1)) : now.getUTCMonth();

  const start = new Date(Date.UTC(year, monthIdx, 1));
  const end = new Date(Date.UTC(year, monthIdx + 1, 0));

  const label = start.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    label,
  };
}

export function formatPeriodRangeLabel(startDate: string, endDate: string): string {
  const s = new Date(`${toIsoDateOnly(startDate)}T00:00:00Z`);
  const e = new Date(`${toIsoDateOnly(endDate)}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    return `${startDate} - ${endDate}`;
  }
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(s)} - ${fmt(e)}`;
}

export function getRecentWeekOptions(count = 12, now: Date = new Date()): Array<{
  startDate: string;
  endDate: string;
  label: string;
}> {
  const current = getWeekDateBounds(now.toISOString().slice(0, 10));
  const anchor = new Date(`${current.startDate}T00:00:00Z`);
  const options: Array<{ startDate: string; endDate: string; label: string }> = [];
  for (let i = 0; i < count; i++) {
    const dt = new Date(anchor);
    dt.setUTCDate(dt.getUTCDate() - i * 7);
    const bounds = getWeekDateBounds(dt.toISOString().slice(0, 10));
    options.push({
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      label: i === 0 ? `This Week (${bounds.label})` : bounds.label,
    });
  }
  return options;
}

function parseOldAndBillFromNotes(notes: string): {
  oldBalance: number;
  billAmount: number;
} | null {
  const m = notes.match(
    /Old:\s*([0-9]+(?:\.[0-9]+)?)\s*\+\s*Bill:\s*([0-9]+(?:\.[0-9]+)?)/i,
  );
  if (!m) return null;
  const oldBalance = Number(m[1]);
  const billAmount = Number(m[2]);
  if (!Number.isFinite(oldBalance) || !Number.isFinite(billAmount)) return null;
  return {
    oldBalance: roundMoney(oldBalance),
    billAmount: roundMoney(billAmount),
  };
}

function cleanBillNotes(notes: string, supplierName: string): string {
  const cleaned = notes
    .replace(/\s*\(Old:[^)]*\)/gi, "")
    .replace(new RegExp(`Bill posted for ${supplierName}`, "i"), "")
    .trim();
  return cleaned || "Supplier Bill Entry";
}

export interface BuildCashFlowReportParams {
  tenant: Tenant;
  suppliers: SupplierAccount[];
  items: InventoryItem[];
  ledger: LedgerEntry[];
  settlements: WeeklySettlement[];
  supplierSelector: string;
  periodType: CashFlowPeriodType;
  startDate?: string;
  endDate?: string;
  periodLabel?: string;
  blankRows?: number;
  printDate?: string;
}

export function buildWeeklyCashFlowReport(
  params: BuildCashFlowReportParams,
): WeeklyCashFlowReportData {
  const { tenant, supplierSelector, periodType } = params;
  const safeBlankRows = Number.isFinite(params.blankRows)
    ? Math.min(40, Math.max(0, Math.round(params.blankRows as number)))
    : 8;
  const printDate = toIsoDateOnly(params.printDate || new Date());

  // Resolve period bounds
  let startDate: string;
  let endDate: string;
  let resolvedLabel: string;

  if (periodType === "monthly") {
    const mBounds = getMonthDateBounds(params.startDate?.slice(0, 7));
    startDate = mBounds.startDate;
    endDate = mBounds.endDate;
    resolvedLabel = params.periodLabel?.trim() || mBounds.label;
  } else if (periodType === "weekly") {
    const wBounds = getWeekDateBounds(params.startDate);
    startDate = wBounds.startDate;
    endDate = params.endDate ? toIsoDateOnly(params.endDate) : wBounds.endDate;
    resolvedLabel =
      params.periodLabel?.trim() || formatPeriodRangeLabel(startDate, endDate);
  } else {
    const fallbackWeek = getWeekDateBounds(printDate);
    startDate = params.startDate
      ? toIsoDateOnly(params.startDate)
      : fallbackWeek.startDate;
    endDate = params.endDate ? toIsoDateOnly(params.endDate) : fallbackWeek.endDate;
    if (startDate > endDate) {
      const swap = startDate;
      startDate = endDate;
      endDate = swap;
    }
    resolvedLabel =
      params.periodLabel?.trim() || formatPeriodRangeLabel(startDate, endDate);
  }

  const rawShopName = tenant.businessName?.trim() || "";
  const shopName =
    !rawShopName || rawShopName.toLowerCase() === "aliems"
      ? "Ali Electronic"
      : rawShopName;

  if (supplierSelector === "BLANK_MANUAL" || !supplierSelector.trim()) {
    return {
      tenantId: tenant.id,
      shopName,
      currency: tenant.currency || "PKR",
      supplierId: "BLANK_MANUAL",
      supplierName: "",
      isBlankManual: true,
      periodType,
      startDate,
      endDate,
      periodLabel: resolvedLabel,
      printDate,
      openingBalance: 0,
      totalWeekBills: 0,
      totalAmount: 0,
      totalAmountPaid: 0,
      finalRemainingBalance: 0,
      blankRows: safeBlankRows > 0 ? safeBlankRows : 12,
      rows: [],
    };
  }

  // Strictly scope all collections to tenant.id defensively
  const tenantSuppliers = params.suppliers.filter((s) => s.tenantId === tenant.id);
  const tenantItems = params.items.filter((i) => i.tenantId === tenant.id);
  const tenantLedger = params.ledger.filter((l) => l.tenantId === tenant.id);
  const tenantSettlements = params.settlements.filter(
    (s) => s.tenantId === tenant.id,
  );

  const selectorLower = supplierSelector.trim().toLowerCase();
  const matchedSupplier = tenantSuppliers.find(
    (s) =>
      s.id === supplierSelector ||
      s.supplierNameLower === selectorLower ||
      s.supplierName.trim().toLowerCase() === selectorLower,
  );

  if (!matchedSupplier) {
    throw new Error("Selected supplier was not found in this workspace.");
  }

  const supplierName = matchedSupplier.supplierName.trim();
  const targetLower = matchedSupplier.supplierNameLower;
  const itemSupplierMap = new Map(
    tenantItems.map((it) => [it.id, (it.supplierRef || "").trim().toLowerCase()]),
  );

  // 1. Collect STOCK_IN entries belonging to this supplier
  const supplierStockIns = tenantLedger
    .filter((entry) => {
      if (entry.type !== "STOCK_IN") return false;
      if (entry.partyName?.trim().toLowerCase() === targetLower) return true;
      if (!entry.partyName && entry.itemId) {
        return itemSupplierMap.get(entry.itemId) === targetLower;
      }
      return false;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Group scanned-bill STOCK_IN entries by billBatchId (or createdAt + billDate fallback)
  const scannedBillBatches = new Map<string, LedgerEntry[]>();
  const standaloneRestocks: LedgerEntry[] = [];
  const coveredBatchKeys = new Set<string>();

  for (const entry of supplierStockIns) {
    if (entry.reference.startsWith("BILL-") || entry.billBatchId) {
      const batchKey =
        entry.billBatchId ||
        `${entry.createdAt}__${entry.billDate ? toIsoDateOnly(entry.billDate) : ""}`;
      const group = scannedBillBatches.get(batchKey) ?? [];
      group.push(entry);
      scannedBillBatches.set(batchKey, group);
      coveredBatchKeys.add(batchKey);
      if (entry.billBatchId) coveredBatchKeys.add(entry.billBatchId);
      coveredBatchKeys.add(entry.createdAt);
    } else {
      standaloneRestocks.push(entry);
    }
  }

  const events: InternalCashFlowEvent[] = [];

  // Add grouped bill purchases
  for (const [, batch] of scannedBillBatches.entries()) {
    const ts = batch[0].createdAt;
    const amount = roundMoney(
      batch.reduce((sum, entry) => {
        if (
          typeof entry.quantity === "number" &&
          typeof entry.unitCostPrice === "number"
        ) {
          return sum + entry.quantity * entry.unitCostPrice;
        }
        return sum + Math.max(0, entry.inventoryCostDelta);
      }, 0),
    );
    if (amount <= 0) continue;

    const effectiveDate = toIsoDateOnly(batch[0].billDate || ts);
    const summaryParts = batch.slice(0, 3).map((e) => {
      const name = e.itemName || e.itemSku || "Stock item";
      return typeof e.quantity === "number" ? `${name} (x${e.quantity})` : name;
    });
    const extraCount = batch.length > 3 ? ` +${batch.length - 3} more` : "";
    events.push({
      date: effectiveDate,
      timestamp: ts,
      order: 0,
      thisWeekAmount: amount,
      amountPaid: 0,
      description: `Bill Purchase: ${summaryParts.join(", ")}${extraCount}`,
      sourceType: "bill",
      reference: batch[0].reference,
    });
  }

  // Add standalone restocks linked to this supplier
  for (const entry of standaloneRestocks) {
    const amount = roundMoney(Math.max(0, entry.inventoryCostDelta));
    if (amount <= 0) continue;
    const itemDesc = entry.itemName
      ? `Restock: ${entry.itemName}${entry.quantity ? ` (x${entry.quantity})` : ""}`
      : entry.notes;
    events.push({
      date: toIsoDateOnly(entry.billDate || entry.createdAt),
      timestamp: entry.createdAt,
      order: 0,
      thisWeekAmount: amount,
      amountPaid: 0,
      description: itemDesc,
      sourceType: "bill",
      reference: entry.reference,
    });
  }

  // 2. Inspect SUPPLIER_BALANCE ledger records for initial old balance + manual bills
  const supplierBalanceEntries = tenantLedger
    .filter(
      (entry) =>
        entry.type === "SUPPLIER_BALANCE" &&
        entry.partyName?.trim().toLowerCase() === targetLower,
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let initialOldBalance = 0;
  let initialFound = false;

  for (const entry of supplierBalanceEntries) {
    const batchMatch =
      (entry.billBatchId && coveredBatchKeys.has(entry.billBatchId)) ||
      coveredBatchKeys.has(entry.createdAt);
    const parsed = parseOldAndBillFromNotes(entry.notes);
    if (parsed) {
      if (!initialFound) {
        initialOldBalance = parsed.oldBalance;
        initialFound = true;
      } else if (
        initialOldBalance === 0 &&
        parsed.oldBalance > 0 &&
        !batchMatch
      ) {
        // Handle case where user created supplier with 0 old balance then set opening balance
        initialOldBalance = parsed.oldBalance;
      }

      if (!batchMatch && parsed.billAmount > 0) {
        events.push({
          date: toIsoDateOnly(entry.billDate || entry.createdAt),
          timestamp: entry.createdAt,
          order: 0,
          thisWeekAmount: parsed.billAmount,
          amountPaid: 0,
          description: cleanBillNotes(entry.notes, supplierName),
          sourceType: "bill",
          reference: entry.reference,
        });
      }
    }
  }

  // Fallback if supplier record exists directly in collection without ledger history
  if (!initialFound) {
    initialOldBalance = roundMoney(matchedSupplier.oldBalance);
    if (events.length === 0 && matchedSupplier.lastBillAmount > 0) {
      events.push({
        date: toIsoDateOnly(matchedSupplier.billDate || matchedSupplier.createdAt),
        timestamp: matchedSupplier.createdAt,
        order: 0,
        thisWeekAmount: roundMoney(matchedSupplier.lastBillAmount),
        amountPaid: 0,
        description: matchedSupplier.notes?.trim() || "Supplier Bill Entry",
        sourceType: "bill",
      });
    }
  }

  // 3. Merge supplier payments from WeeklySettlement records matching supplierName
  const matchedSettlements = tenantSettlements
    .filter((s) => s.recipientName?.trim().toLowerCase() === targetLower)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const stl of matchedSettlements) {
    const paid = roundMoney(stl.settledAmount);
    if (paid <= 0) continue;
    const methodLabel = stl.settlementMethod.replace(/_/g, " ");
    const descBase = stl.notes?.trim() || `Payment (${stl.weekLabel})`;
    events.push({
      date: toIsoDateOnly(stl.createdAt),
      timestamp: stl.createdAt,
      order: 1,
      thisWeekAmount: 0,
      amountPaid: paid,
      description: `${descBase} [${methodLabel}]`,
      sourceType: "payment",
      reference: stl.reference,
    });
  }

  // Sort chronologically: date asc -> timestamp asc -> bills before payments
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.timestamp !== b.timestamp) return a.timestamp.localeCompare(b.timestamp);
    return a.order - b.order;
  });

  // 4. Carry-forward calculation across prior events (< startDate) and period events
  let priorBills = 0;
  let priorPayments = 0;
  const periodEvents: InternalCashFlowEvent[] = [];

  for (const ev of events) {
    if (ev.date < startDate) {
      priorBills = roundMoney(priorBills + ev.thisWeekAmount);
      priorPayments = roundMoney(priorPayments + ev.amountPaid);
    } else if (ev.date <= endDate) {
      periodEvents.push(ev);
    }
  }

  const openingBalance = roundMoney(initialOldBalance + priorBills - priorPayments);

  let previousRemainingBalance = openingBalance;
  let totalWeekBills = 0;
  let totalAmountPaid = 0;
  const rows: CashFlowLedgerRow[] = [];

  for (const ev of periodEvents) {
    const totalAmount = roundMoney(previousRemainingBalance + ev.thisWeekAmount);
    const remainingBalance = roundMoney(totalAmount - ev.amountPaid);
    totalWeekBills = roundMoney(totalWeekBills + ev.thisWeekAmount);
    totalAmountPaid = roundMoney(totalAmountPaid + ev.amountPaid);

    rows.push({
      date: ev.date,
      thisWeekAmount: ev.thisWeekAmount,
      amountPaid: ev.amountPaid,
      totalAmount,
      remainingBalance,
      description: ev.description,
      sourceType: ev.sourceType,
      reference: ev.reference,
    });

    previousRemainingBalance = remainingBalance;
  }

  const summaryTotalAmount = roundMoney(openingBalance + totalWeekBills);
  const finalRemainingBalance = roundMoney(summaryTotalAmount - totalAmountPaid);

  return {
    tenantId: tenant.id,
    shopName,
    currency: tenant.currency || "PKR",
    supplierId: matchedSupplier.id,
    supplierName,
    isBlankManual: false,
    periodType,
    startDate,
    endDate,
    periodLabel: resolvedLabel,
    printDate,
    openingBalance,
    totalWeekBills,
    totalAmount: summaryTotalAmount,
    totalAmountPaid,
    finalRemainingBalance,
    blankRows: safeBlankRows,
    rows,
  };
}
