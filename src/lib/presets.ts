import type { BusinessType } from "@/types/domain";

export interface CategoryPreset {
  name: string;
  description: string;
}

export interface StarterItemPreset {
  categoryName: string;
  skuSuffix: string;
  name: string;
  brand: string;
  unitCostPrice: number;
  targetSalePrice?: number | null;
  qtyOnHand: number;
  reorderLevel: number;
  supplierRef: string;
}

export interface BusinessPreset {
  type: BusinessType;
  label: string;
  tagline: string;
  dashboardFocus: string;
  skuPrefix: string;
  defaultCurrency: string;
  categories: CategoryPreset[];
  starterItems: StarterItemPreset[];
}

export const BUSINESS_PRESETS: Record<BusinessType, BusinessPreset> = {
  appliances: {
    type: "appliances",
    label: "Home Appliances",
    tagline: "Large & small domestic appliances, cooling, and laundry stock.",
    dashboardFocus: "Appliance Unit & Floor Stock Control",
    skuPrefix: "APP",
    defaultCurrency: "PKR",
    categories: [
      { name: "Washing Machines", description: "Automatic, semi-automatic, and twin-tub washers" },
      { name: "Fans & Air Cooling", description: "Ceiling fans, pedestal fans, bracket fans, and air coolers" },
      { name: "Refrigerators & Freezers", description: "Inverter fridges and deep freezers" },
      { name: "Air Conditioners", description: "Split AC units and DC inverter cooling systems" },
      { name: "Kitchen & Small Appliances", description: "Microwaves, dispensers, blenders, and irons" },
    ],
    starterItems: [
      {
        categoryName: "Washing Machines",
        skuSuffix: "WM-101",
        name: "Twin-Tub Washer 10kg Heavy Duty",
        brand: "Dawlance",
        unitCostPrice: 31500,
        targetSalePrice: 36500,
        qtyOnHand: 8,
        reorderLevel: 3,
        supplierRef: "SUP-LAH-04",
      },
      {
        categoryName: "Fans & Air Cooling",
        skuSuffix: "FN-204",
        name: "Inverter Ceiling Fan 56-Inch Copper",
        brand: "Pak Fan",
        unitCostPrice: 6800,
        targetSalePrice: 8200,
        qtyOnHand: 24,
        reorderLevel: 6,
        supplierRef: "SUP-GUJ-11",
      },
      {
        categoryName: "Refrigerators & Freezers",
        skuSuffix: "RF-302",
        name: "Glass Door Inverter Refrigerator 14 Cu Ft",
        brand: "Haier",
        unitCostPrice: 78000,
        targetSalePrice: 86500,
        qtyOnHand: 5,
        reorderLevel: 2,
        supplierRef: "SUP-KHI-02",
      },
      {
        categoryName: "Air Conditioners",
        skuSuffix: "AC-401",
        name: "1.5 Ton T3 DC Inverter Split AC",
        brand: "Gree",
        unitCostPrice: 128000,
        targetSalePrice: null,
        qtyOnHand: 4,
        reorderLevel: 2,
        supplierRef: "SUP-KHI-09",
      },
    ],
  },
  electronics: {
    type: "electronics",
    label: "Consumer Electronics",
    tagline: "Displays, power backup, audio gear, and electrical components.",
    dashboardFocus: "Consumer Electronics & Power Backup Ledger",
    skuPrefix: "ELC",
    defaultCurrency: "PKR",
    categories: [
      { name: "LED & Smart TVs", description: "4K UHD, Google TV, and commercial display panels" },
      { name: "Power Inverters & UPS", description: "Pure sine-wave UPS, solar inverters, and stabilizers" },
      { name: "Batteries & Storage", description: "Tubular, AGM, and lithium backup batteries" },
      { name: "Audio & Sound Systems", description: "Soundbars, studio monitors, and PA speakers" },
      { name: "Cables & Surge Protection", description: "HDMI, extension reels, and voltage protectors" },
    ],
    starterItems: [
      {
        categoryName: "LED & Smart TVs",
        skuSuffix: "TV-108",
        name: "55-Inch 4K QLED Smart Television",
        brand: "TCL",
        unitCostPrice: 102000,
        targetSalePrice: 114500,
        qtyOnHand: 6,
        reorderLevel: 2,
        supplierRef: "SUP-ELC-01",
      },
      {
        categoryName: "Power Inverters & UPS",
        skuSuffix: "UP-210",
        name: "1200VA Pure Sine Wave UPS Unit",
        brand: "Homage",
        unitCostPrice: 28500,
        targetSalePrice: 33000,
        qtyOnHand: 11,
        reorderLevel: 3,
        supplierRef: "SUP-ELC-07",
      },
      {
        categoryName: "Batteries & Storage",
        skuSuffix: "BT-305",
        name: "180Ah Tall Tubular Deep-Cycle Battery",
        brand: "Osaka",
        unitCostPrice: 39000,
        targetSalePrice: null,
        qtyOnHand: 9,
        reorderLevel: 3,
        supplierRef: "SUP-BAT-03",
      },
    ],
  },
  mobile: {
    type: "mobile",
    label: "Mobile & Accessories",
    tagline: "Handsets, tablets, fast-charging hardware, and wearables.",
    dashboardFocus: "IMEI-Ready Handset & Accessory Stock",
    skuPrefix: "MOB",
    defaultCurrency: "PKR",
    categories: [
      { name: "Smartphones", description: "PTA-approved Android and iOS handsets" },
      { name: "Tablets & E-Readers", description: "Wi-Fi and LTE tablets for retail dispatch" },
      { name: "Chargers & Power Banks", description: "GaN adapters, PD cables, and high-capacity banks" },
      { name: "Audio & Wearables", description: "TWS earbuds, neckbands, and smartwatches" },
      { name: "Cases & Glass Protection", description: "Tempered glass and protective armor cases" },
    ],
    starterItems: [
      {
        categoryName: "Smartphones",
        skuSuffix: "PH-101",
        name: "Galaxy A55 5G 8GB/256GB",
        brand: "Samsung",
        unitCostPrice: 116000,
        targetSalePrice: 125500,
        qtyOnHand: 7,
        reorderLevel: 2,
        supplierRef: "SUP-MOB-12",
      },
      {
        categoryName: "Chargers & Power Banks",
        skuSuffix: "CH-205",
        name: "65W Dual-Port GaN Fast Charger",
        brand: "Anker",
        unitCostPrice: 4800,
        targetSalePrice: 6200,
        qtyOnHand: 30,
        reorderLevel: 8,
        supplierRef: "SUP-ACC-04",
      },
      {
        categoryName: "Audio & Wearables",
        skuSuffix: "AU-311",
        name: "ANC Wireless Earbuds Pro",
        brand: "Soundcore",
        unitCostPrice: 9200,
        targetSalePrice: null,
        qtyOnHand: 15,
        reorderLevel: 4,
        supplierRef: "SUP-ACC-04",
      },
    ],
  },
  custom: {
    type: "custom",
    label: "Custom Trade",
    tagline: "Define your own business vertical and initial product categories.",
    dashboardFocus: "Custom Stock & Receivable Ledger",
    skuPrefix: "CUS",
    defaultCurrency: "PKR",
    categories: [
      { name: "Primary Stock", description: "Core fast-moving inventory items" },
      { name: "Secondary Components", description: "Supporting parts and add-on units" },
      { name: "Spare Parts", description: "Service and replacement components" },
    ],
    starterItems: [],
  },
};

export function slugifyCategory(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
