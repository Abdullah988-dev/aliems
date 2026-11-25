# AliEMS — Ali Electronic Management System

**Vercel Project Name:** `ali-ems`  
**Website Name:** `AliEMS`  
**Dashboard Title:** `Ali Electronic Management System`

AliEMS is a multi-tenant, back-office POS, stock control, and running receivable ledger application designed for electronics, mobile, and home appliance dealers.

## Architecture Highlights

1. **Multi-Tenancy & Strict Data Isolation**
   - Every user/business registers into its own isolated `tenantId` partition.
   - HTTP-only HMAC-signed session cookies resolve `tenantId` strictly on the server; client requests never dictate `tenantId`.
   - Every query, stock mutation, dispatch, and settlement filters on `{ tenantId }`.

2. **Dynamic Business Onboarding**
   - Selecting **Home Appliances**, **Consumer Electronics**, **Mobile & Accessories**, or **Custom Trade** automatically provisions relevant categories (e.g., *Washing Machines*, *Fans & Air Cooling*, *Smartphones*, *Power Inverters & UPS*) and SKU prefixes.

3. **Pricing & Profit Separation Accounting**
   - Focuses strictly on back-office stock control and account balances (no customer receipts/invoices).
   - On sale dispatch:
     - Deducts **only the cost price** (`qty * unitCostPrice`) from **Inventory Asset Value**.
     - Routes the **sale price** (`qty * unitSalePrice`) to the **Running Receivable Balance** for weekly settlements without booking immediate net profit.

4. **Testing-First Dual Database Layer (`MONGODB_URI`)**
   - **Fallback Mode (Default):** When `MONGODB_URI` is empty or unset, AliEMS runs on a JSON-persisted local adapter (`.data/aliems-store.json` locally, `/tmp/aliems-store.json` or in-memory on read-only serverless) with two pre-seeded isolated demo tenants.
   - **Live MongoDB Mode:** Set `MONGODB_URI` (and optionally `MONGODB_DB_NAME`, default `aliems`) in `.env.local` or Vercel Environment Variables to switch immediately to MongoDB persistence with zero code changes.

## Local Development & Verification

```bash
npm install
npm run test
npm run typecheck
npm run build
npm run dev
```

## Vercel Deployment (`ali-ems`)

1. Push repository to GitHub or deploy directly with Vercel CLI targeting project name `ali-ems`.
2. Add environment variables in Vercel Project Settings when ready for live persistence:
   - `MONGODB_URI` — MongoDB Atlas connection string
   - `MONGODB_DB_NAME` — `aliems` (optional)
   - `AUTH_SECRET` — random 32+ byte hex secret for signing session cookies

