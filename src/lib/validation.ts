import { z } from "zod";
import { sanitizePlainText } from "@/lib/sanitize";

const safeText = (min: number, max: number, label: string) =>
  z
    .string(`${label} is required.`)
    .transform((v) => sanitizePlainText(v))
    .refine((v) => v.length >= min, {
      message: `${label} must be at least ${min} character(s).`,
    })
    .refine((v) => v.length <= max, {
      message: `${label} must be at most ${max} characters.`,
    });

const optionalSafeText = (max: number) =>
  z
    .union([z.string(), z.undefined(), z.null()])
    .transform((v) => (typeof v === "string" ? sanitizePlainText(v).slice(0, max) : undefined))
    .optional();

const idString = (label: string) =>
  z
    .string(`${label} is required.`)
    .trim()
    .min(1, `${label} is required.`)
    .max(80, `${label} is invalid.`)
    .regex(/^[a-zA-Z0-9_-]+$/, `${label} contains invalid characters.`);

const nonNegativeNumber = (label: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? NaN : Number(v)),
    z
      .number(`${label} must be a valid number.`)
      .finite(`${label} must be finite.`)
      .min(0, `${label} must be non-negative.`)
      .max(1_000_000_000, `${label} exceeds allowed maximum.`),
  );

const nonNegativeInt = (label: string) =>
  nonNegativeNumber(label).refine((n) => Number.isInteger(n), {
    message: `${label} must be a whole number.`,
  });

export const loginSchema = z
  .object({
    email: z.string().trim().email("A valid email address is required.").max(160),
    password: z.string().min(1, "Password is required.").max(200),
  })
  .strict();

export const registerSchema = z
  .object({
    businessName: safeText(2, 120, "Business name"),
    businessType: z.enum(["electronics", "mobile", "appliances", "custom"]).default("electronics"),
    customBusinessLabel: optionalSafeText(80),
    customCategories: z
      .array(z.string().transform((s) => sanitizePlainText(s)).pipe(z.string().min(1).max(60)))
      .max(25)
      .optional(),
    currency: optionalSafeText(10),
    fullName: safeText(2, 100, "Full name"),
    email: z.string().trim().email("A valid email address is required.").max(160),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters.")
      .max(200, "Password is too long."),
    includeStarterStock: z.boolean().optional(),
  })
  .strict();

export const createCategorySchema = z
  .object({
    name: safeText(1, 80, "Category name"),
    description: optionalSafeText(200),
  })
  .strict();

export const deleteCategorySchema = z
  .object({
    categoryId: idString("Category ID"),
  })
  .strict();

export const cashFlowReportSchema = z
  .object({
    supplier: optionalSafeText(120).transform((v) => v || "BLANK_MANUAL"),
    periodType: z.enum(["weekly", "monthly", "custom"]).default("weekly"),
    startDate: optionalSafeText(20),
    endDate: optionalSafeText(20),
    periodLabel: optionalSafeText(80),
    blankRows: z
      .union([z.number(), z.string(), z.undefined(), z.null()])
      .transform((v) =>
        v === undefined || v === null || String(v).trim() === "" ? 8 : Math.round(Number(v)),
      )
      .refine((n) => Number.isFinite(n) && n >= 0 && n <= 40, {
        message: "Blank rows must be between 0 and 40.",
      })
      .optional()
      .default(8),
  })
  .strict();

export const createItemSchema = z
  .object({
    categoryId: idString("Category ID").optional(),
    sku: optionalSafeText(40),
    name: safeText(1, 140, "Item / model name"),
    brand: z
      .union([z.string(), z.undefined(), z.null()])
      .transform((v) => (typeof v === "string" ? sanitizePlainText(v).slice(0, 80) : ""))
      .optional()
      .default(""),
    unitCostPrice: nonNegativeNumber("Unit cost price"),
    targetSalePrice: z
      .union([z.number(), z.string(), z.null(), z.undefined()])
      .optional(),
    qtyOnHand: z
      .union([z.number(), z.string(), z.undefined(), z.null()])
      .optional()
      .transform((v) =>
        v === undefined || v === null || String(v).trim() === "" ? 0 : Number(v),
      )
      .refine((n) => Number.isInteger(n) && n >= 0 && n <= 1_000_000, {
        message: "Opening quantity must be a non-negative whole number.",
      }),
    reorderLevel: z
      .union([z.number(), z.string(), z.undefined(), z.null()])
      .optional()
      .transform((v) =>
        v === undefined || v === null || String(v).trim() === "" ? 2 : Number(v),
      )
      .refine((n) => Number.isFinite(n) && n >= 0 && n <= 100_000, {
        message: "Reorder alert level must be a non-negative number.",
      }),
    supplierRef: optionalSafeText(120),
  })
  .strict();

export const updateItemSchema = z
  .object({
    categoryId: idString("Category ID").optional(),
    sku: optionalSafeText(40),
    name: optionalSafeText(140),
    brand: optionalSafeText(80),
    unitCostPrice: z.union([z.number(), z.string(), z.undefined()]).optional(),
    targetSalePrice: z.union([z.number(), z.string(), z.null(), z.undefined()]).optional(),
    qtyOnHand: z.union([z.number(), z.string(), z.undefined()]).optional(),
    reorderLevel: z.union([z.number(), z.string(), z.undefined()]).optional(),
    supplierRef: optionalSafeText(120),
  })
  .strict();

export const restockItemSchema = z
  .object({
    addedQty: nonNegativeInt("Added quantity").refine((n) => n >= 1, {
      message: "Added quantity must be at least 1.",
    }),
    unitCostPrice: nonNegativeNumber("Unit cost price"),
    reference: optionalSafeText(60),
    notes: optionalSafeText(240),
  })
  .strict();

export const adjustStockSchema = z
  .object({
    qtyDelta: z
      .preprocess(
        (v) => Number(v),
        z
          .number("Quantity adjustment must be a number.")
          .int("Quantity adjustment must be a whole number.")
          .refine((n) => n !== 0, "Quantity adjustment cannot be zero.")
          .refine((n) => Math.abs(n) <= 1_000_000, "Adjustment exceeds allowed limit."),
      ),
    reference: optionalSafeText(60),
    notes: optionalSafeText(240),
  })
  .strict();

export const saleDispatchSchema = z
  .object({
    itemId: idString("itemId"),
    quantity: nonNegativeInt("Quantity").refine((n) => n >= 1, {
      message: "Sale quantity must be at least 1.",
    }),
    unitSalePrice: nonNegativeNumber("Unit sale price"),
    customerName: optionalSafeText(120),
    reference: optionalSafeText(60),
    notes: optionalSafeText(240),
  })
  .strict();

export const settlementSchema = z
  .object({
    settledAmount: nonNegativeNumber("Settlement amount").refine((n) => n > 0, {
      message: "Settlement amount must be greater than zero.",
    }),
    weekLabel: optionalSafeText(60),
    recipientName: optionalSafeText(120),
    settlementMethod: z
      .enum(["bank_transfer", "cash_handover", "cheque", "other"])
      .default("bank_transfer"),
    reference: optionalSafeText(60),
    notes: optionalSafeText(240),
  })
  .strict();

export const supplierBalanceSchema = z
  .object({
    supplierName: safeText(1, 120, "Supplier name"),
    oldBalance: z
      .union([z.number(), z.string(), z.undefined(), z.null()])
      .transform((v) =>
        v === undefined || v === null || String(v).trim() === "" ? 0 : Number(v),
      )
      .refine((n) => Number.isFinite(n) && n >= 0 && n <= 1_000_000_000, {
        message: "Old balance must be a non-negative number.",
      })
      .optional()
      .default(0),
    currentBillAmount: z
      .union([z.number(), z.string(), z.undefined(), z.null()])
      .transform((v) =>
        v === undefined || v === null || String(v).trim() === "" ? 0 : Number(v),
      )
      .refine((n) => Number.isFinite(n) && n >= 0 && n <= 1_000_000_000, {
        message: "Current bill amount must be a non-negative number.",
      })
      .optional()
      .default(0),
    billDate: optionalSafeText(20),
    notes: optionalSafeText(240),
  })
  .strict();

export const commitBillSchema = z
  .object({
    supplierName: optionalSafeText(120),
    billDate: optionalSafeText(20),
    oldBalance: z
      .union([z.number(), z.string(), z.null(), z.undefined()])
      .optional(),
    billTotal: z.number().finite().nonnegative().optional(),
    items: z
      .array(
        z.object({
          id: z.string().max(80).optional(),
          itemName: optionalSafeText(140),
          skuOrModel: optionalSafeText(40),
          category: optionalSafeText(80),
          quantity: z.number().finite().positive().max(100_000).optional(),
          unitCost: z.number().finite().nonnegative().max(1_000_000_000).optional(),
          lineTotal: z.number().finite().nonnegative().max(1_000_000_000).optional(),
        }),
      )
      .min(1, "At least one bill item is required to save to live stock.")
      .max(200, "Too many items in a single bill."),
  })
  .strict();

export const updateTenantProfileSchema = z
  .object({
    businessName: safeText(2, 120, "Business name").optional(),
    businessType: z.enum(["electronics", "mobile", "appliances", "custom"]).optional(),
    customBusinessLabel: optionalSafeText(80),
    currency: optionalSafeText(10),
    provisionPresetCategories: z.boolean().optional(),
  })
  .strict();

export const itemIdSchema = idString("itemId");

export function formatZodError(err: z.ZodError): string {
  const first = err.issues[0];
  return first?.message || "Invalid input provided.";
}
