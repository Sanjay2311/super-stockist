# Super Stockist — Milestone 2a (Masters & Pricing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load the real Farm & Farmers catalogue (~184 SKUs) with prices, and give the owner a Pricing Calculator + recommendation engine to set distributor / floor / target prices per SKU — with the SALES role never seeing cost prices.

**Architecture:** Same layering as Milestone 1. New `categories` / `products` / `product_prices` tables (Drizzle, migration 0007). Two new **pure** domain modules — `computePricing` (the waterfall + margins + net contribution) and `recommendPricing` (band-driven suggestions + rationale). A `product` service owns all DB access and the `redactProduct` cost-field boundary. A seed script loads a committed `data/ff-catalogue.json` (generated once from the `.xlsx`). One new screen (`/products`), plus a pricing-bands section in Settings.

**Tech Stack:** TypeScript, Next.js 15 App Router, Drizzle ORM + `postgres`, zod v4, Vitest (+ Playwright specs written but `describe.skip`), Tailwind (hand-rolled, no shadcn).

**Spec:** `docs/superpowers/specs/2026-08-31-super-stockist-design.md` — read §4.5 (products / product_prices), §5.2 (pricing calculator), §5.3 (price recommendation engine), §9 (Milestone 2). This plan implements **Milestone 2a only** (Masters & Pricing). Milestone 2b (Distributor Master, lead→distributor conversion, Quotations + price approval, Schemes) is a separate plan.

## Global Constraints

- **Money:** integer **paise** everywhere (`type Paise = number` from `@/domain/money`). Never floats. Display with `formatINR`. F&F sheet prices are **GST-inclusive**.
- **Domain purity:** `src/domain/*` imports nothing from `next`, `react`, Drizzle, or Supabase. `computePricing` and `recommendPricing` are pure.
- **DB access boundary:** only `src/server/services/*` and `src/server/db/*` import the Drizzle client. Screens/actions call services.
- **Auth:** every Server Action calls `requireUser()` then `assertCan(user, <action>)`. New actions: `product.view` (OWNER + SALES), `product.edit` (OWNER), `pricing.recommend` (OWNER).
- **Cost-field redaction:** SALES must never receive `ssBillingPrice`, `floorPrice`, `targetPrice`. Use `redactProduct` / `redactProducts` (mirrors M1's `redactLead`), driven by `PRODUCT_FINANCIAL_FIELDS`.
- **Audit:** `writeAudit(user, entityType, entityId, action, oldValues, newValues)` on every price / cost / band change — `entityType` `'product'`, `'product_price'`, or `'config'` (spec §38).
- **Soft delete:** `deleted_at` on `products` (and `product_prices` follows the product). List queries filter `isNull(deletedAt)`.
- **zod v4:** `z.uuid()`, `z.email()` (not the deprecated `z.string().uuid()`). For schemas with `.default()` fields, export a local `type XInput = z.input<typeof xSchema>` in the service (the M1 pattern in `lead.ts`/`task.ts`). Partial updates go through `patchOnly(input, parsed)` from `src/lib/patch.ts`.
- **IDs / columns:** `uuid` PK `defaultRandom()` (except mirror-of-external ids); every table `org_id uuid not null`, `created_at`, `updated_at` (`timestamptz` default now). DB `snake_case`, TS `camelCase`.
- **Migrations:** next is **0007**. Generate with `npm run db:generate` (never hand-edit SQL unless a CHECK constraint needs it, and then log it), commit `drizzle/0007_*.sql` + snapshot + journal, apply with `npm run db:migrate`. `drizzle.config.ts` loads `.env.local`.
- **Local env:** no Docker / no Supabase CLI. Native Postgres on `127.0.0.1:54322` — DB `postgres` for Vitest (`TEST_DATABASE_URL`), DB `devbrowse` for the dev server (`DATABASE_URL`). Vitest runs **serially** (`fileParallelism: false`). Browse the app via the dev-auth hatch (`DEV_LOGIN_EMAIL=dev@local` in `.env.local`) — `npm run dev` auto-logs-in as the dev OWNER.
- **Playwright e2e:** write the specs the plan names, but wrap each in `test.describe.skip(...)` with a `// ponytail:` note and a `docs/PONYTAIL-DEBT.md` row. The real per-task gate is Vitest.
- **`tsc --noEmit`** on a fresh checkout needs a prior `npm run build` (Next 15 generates the `LayoutProps` global type). Run `npm run build` once after `npm install`.
- **Definition of Done (every task):** `npm test` green + stable (run twice) · `tsc --noEmit` + `npm run lint` clean · `docs/BUILD-LOG.md` entry appended · `docs/PONYTAIL-DEBT.md` updated if a corner was cut · one focused commit · `npm run dev` still boots.

## Shared Types (defined across Tasks 2–6, referenced throughout)

```ts
type Paise = number;                 // from @/domain/money
type ProductUnit = 'G' | 'KG' | 'PC';

// @/domain/pricing
interface PricingInput {
  mrp: Paise | null;
  ssBillingPrice: Paise;             // F&F "Current" — GST-inclusive, ex-Jaipur
  sellingPrice: Paise;               // distributor price being evaluated
  floorPrice: Paise;
  gstPct: number;                    // e.g. 12 or 5
  gstInclusive: boolean;             // true for F&F
  costInputs?: {
    freight?: Paise; loading?: Paise; salesIncentive?: Paise; samples?: Paise; other?: Paise; scheme?: Paise;
  };
}
interface PricingResult {
  productCostPaise: Paise;           // ssBillingPrice + freight + other direct
  grossMarginPaise: Paise;          grossMarginPct: number;
  netContributionPaise: Paise;      netContributionPct: number;
  maxPermissibleDiscountPaise: Paise;   // sellingPrice - floorPrice (>= 0, clamped)
  belowFloor: boolean;              // sellingPrice < floorPrice
  taxable: { sellingExGst: Paise; ssCostExGst: Paise };
  waterfall: { mrp: Paise | null; retailerPrice: Paise | null; distributorPrice: Paise; ssPrice: Paise; ssCost: Paise };
}

// @/domain/pricing-recommend
interface PricingBands {
  ssMinMarginPct: number; ssNormalMarginPct: number; ssTargetMarginPct: number;
  distributorMarginPct: number; retailerMarginPct: number; volatileFloorBufferPct: number;
}
interface RecommendInput { ssBillingPrice: Paise; mrp: Paise | null; gstPct: number; volatile: boolean; bands: PricingBands; }
interface RecommendResult {
  floorPrice: Paise; distributorPrice: Paise; targetPrice: Paise; retailerPrice: Paise;
  mrpSuggestion: Paise | null;      // set only when input.mrp is null
  rationale: { field: string; valuePaise: Paise | null; why: string }[];
  marginAtEach: { floorPct: number; distributorPct: number; targetPct: number };
}
```

## File Structure

```
Data / seed
  scripts/gen-ff-catalogue.py          one-shot: xlsx -> data/ff-catalogue.json
  data/ff-catalogue.json               committed, 184 SKUs (brand, gstInclusive, gstPctByCategory, skus[])
  src/server/db/ff-catalogue.ts        typed loader: readFileSync + JSON.parse + a zod shape guard
  src/server/db/seed-catalogue.ts      seedCatalogue(orgId): upsert categories/products/product_prices

Domain (pure)
  src/domain/pricing.ts                computePricing(input: PricingInput): PricingResult
  src/domain/pricing-recommend.ts      recommendPricing(input: RecommendInput): RecommendResult

Schema
  src/server/db/schema/product.ts      categories, products, product_prices
  (barrel: src/server/db/schema/index.ts adds `export * from './product'`)
  drizzle/0007_*.sql + meta

Service
  src/server/services/product.ts       list/get/update, updatePrices, resetToRecommended,
                                       regenerateAllRecommended, PRODUCT_FINANCIAL_FIELDS,
                                       redactProduct / redactProducts
  src/server/services/config.ts        (extend CONFIG_DEFAULTS: pricingBands, pricingBandsByCategory, pricesGstInclusive)

Auth
  src/server/auth/permissions.ts       add product.view / product.edit / pricing.recommend

Screens
  src/app/(app)/products/page.tsx      list (redacted for SALES) + search + category filter
  src/app/(app)/products/[id]/page.tsx detail: fields + Pricing panel (calc waterfall + recommended-vs-current + overrides)
  src/app/(app)/products/actions.ts    savePrices, resetToRecommended, regenerateAllRecommended
  src/app/(app)/products/pricing-panel.tsx   client: recommended-vs-current table, override inputs, reset button
  src/app/(app)/settings/{page,forms,actions}.tsx   + Pricing bands form + "regenerate all" button
  src/components/app-nav.tsx           add { href: '/products', label: 'Products' }

Tests
  tests/domain/pricing.test.ts
  tests/domain/pricing-recommend.test.ts
  tests/server/ff-catalogue.test.ts
  tests/services/product.test.ts
  tests/services/seed-catalogue.test.ts
  tests/services/config.test.ts        (extend for pricingBands)
  tests/services/settings-actions.test.ts (extend for savePricingBands + audit)
  tests/e2e/products.spec.ts           (describe.skip)
```

---

### Task 1: F&F catalogue data file + typed loader

**Files:**
- Create: `scripts/gen-ff-catalogue.py`, `data/ff-catalogue.json`, `src/server/db/ff-catalogue.ts`
- Create: `tests/server/ff-catalogue.test.ts`

**Interfaces:**
- Consumes: `Super Stockist Price List .xlsx` (repo root).
- Produces:
  - `data/ff-catalogue.json` — `{ brand: string; gstInclusive: true; gstPctByCategory: Record<string, number>; volatileNote: string; skus: CatalogueSku[] }` where `CatalogueSku = { product: string; category: 'Dry Fruits'|'Seeds'|'Flours'|'Spices'|'Other'; packLabel: string; packGrams: number | null; unit: 'G'|'KG'; currentPaise: number; mrpPaise: number | null; volatile: boolean }`.
  - `src/server/db/ff-catalogue.ts` — `export const FF_CATALOGUE: Catalogue` (parsed + validated once at import), `export type CatalogueSku`, `export type Catalogue`.

- [ ] **Step 1: Write the generator script**

Create `scripts/gen-ff-catalogue.py` (run once; committed for reproducibility):
```python
import zipfile, xml.etree.ElementTree as ET, json, re, sys

XLSX = sys.argv[1] if len(sys.argv) > 1 else 'Super Stockist Price List .xlsx'
M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
z = zipfile.ZipFile(XLSX)
shared = [''.join(t.text or '' for t in si.iter(M+'t'))
          for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', ns)]
sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))

def colnum(ref):
    c = ''.join(ch for ch in ref if ch.isalpha()); n = 0
    for ch in c: n = n*26 + (ord(ch)-64)
    return n

rows = []
for row in sheet.iter(M+'row'):
    cells = {}
    for c in row.findall('m:c', ns):
        v = c.find('m:v', ns); t = c.get('t'); val = ''
        if v is not None:
            val = v.text
            if t == 's': val = shared[int(val)]
        cells[colnum(c.get('r'))] = val
    rows.append([cells.get(i, '') for i in range(1, 10)])

VOLATILE_NAMES = {'Almond', 'Cashew', 'Pumpkin Seeds'}
GST = {'Dry Fruits': 12, 'Seeds': 5, 'Flours': 5, 'Spices': 5, 'Other': 5}
JAR_PACKS = [(100, 1, 2), (250, 3, 4), (500, 5, 6), (1000, 7, None)]  # grams, curr col idx, mrp col idx

skus = []
section = None
for r in rows:
    head = r[0].strip()
    if head.startswith('1. DRY FRUITS'): section = 'Dry Fruits'; continue
    if head.startswith('EXTRA PRODUCTS'): section = 'Other'; continue
    if head.startswith('2. SEEDS'): section = 'Seeds'; continue
    if head.startswith('3. WHOLESALE FLOURS'): section = 'Flours'; continue
    if head.startswith('4. SPICES'): section = 'Spices'; continue
    if (not head or head.upper() in ('PRODUCT', 'FLOUR', 'SPICE / PRODUCT')
            or head.startswith('FARM & FARMERS') or head.startswith('Note') or 'GST Inclusive' in head):
        continue
    if section in ('Dry Fruits', 'Seeds', 'Spices'):
        for grams, ci, mi in JAR_PACKS:
            cur = r[ci]
            if not cur: continue
            mrp = r[mi] if mi is not None and r[mi] else None
            skus.append({'product': head, 'category': section,
                         'packLabel': f'{grams}g' if grams < 1000 else '1kg',
                         'packGrams': grams, 'unit': 'G',
                         'currentPaise': round(float(cur) * 100),
                         'mrpPaise': round(float(mrp) * 100) if mrp else None,
                         'volatile': head in VOLATILE_NAMES})
    elif section == 'Flours':
        cur, mrp = r[1], r[2]
        if not cur: continue
        skus.append({'product': head, 'category': 'Flours', 'packLabel': '1kg', 'packGrams': 1000, 'unit': 'KG',
                     'currentPaise': round(float(cur) * 100),
                     'mrpPaise': round(float(mrp) * 100) if mrp else None, 'volatile': False})
    elif section == 'Other':
        variation, cur, mrp = r[1], r[2], r[3]
        if not cur: continue
        m = re.search(r'(\d+)', variation or '')
        skus.append({'product': head, 'category': 'Other', 'packLabel': (variation or '').strip(),
                     'packGrams': int(m.group(1)) if m else None, 'unit': 'G',
                     'currentPaise': round(float(cur) * 100),
                     'mrpPaise': round(float(mrp) * 100) if mrp else None, 'volatile': False})

out = {'brand': 'Farm & Farmers', 'gstInclusive': True, 'gstPctByCategory': GST,
       'volatileNote': 'Almonds, Cashews, Pista & Pumpkin Seeds prices fluctuate with market',
       'skus': skus}
sys.stdout.write(json.dumps(out, indent=2, ensure_ascii=False) + '\n')
sys.stderr.write(f'{len(skus)} SKUs\n')
```

- [ ] **Step 2: Generate the JSON**

Run from repo root:
```bash
python3 scripts/gen-ff-catalogue.py 'Super Stockist Price List .xlsx' > data/ff-catalogue.json
```
Expected on stderr: `184 SKUs`. Sanity-check `data/ff-catalogue.json`: first SKU is Almond 100g `currentPaise: 10700`, `mrpPaise: 19300`, `volatile: true`; category counts Dry Fruits 32 / Seeds 40 / Flours 17 / Spices 92 / Other 3.

- [ ] **Step 3: Write the failing test**

Create `tests/server/ff-catalogue.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { FF_CATALOGUE } from '@/server/db/ff-catalogue';

describe('FF_CATALOGUE', () => {
  it('parses 184 SKUs with integer paise and valid categories', () => {
    expect(FF_CATALOGUE.skus).toHaveLength(184);
    expect(FF_CATALOGUE.gstInclusive).toBe(true);
    const cats = new Set(FF_CATALOGUE.skus.map((s) => s.category));
    expect([...cats].sort()).toEqual(['Dry Fruits', 'Flours', 'Other', 'Seeds', 'Spices']);
    for (const s of FF_CATALOGUE.skus) {
      expect(Number.isInteger(s.currentPaise)).toBe(true);
      expect(s.currentPaise).toBeGreaterThan(0);
      expect(s.mrpPaise === null || Number.isInteger(s.mrpPaise)).toBe(true);
    }
  });
  it('has the Almond 100g row from the sheet', () => {
    const a = FF_CATALOGUE.skus.find((s) => s.product === 'Almond' && s.packLabel === '100g')!;
    expect(a).toMatchObject({ category: 'Dry Fruits', currentPaise: 10700, mrpPaise: 19300, volatile: true });
  });
  it('the 1kg jar packs have no MRP', () => {
    const oneKg = FF_CATALOGUE.skus.filter((s) => s.packLabel === '1kg' && s.unit === 'G');
    expect(oneKg.length).toBeGreaterThan(0);
    expect(oneKg.every((s) => s.mrpPaise === null)).toBe(true);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- ff-catalogue`
Expected: FAIL — `Cannot find module '@/server/db/ff-catalogue'`.

- [ ] **Step 5: Implement the loader**

Create `src/server/db/ff-catalogue.ts`:
```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const skuSchema = z.object({
  product: z.string().min(1),
  category: z.enum(['Dry Fruits', 'Seeds', 'Flours', 'Spices', 'Other']),
  packLabel: z.string().min(1),
  packGrams: z.number().int().positive().nullable(),
  unit: z.enum(['G', 'KG']),
  currentPaise: z.number().int().positive(),
  mrpPaise: z.number().int().positive().nullable(),
  volatile: z.boolean(),
});
const catalogueSchema = z.object({
  brand: z.string(),
  gstInclusive: z.literal(true),
  gstPctByCategory: z.record(z.string(), z.number()),
  volatileNote: z.string(),
  skus: z.array(skuSchema).min(1),
});

export type CatalogueSku = z.infer<typeof skuSchema>;
export type Catalogue = z.infer<typeof catalogueSchema>;

const raw = readFileSync(join(process.cwd(), 'data', 'ff-catalogue.json'), 'utf8');
export const FF_CATALOGUE: Catalogue = catalogueSchema.parse(JSON.parse(raw));
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- ff-catalogue` → PASS. Then full `npm test` (should be 24 files now). `tsc --noEmit` + `npm run lint` clean (run `npm run build` first if `tsc` complains about `LayoutProps`).

- [ ] **Step 7: Commit**

```bash
git add scripts/gen-ff-catalogue.py data/ff-catalogue.json src/server/db/ff-catalogue.ts tests/server/ff-catalogue.test.ts docs/BUILD-LOG.md
git commit -m "feat: F&F catalogue data file (184 SKUs from the price sheet) + typed loader"
```
Append the Task 1 BUILD-LOG entry.

---

### Task 2: Categories / Products / product_prices schema + migration 0007

**Files:**
- Create: `src/server/db/schema/product.ts`
- Modify: `src/server/db/schema/index.ts` (`export * from './product'`)
- Create: `tests/services/product-schema.test.ts`
- Generate: `drizzle/0007_*.sql` + meta

**Interfaces:**
- Consumes: `db`, `seedBase`, `testDb`/`migrateTestDb`/`resetDb`.
- Produces (Drizzle tables):
  - `categories` { id, orgId, name, parentId (uuid, null), active (bool, default true), createdAt, updatedAt, deletedAt }
  - `products` { id, orgId, brandId (uuid, null), categoryId (uuid, not null → categories.id), skuCode (text, unique per org), name (text), packLabel (text), packGrams (integer, null), unit (text: 'G'|'KG'|'PC', default 'G'), mrp (bigint mode number, null), gstPct (numeric — store as `integer` percent, e.g. 12), shelfLifeDays (integer, null), reorderLevel (integer, default 0), minStock (integer, default 0), maxStock (integer, default 0), preferredStock (integer, default 0), active (bool, default true), volatilePrice (bool, default false), isDemo (bool, default false), createdAt, updatedAt, deletedAt }
    - unique index `products_org_sku_idx` on `(orgId, skuCode)`.
    - index `products_org_cat_idx` on `(orgId, categoryId)`; index `products_org_active_idx` on `(orgId, active)`.
  - `productPrices` { id, orgId, productId (uuid, not null → products.id, **unique** — 1:1), ssBillingPrice (bigint number, not null), distributorPrice (bigint number, not null), floorPrice (bigint number, not null), targetPrice (bigint number, not null), retailerPrice (bigint number, null), mrp (bigint number, null — snapshot copy for the calculator; canonical MRP stays on `products`), isDemoAssumption (bool, default false), manualOverride (bool, default false), overrideBy (uuid, null), overrideAt (timestamptz, null), effectiveFrom (timestamptz, default now), createdAt, updatedAt }
    - unique index `product_prices_product_idx` on `(productId)`.

- [ ] **Step 1: Write the failing test**

Create `tests/services/product-schema.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { categories, products, productPrices } from '@/server/db/schema/product';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('product schema', () => {
  it('inserts a category, product (defaulted flags), and a 1:1 price row', async () => {
    const { orgId, brandId } = await seedBase();
    const [cat] = await testDb.insert(categories).values({ orgId, name: 'Dry Fruits' }).returning();
    const [p] = await testDb.insert(products).values({
      orgId, brandId, categoryId: cat.id, skuCode: 'DF-ALMOND-100G', name: 'Almond', packLabel: '100g',
      packGrams: 100, gstPct: 12, mrp: 19300,
    }).returning();
    expect(p.active).toBe(true);
    expect(p.volatilePrice).toBe(false);
    expect(p.unit).toBe('G');
    const [pr] = await testDb.insert(productPrices).values({
      orgId, productId: p.id, ssBillingPrice: 10700, distributorPrice: 11984, floorPrice: 11556, targetPrice: 12626,
    }).returning();
    expect(pr.manualOverride).toBe(false);
    expect(pr.isDemoAssumption).toBe(false);
  });

  it('enforces one price row per product', async () => {
    const { orgId } = await seedBase();
    const [cat] = await testDb.insert(categories).values({ orgId, name: 'Seeds' }).returning();
    const [p] = await testDb.insert(products).values({
      orgId, categoryId: cat.id, skuCode: 'SD-CHIA-100G', name: 'Chia Seeds', packLabel: '100g', gstPct: 5,
    }).returning();
    const row = { orgId, productId: p.id, ssBillingPrice: 4000, distributorPrice: 4480, floorPrice: 4320, targetPrice: 4720 };
    await testDb.insert(productPrices).values(row);
    await expect(testDb.insert(productPrices).values(row)).rejects.toThrow();
  });

  it('enforces unique skuCode per org', async () => {
    const { orgId } = await seedBase();
    const [cat] = await testDb.insert(categories).values({ orgId, name: 'Spices' }).returning();
    const base = { orgId, categoryId: cat.id, skuCode: 'SP-TURMERIC-100G', name: 'Turmeric', packLabel: '100g', gstPct: 5 };
    await testDb.insert(products).values(base);
    await expect(testDb.insert(products).values({ ...base, name: 'Turmeric dup' })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- product-schema`
Expected: FAIL — module `@/server/db/schema/product` not found.

- [ ] **Step 3: Implement `src/server/db/schema/product.ts`**

```ts
import { pgTable, uuid, text, integer, bigint, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

const ts = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: text('name').notNull(),
  parentId: uuid('parent_id'),
  active: boolean('active').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...ts,
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  brandId: uuid('brand_id'),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  skuCode: text('sku_code').notNull(),
  name: text('name').notNull(),
  packLabel: text('pack_label').notNull(),
  packGrams: integer('pack_grams'),
  unit: text('unit').notNull().default('G'),
  mrp: bigint('mrp', { mode: 'number' }),
  gstPct: integer('gst_pct').notNull().default(5),
  shelfLifeDays: integer('shelf_life_days'),
  reorderLevel: integer('reorder_level').notNull().default(0),
  minStock: integer('min_stock').notNull().default(0),
  maxStock: integer('max_stock').notNull().default(0),
  preferredStock: integer('preferred_stock').notNull().default(0),
  active: boolean('active').notNull().default(true),
  volatilePrice: boolean('volatile_price').notNull().default(false),
  isDemo: boolean('is_demo').notNull().default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...ts,
}, (t) => ({
  skuIdx: uniqueIndex('products_org_sku_idx').on(t.orgId, t.skuCode),
  catIdx: index('products_org_cat_idx').on(t.orgId, t.categoryId),
  activeIdx: index('products_org_active_idx').on(t.orgId, t.active),
}));

export const productPrices = pgTable('product_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  productId: uuid('product_id').notNull().references(() => products.id),
  ssBillingPrice: bigint('ss_billing_price', { mode: 'number' }).notNull(),
  distributorPrice: bigint('distributor_price', { mode: 'number' }).notNull(),
  floorPrice: bigint('floor_price', { mode: 'number' }).notNull(),
  targetPrice: bigint('target_price', { mode: 'number' }).notNull(),
  retailerPrice: bigint('retailer_price', { mode: 'number' }),
  mrp: bigint('mrp', { mode: 'number' }),
  isDemoAssumption: boolean('is_demo_assumption').notNull().default(false),
  manualOverride: boolean('manual_override').notNull().default(false),
  overrideBy: uuid('override_by'),
  overrideAt: timestamp('override_at', { withTimezone: true }),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
  ...ts,
}, (t) => ({ productIdx: uniqueIndex('product_prices_product_idx').on(t.productId) }));
```
Add `export * from './product';` to `src/server/db/schema/index.ts`.

- [ ] **Step 4: Generate + apply the migration**

```bash
npm run db:generate     # writes drizzle/0007_*.sql (CREATE TABLE x3 + the indexes)
npm run db:migrate       # applies to devbrowse
```
Inspect the generated SQL: three `CREATE TABLE`, the `products_org_sku_idx` unique, `product_prices_product_idx` unique, the two plain product indexes, FKs `products.category_id → categories.id` and `product_prices.product_id → products.id`. Snapshot/journal chained (prevId → 0006, idx 7). Commit the SQL + snapshot + `_journal.json`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- product-schema` → PASS. Full `npm test` twice — stable. `tsc` + `lint` clean.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/schema/product.ts src/server/db/schema/index.ts drizzle/0007_* drizzle/meta tests/services/product-schema.test.ts docs/BUILD-LOG.md
git commit -m "feat: categories / products / product_prices schema + migration 0007"
```

---

### Task 3: Pricing config bands (extend `CONFIG_DEFAULTS`)

**Files:**
- Modify: `src/server/services/config.ts`
- Modify: `tests/services/config.test.ts`

**Interfaces:**
- Consumes: existing `CONFIG_DEFAULTS`, `getConfig`, `setConfig`, `ConfigShape`, `ConfigKey`.
- Produces — three new keys on `CONFIG_DEFAULTS`:
  - `pricingBands: PricingBands` = `{ ssMinMarginPct: 8, ssNormalMarginPct: 12, ssTargetMarginPct: 18, distributorMarginPct: 15, retailerMarginPct: 25, volatileFloorBufferPct: 12 }`
  - `pricingBandsByCategory: Record<string, Partial<PricingBands>>` = `{}` (per-category overrides; empty in M2a)
  - `pricesGstInclusive: true`
  - Export `type PricingBands` from `config.ts` (or re-export from `@/domain/pricing-recommend` once Task 5 defines it — pick one home; the plan uses `@/domain/pricing-recommend` as the canonical type and `config.ts` imports it. If Task 5 is not yet done, define `PricingBands` inline in `pricing-recommend.ts` as a stub type first).
  - `bandsForCategory(orgId: string, categoryName: string | null): Promise<PricingBands>` — merges `pricingBands` with any `pricingBandsByCategory[categoryName]` override; used by the recommender.

- [ ] **Step 1: Write the failing test** — add to `tests/services/config.test.ts`:
```ts
import { getConfig, setConfig, CONFIG_DEFAULTS, bandsForCategory } from '@/server/services/config';
// ... existing beforeAll/beforeEach ...

it('exposes default pricing bands and round-trips an override', async () => {
  const { orgId } = await seedBase();
  expect(await getConfig(orgId, 'pricingBands')).toEqual(CONFIG_DEFAULTS.pricingBands);
  expect(await getConfig(orgId, 'pricesGstInclusive')).toBe(true);
  const bands = { ...CONFIG_DEFAULTS.pricingBands, ssTargetMarginPct: 20 };
  await setConfig(orgId, 'pricingBands', bands);
  expect(await getConfig(orgId, 'pricingBands')).toEqual(bands);
});

it('bandsForCategory merges a per-category override onto the global bands', async () => {
  const { orgId } = await seedBase();
  await setConfig(orgId, 'pricingBandsByCategory', { 'Dry Fruits': { ssMinMarginPct: 10 } });
  const b = await bandsForCategory(orgId, 'Dry Fruits');
  expect(b.ssMinMarginPct).toBe(10);
  expect(b.ssNormalMarginPct).toBe(CONFIG_DEFAULTS.pricingBands.ssNormalMarginPct);
  const g = await bandsForCategory(orgId, 'Seeds');
  expect(g).toEqual(CONFIG_DEFAULTS.pricingBands);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- services/config`
Expected: FAIL — `pricingBands` not on `CONFIG_DEFAULTS`, `bandsForCategory` not exported.

- [ ] **Step 3: Implement in `src/server/services/config.ts`**

Add the imports/type:
```ts
import type { PricingBands } from '@/domain/pricing-recommend';
```
Add to `CONFIG_DEFAULTS` (inside the `satisfies {...}` object — extend the satisfies type too):
```ts
  pricingBands: {
    ssMinMarginPct: 8, ssNormalMarginPct: 12, ssTargetMarginPct: 18,
    distributorMarginPct: 15, retailerMarginPct: 25, volatileFloorBufferPct: 12,
  } as PricingBands,
  pricingBandsByCategory: {} as Record<string, Partial<PricingBands>>,
  pricesGstInclusive: true,
```
Add:
```ts
export async function bandsForCategory(orgId: string, categoryName: string | null): Promise<PricingBands> {
  const base = await getConfig(orgId, 'pricingBands');
  if (!categoryName) return base;
  const overrides = await getConfig(orgId, 'pricingBandsByCategory');
  return { ...base, ...(overrides[categoryName] ?? {}) };
}
```
> If `@/domain/pricing-recommend` (Task 5) does not exist yet, create it now containing ONLY `export interface PricingBands { ssMinMarginPct: number; ssNormalMarginPct: number; ssTargetMarginPct: number; distributorMarginPct: number; retailerMarginPct: number; volatileFloorBufferPct: number; }` and flesh it out in Task 5. Note the ordering in the BUILD-LOG.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- services/config` → PASS. Full `npm test` twice. `tsc` + `lint` clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/config.ts tests/services/config.test.ts docs/BUILD-LOG.md
git commit -m "feat: pricing bands + pricesGstInclusive in app_config; bandsForCategory helper"
```

---

### Task 4: Pricing calculator domain — `computePricing`

**Files:**
- Create: `src/domain/pricing.ts`
- Create: `tests/domain/pricing.test.ts`

**Interfaces:** see Shared Types (`PricingInput`, `PricingResult`). Add `retailerPrice?: Paise | null` to `PricingInput` (top-level, optional — used only to populate the display waterfall).

**Rules (from spec §5.2, reconciled against the §28 profitability waterfall — the authority):**
- `productCostPaise = ssBillingPrice` (landed cost of goods). Freight and other variable costs are **below gross**, per §28 — the spec §5.2 phrase "product cost = ssBillingPrice + freight" is superseded to avoid double-counting.
- `grossMarginPaise = sellingPrice - productCostPaise`; `grossMarginPct = grossMarginPaise / sellingPrice * 100` (0 when `sellingPrice === 0`).
- `netContributionPaise = grossMarginPaise - (freight + scheme + loading + salesIncentive + samples + other)` (each `?? 0`); `netContributionPct = netContributionPaise / sellingPrice * 100`.
- `maxPermissibleDiscountPaise = Math.max(0, sellingPrice - floorPrice)`.
- `belowFloor = sellingPrice < floorPrice`.
- `taxable`: when `gstInclusive`, `sellingExGst = Math.round(sellingPrice / (1 + gstPct/100))`, `ssCostExGst = Math.round(ssBillingPrice / (1 + gstPct/100))`; when not inclusive, both equal their inclusive value.
- `waterfall = { mrp, retailerPrice: retailerPrice ?? null, distributorPrice: sellingPrice, ssPrice: ssBillingPrice, ssCost: productCostPaise }`.
- This function **computes and flags**; it never mutates or "recommends" a price. `belowFloor` is a flag for the caller/UI.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/pricing.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computePricing } from '@/domain/pricing';

// Almond 100g from the F&F sheet: cost ₹107 (10700p), MRP ₹193 (19300p), 12% GST inclusive.
const base = {
  mrp: 19300, ssBillingPrice: 10700, sellingPrice: 11984, floorPrice: 11556,
  gstPct: 12, gstInclusive: true as const,
};

describe('computePricing', () => {
  it('computes gross margin and net contribution with no variable costs', () => {
    const r = computePricing(base);
    expect(r.productCostPaise).toBe(10700);
    expect(r.grossMarginPaise).toBe(1284);
    expect(r.grossMarginPct).toBeCloseTo(10.714, 2);
    expect(r.netContributionPaise).toBe(1284);          // nothing to subtract
    expect(r.netContributionPct).toBeCloseTo(10.714, 2);
    expect(r.maxPermissibleDiscountPaise).toBe(428);    // 11984 - 11556
    expect(r.belowFloor).toBe(false);
  });

  it('subtracts variable costs for net contribution only (gross unchanged)', () => {
    const r = computePricing({ ...base, costInputs: { freight: 200, scheme: 100, samples: 50 } });
    expect(r.grossMarginPaise).toBe(1284);
    expect(r.netContributionPaise).toBe(1284 - 200 - 100 - 50);   // 934
    expect(r.netContributionPct).toBeCloseTo((934 / 11984) * 100, 3);
  });

  it('backs out ex-GST taxable values when prices are GST-inclusive', () => {
    const r = computePricing(base);
    expect(r.taxable.sellingExGst).toBe(Math.round(11984 / 1.12));   // 10700
    expect(r.taxable.ssCostExGst).toBe(Math.round(10700 / 1.12));    // 9554
  });

  it('flags a below-floor selling price and clamps max discount at 0', () => {
    const r = computePricing({ ...base, sellingPrice: 11000 });
    expect(r.belowFloor).toBe(true);
    expect(r.maxPermissibleDiscountPaise).toBe(0);
    expect(r.grossMarginPaise).toBe(300);
  });

  it('builds the display waterfall, including retailer price when supplied', () => {
    const r = computePricing({ ...base, retailerPrice: 13782 });
    expect(r.waterfall).toEqual({
      mrp: 19300, retailerPrice: 13782, distributorPrice: 11984, ssPrice: 10700, ssCost: 10700,
    });
  });

  it('treats gstInclusive:false as taxable === inclusive value', () => {
    const r = computePricing({ ...base, gstInclusive: false });
    expect(r.taxable.sellingExGst).toBe(11984);
    expect(r.taxable.ssCostExGst).toBe(10700);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- domain/pricing`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/pricing.ts`**

```ts
import type { Paise } from './money';

export interface PricingInput {
  mrp: Paise | null;
  ssBillingPrice: Paise;
  sellingPrice: Paise;
  floorPrice: Paise;
  gstPct: number;
  gstInclusive: boolean;
  retailerPrice?: Paise | null;
  costInputs?: {
    freight?: Paise; loading?: Paise; salesIncentive?: Paise; samples?: Paise; other?: Paise; scheme?: Paise;
  };
}

export interface PricingResult {
  productCostPaise: Paise;
  grossMarginPaise: Paise;
  grossMarginPct: number;
  netContributionPaise: Paise;
  netContributionPct: number;
  maxPermissibleDiscountPaise: Paise;
  belowFloor: boolean;
  taxable: { sellingExGst: Paise; ssCostExGst: Paise };
  waterfall: { mrp: Paise | null; retailerPrice: Paise | null; distributorPrice: Paise; ssPrice: Paise; ssCost: Paise };
}

const pct = (part: number, whole: number) => (whole === 0 ? 0 : (part / whole) * 100);
const exGst = (amount: Paise, gstPct: number, inclusive: boolean) =>
  inclusive ? Math.round(amount / (1 + gstPct / 100)) : amount;

export function computePricing(input: PricingInput): PricingResult {
  const c = input.costInputs ?? {};
  const productCostPaise = input.ssBillingPrice;
  const grossMarginPaise = input.sellingPrice - productCostPaise;
  const variable =
    (c.freight ?? 0) + (c.scheme ?? 0) + (c.loading ?? 0) +
    (c.salesIncentive ?? 0) + (c.samples ?? 0) + (c.other ?? 0);
  const netContributionPaise = grossMarginPaise - variable;

  return {
    productCostPaise,
    grossMarginPaise,
    grossMarginPct: pct(grossMarginPaise, input.sellingPrice),
    netContributionPaise,
    netContributionPct: pct(netContributionPaise, input.sellingPrice),
    maxPermissibleDiscountPaise: Math.max(0, input.sellingPrice - input.floorPrice),
    belowFloor: input.sellingPrice < input.floorPrice,
    taxable: {
      sellingExGst: exGst(input.sellingPrice, input.gstPct, input.gstInclusive),
      ssCostExGst: exGst(input.ssBillingPrice, input.gstPct, input.gstInclusive),
    },
    waterfall: {
      mrp: input.mrp,
      retailerPrice: input.retailerPrice ?? null,
      distributorPrice: input.sellingPrice,
      ssPrice: input.ssBillingPrice,
      ssCost: productCostPaise,
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- domain/pricing` → PASS (6 tests). Full `npm test` twice. `tsc` + `lint` clean.

- [ ] **Step 5: Commit**

```bash
git add src/domain/pricing.ts tests/domain/pricing.test.ts docs/BUILD-LOG.md
git commit -m "feat: pricing calculator domain — waterfall, gross/net margins, ex-GST taxable"
```

---

### Task 5: Price recommendation engine domain — `recommendPricing`

**Files:**
- Create/replace: `src/domain/pricing-recommend.ts` (may already hold a `PricingBands` stub from Task 3 — replace with the full module)
- Create: `tests/domain/pricing-recommend.test.ts`

**Interfaces:** see Shared Types (`PricingBands`, `RecommendInput`, `RecommendResult`).

**Rules (spec §5.3):**
- `floorPrice = round(ssBillingPrice * (1 + (volatile ? volatileFloorBufferPct : ssMinMarginPct) / 100))`.
- `distributorPrice = round(ssBillingPrice * (1 + ssNormalMarginPct / 100))`.
- `targetPrice = round(ssBillingPrice * (1 + ssTargetMarginPct / 100))`.
- `retailerPrice = round(distributorPrice * (1 + distributorMarginPct / 100))` (PTR — distributor's own margin on top).
- `mrpSuggestion`: `null` when `input.mrp != null`; otherwise `round(retailerPrice * (1 + retailerMarginPct / 100))`.
- `marginAtEach.{floorPct,distributorPct,targetPct}` = `(price - ssBillingPrice) / ssBillingPrice * 100`.
- `rationale` — one entry per recommended field, plain English, e.g.:
  - `{ field: 'floorPrice', valuePaise: <n>, why: 'cost + 8% minimum super-stockist margin; below this needs admin override' }` (say `12% volatile-commodity buffer` and mention volatility when `volatile`).
  - `{ field: 'distributorPrice', ..., why: 'cost + 12%; your gross ₹X/unit (Y%)' }` — include the per-unit gross paise and pct.
  - `{ field: 'targetPrice', ..., why: 'cost + 18%, your standard margin goal' }`.
  - `{ field: 'retailerPrice', ..., why: 'distributor + 15% distributor margin; retailer then earns Z% to MRP ₹M' }` when `mrp != null`, else `'... ; MRP suggested at ₹S'`.
  - **Chain sanity check:** when `mrp != null`, compute `retailerToMrpPct = (mrp - retailerPrice) / retailerPrice * 100`. If `retailerToMrpPct < retailerMarginPct`, push `{ field: 'mrpCheck', valuePaise: mrp, why: 'MRP ₹M only supports R% retailer margin at this distributor price — below the R2% target' }`.
- Formatting inside `why`: rupees as `₹${(paise/100).toFixed(2)}` — this module may do string formatting but must stay pure (no `Intl`/framework; a local `rupees` helper is fine).

- [ ] **Step 1: Write the failing test**

Create `tests/domain/pricing-recommend.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { recommendPricing, type PricingBands } from '@/domain/pricing-recommend';

const bands: PricingBands = {
  ssMinMarginPct: 8, ssNormalMarginPct: 12, ssTargetMarginPct: 18,
  distributorMarginPct: 15, retailerMarginPct: 25, volatileFloorBufferPct: 12,
};

describe('recommendPricing', () => {
  it('matches the spec §5.3 worked example (Almond 100g, non-volatile bands)', () => {
    const r = recommendPricing({ ssBillingPrice: 10700, mrp: 19300, gstPct: 12, volatile: false, bands });
    expect(r.floorPrice).toBe(11556);          // 10700 * 1.08
    expect(r.distributorPrice).toBe(11984);    // 10700 * 1.12
    expect(r.targetPrice).toBe(12626);         // 10700 * 1.18
    expect(r.retailerPrice).toBe(Math.round(11984 * 1.15));   // 13782
    expect(r.mrpSuggestion).toBeNull();        // MRP present
    expect(r.marginAtEach.floorPct).toBeCloseTo(8, 5);
    expect(r.marginAtEach.distributorPct).toBeCloseTo(12, 5);
    expect(r.marginAtEach.targetPct).toBeCloseTo(18, 5);
    expect(r.rationale.map((x) => x.field)).toEqual(
      expect.arrayContaining(['floorPrice', 'distributorPrice', 'targetPrice', 'retailerPrice']),
    );
    // MRP 19300 vs retailer 13782 → ~40% headroom, well above the 25% target → no mrpCheck flag
    expect(r.rationale.find((x) => x.field === 'mrpCheck')).toBeUndefined();
  });

  it('uses the wider volatile buffer for the floor', () => {
    const r = recommendPricing({ ssBillingPrice: 10000, mrp: null, gstPct: 12, volatile: true, bands });
    expect(r.floorPrice).toBe(11200);          // 10000 * 1.12 (buffer), not * 1.08
    expect(r.rationale.find((x) => x.field === 'floorPrice')!.why).toMatch(/volatile/i);
  });

  it('suggests an MRP when none is given', () => {
    const r = recommendPricing({ ssBillingPrice: 10000, mrp: null, gstPct: 5, volatile: false, bands });
    const expectedRetailer = Math.round(Math.round(10000 * 1.12) * 1.15);
    expect(r.retailerPrice).toBe(expectedRetailer);
    expect(r.mrpSuggestion).toBe(Math.round(expectedRetailer * 1.25));
  });

  it('flags an MRP that is too low to support the retailer margin', () => {
    // cost 10000 → distributor 11200 → retailer 12880; an MRP of 13000 gives only ~0.9% headroom
    const r = recommendPricing({ ssBillingPrice: 10000, mrp: 13000, gstPct: 5, volatile: false, bands });
    const flag = r.rationale.find((x) => x.field === 'mrpCheck');
    expect(flag).toBeDefined();
    expect(flag!.why).toMatch(/only supports/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- domain/pricing-recommend`
Expected: FAIL — `recommendPricing` not exported (module may exist as a stub type only).

- [ ] **Step 3: Implement `src/domain/pricing-recommend.ts`**

```ts
import type { Paise } from './money';

export interface PricingBands {
  ssMinMarginPct: number;
  ssNormalMarginPct: number;
  ssTargetMarginPct: number;
  distributorMarginPct: number;
  retailerMarginPct: number;
  volatileFloorBufferPct: number;
}

export interface RecommendInput {
  ssBillingPrice: Paise;
  mrp: Paise | null;
  gstPct: number;
  volatile: boolean;
  bands: PricingBands;
}

export interface RecommendResult {
  floorPrice: Paise;
  distributorPrice: Paise;
  targetPrice: Paise;
  retailerPrice: Paise;
  mrpSuggestion: Paise | null;
  rationale: { field: string; valuePaise: Paise | null; why: string }[];
  marginAtEach: { floorPct: number; distributorPct: number; targetPct: number };
}

const markup = (base: Paise, pct: number): Paise => Math.round(base * (1 + pct / 100));
const rupees = (p: Paise) => `₹${(p / 100).toFixed(2)}`;
const marginPct = (price: Paise, cost: Paise) => (cost === 0 ? 0 : ((price - cost) / cost) * 100);

export function recommendPricing(input: RecommendInput): RecommendResult {
  const { ssBillingPrice: cost, mrp, volatile, bands } = input;
  const floorPct = volatile ? bands.volatileFloorBufferPct : bands.ssMinMarginPct;

  const floorPrice = markup(cost, floorPct);
  const distributorPrice = markup(cost, bands.ssNormalMarginPct);
  const targetPrice = markup(cost, bands.ssTargetMarginPct);
  const retailerPrice = markup(distributorPrice, bands.distributorMarginPct);
  const mrpSuggestion = mrp == null ? markup(retailerPrice, bands.retailerMarginPct) : null;

  const distGrossPaise = distributorPrice - cost;
  const rationale: RecommendResult['rationale'] = [
    {
      field: 'floorPrice',
      valuePaise: floorPrice,
      why: volatile
        ? `cost + ${floorPct}% volatile-commodity buffer; below this needs admin override`
        : `cost + ${floorPct}% minimum super-stockist margin; below this needs admin override`,
    },
    {
      field: 'distributorPrice',
      valuePaise: distributorPrice,
      why: `cost + ${bands.ssNormalMarginPct}%; your gross ${rupees(distGrossPaise)}/unit (${marginPct(distributorPrice, cost).toFixed(1)}%)`,
    },
    {
      field: 'targetPrice',
      valuePaise: targetPrice,
      why: `cost + ${bands.ssTargetMarginPct}%, your standard margin goal`,
    },
    {
      field: 'retailerPrice',
      valuePaise: retailerPrice,
      why:
        mrp != null
          ? `distributor + ${bands.distributorMarginPct}% distributor margin; retailer then earns ${(((mrp - retailerPrice) / retailerPrice) * 100).toFixed(0)}% to MRP ${rupees(mrp)}`
          : `distributor + ${bands.distributorMarginPct}% distributor margin; MRP suggested at ${rupees(mrpSuggestion as Paise)}`,
    },
  ];

  if (mrp != null) {
    const retailerToMrpPct = ((mrp - retailerPrice) / retailerPrice) * 100;
    if (retailerToMrpPct < bands.retailerMarginPct) {
      rationale.push({
        field: 'mrpCheck',
        valuePaise: mrp,
        why: `MRP ${rupees(mrp)} only supports ${retailerToMrpPct.toFixed(0)}% retailer margin at this distributor price — below the ${bands.retailerMarginPct}% target`,
      });
    }
  }

  return {
    floorPrice,
    distributorPrice,
    targetPrice,
    retailerPrice,
    mrpSuggestion,
    rationale,
    marginAtEach: {
      floorPct: marginPct(floorPrice, cost),
      distributorPct: marginPct(distributorPrice, cost),
      targetPct: marginPct(targetPrice, cost),
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- domain/pricing-recommend` → PASS (4 tests). Full `npm test` twice. `tsc` + `lint` clean.

- [ ] **Step 5: Commit**

```bash
git add src/domain/pricing-recommend.ts tests/domain/pricing-recommend.test.ts docs/BUILD-LOG.md
git commit -m "feat: price recommendation engine — band-driven floor/distributor/target/retailer + rationale"
```
If Task 3 left a `PricingBands` stub here, note in the BUILD-LOG that this task replaced it with the full module.

---

### Task 6: Permissions + product service (list / get / update / prices / recommend / redaction)

**Files:**
- Modify: `src/server/auth/permissions.ts`
- Modify: `tests/domain/permissions.test.ts`
- Create: `src/server/services/product.ts`
- Create: `tests/services/product.test.ts`

**Interfaces:**
- Consumes: `db`, `assertCan`, `can`, `stripFinancial`, `writeAudit`, `patchOnly`, `getConfig`, `bandsForCategory`, `computePricing`, `recommendPricing`, `categories`, `products`, `productPrices`, `AppUser`, `FF_CATALOGUE` (Task 1), `CONFIG_DEFAULTS`.
- Produces:
  - **Permissions** — add to the `Action` union and the matrices: `'product.view'` (OWNER + SALES), `'product.edit'` (OWNER only), `'pricing.recommend'` (OWNER only).
  - **`src/server/services/product.ts`:**
    - `type ProductRow = typeof products.$inferSelect`
    - `type ProductPriceRow = typeof productPrices.$inferSelect`
    - `type ProductWithPrice = ProductRow & { price: ProductPriceRow | null; categoryName: string | null }`
    - `PRODUCT_FINANCIAL_FIELDS: (keyof ProductPriceRow)[] = ['ssBillingPrice', 'floorPrice', 'targetPrice']`
    - `redactPrice(user: AppUser, row: ProductPriceRow | null): ProductPriceRow | null` — `null` passthrough; else `stripFinancial(user, row, PRODUCT_FINANCIAL_FIELDS)`
    - `redactProduct(user, row: ProductWithPrice): ProductWithPrice` — `{ ...row, price: redactPrice(user, row.price) }`
    - `redactProducts(user, rows): ProductWithPrice[]`
    - `listCategories(orgId): Promise<(typeof categories.$inferSelect)[]>` — not deleted, active, order by name
    - `listProducts(orgId, opts?: { categoryId?: string; q?: string; activeOnly?: boolean; limit?: number; offset?: number }): Promise<ProductWithPrice[]>` — LEFT JOIN `productPrices` on `productId`, LEFT JOIN `categories` for `categoryName`; filter `isNull(products.deletedAt)`; `q` ILIKE on `name`/`skuCode`; `activeOnly` → `eq(products.active, true)`; order `name asc`; default limit 100. **Caller redacts** (this returns full rows so `updatePrices`/recommend can use them; screens wrap in `redactProducts`).
    - `getProduct(orgId, id): Promise<ProductWithPrice | null>` — org-scoped, `isNull(deletedAt)`.
    - `updateProduct(user, id, input: Partial<ProductInput>): Promise<ProductRow>` — `assertCan(user, 'product.edit')`; load org-scoped `before` (throw `'not found'`); `patchOnly(input, productSchema.partial().parse(input))`; update; `writeAudit(user, 'product', id, 'update', before, row)`. `productSchema` (zod v4) validates: `name` (2–160), `gstPct` (int 0–28), `active` (bool), `volatilePrice` (bool), `shelfLifeDays`/`reorderLevel`/`minStock`/`maxStock`/`preferredStock` (int ≥ 0), `mrp` (int ≥ 0 → paise). Put `productSchema` + `type ProductInput = z.input<typeof productSchema>` in `product.ts` (not `@/lib/schemas`, to keep that file lead-focused — or add to `@/lib/schemas`; pick `@/lib/schemas` for consistency and export `PRODUCT_UNITS`).
    - `updatePrices(user, productId, patch: { ssBillingPrice?; distributorPrice?; floorPrice?; targetPrice?; retailerPrice?|null; mrp?|null }): Promise<ProductPriceRow>` — `assertCan(user, 'product.edit')`; load org-scoped price row (throw `'not found'`); validate every provided value is a finite integer ≥ 0 (throw `'invalid price'` otherwise); set the provided fields + `manualOverride: true`, `overrideBy: user.id`, `overrideAt: new Date()`, `updatedAt: new Date()`; `writeAudit(user, 'product_price', productId, 'override', before, row)`.
    - `computeFor(orgId, productId, sellingPrice?: Paise): Promise<{ product: ProductWithPrice; pricing: import('@/domain/pricing').PricingResult; recommend: import('@/domain/pricing-recommend').RecommendResult } | null>` — loads the product+price+category, reads `pricesGstInclusive` from config, `bandsForCategory(orgId, categoryName)`, calls `computePricing({ mrp, ssBillingPrice, sellingPrice: sellingPrice ?? price.distributorPrice, floorPrice: price.floorPrice, gstPct, gstInclusive, retailerPrice: price.retailerPrice })` and `recommendPricing({ ssBillingPrice, mrp, gstPct, volatile: product.volatilePrice, bands })`. Returns `null` if the product or its price row is missing.
    - `resetToRecommended(user, productId): Promise<ProductPriceRow>` — `assertCan(user, 'pricing.recommend')`; load price + product + category; `recommendPricing(...)`; write `distributorPrice`/`floorPrice`/`targetPrice`/`retailerPrice` (+ `mrp` on `products` only if it was null and `mrpSuggestion` non-null — **do not** overwrite an existing MRP); set `manualOverride: false`, `isDemoAssumption: false`, `overrideBy: user.id`, `overrideAt: new Date()`; `writeAudit(user, 'product_price', productId, 'reset_to_recommended', before, row)`.
    - `regenerateAllRecommended(user, orgId, opts?: { onlyUnoverridden?: boolean }): Promise<{ updated: number }>` — `assertCan(user, 'pricing.recommend')`; for every non-deleted product with a price row (optionally only where `manualOverride === false`), recompute and write recommended distributor/floor/target/retailer (never touch a set MRP); one `writeAudit(user, 'config', 'regenerate_prices', null, { updated, onlyUnoverridden })` summary row (not per product — YAGNI). Returns the count.

- [ ] **Step 1: Write the failing permission test** — add to `tests/domain/permissions.test.ts`:
```ts
it('gates product actions by role', () => {
  expect(can(owner, 'product.view')).toBe(true);
  expect(can(owner, 'product.edit')).toBe(true);
  expect(can(owner, 'pricing.recommend')).toBe(true);
  expect(can(sales, 'product.view')).toBe(true);
  expect(can(sales, 'product.edit')).toBe(false);
  expect(can(sales, 'pricing.recommend')).toBe(false);
});
```

- [ ] **Step 2: Add the actions to `src/server/auth/permissions.ts`**

Add `'product.view' | 'product.edit' | 'pricing.recommend'` to the `Action` union. Add all three to `OWNER_ACTIONS`; add only `'product.view'` to `SALES_ACTIONS`. Run `npm test -- permissions` → PASS.

- [ ] **Step 3: Write the failing service test**

Create `tests/services/product.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { categories, products, productPrices } from '@/server/db/schema/product';
import { auditLog } from '@/server/db/schema/audit';
import {
  listProducts, getProduct, updatePrices, resetToRecommended, regenerateAllRecommended,
  computeFor, redactProduct, PRODUCT_FINANCIAL_FIELDS,
} from '@/server/services/product';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'u-owner', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });
const sales = (orgId: string): AppUser => ({ id: 'u-sales', email: 's', name: 'S', role: 'SALES', employeeId: null, orgId });

async function seedOneSku(orgId: string, over: Partial<typeof productPrices.$inferInsert> = {}) {
  const [cat] = await testDb.insert(categories).values({ orgId, name: 'Dry Fruits' }).returning();
  const [p] = await testDb.insert(products).values({
    orgId, categoryId: cat.id, skuCode: 'DF-ALMOND-100G', name: 'Almond', packLabel: '100g',
    packGrams: 100, gstPct: 12, mrp: 19300, volatilePrice: false,
  }).returning();
  const [pr] = await testDb.insert(productPrices).values({
    orgId, productId: p.id, ssBillingPrice: 10700, distributorPrice: 11984, floorPrice: 11556,
    targetPrice: 12626, retailerPrice: 13782, mrp: 19300, ...over,
  }).returning();
  return { catId: cat.id, product: p, price: pr };
}

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('product service', () => {
  it('lists products with their price + category, and redacts cost fields for SALES', async () => {
    const { orgId } = await seedBase();
    await seedOneSku(orgId);
    const [row] = await listProducts(orgId, { q: 'almond' });
    expect(row.categoryName).toBe('Dry Fruits');
    expect(row.price?.ssBillingPrice).toBe(10700);

    const redacted = redactProduct(sales(orgId), row);
    for (const f of PRODUCT_FINANCIAL_FIELDS) expect(redacted.price).not.toHaveProperty(f as string);
    expect(redacted.price).toHaveProperty('distributorPrice');       // SALES keeps this
    const ownerRow = redactProduct(owner(orgId), row);
    expect(ownerRow.price?.ssBillingPrice).toBe(10700);              // OWNER keeps everything
  });

  it('computeFor returns the pricing waterfall and recommendation', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedOneSku(orgId);
    const r = (await computeFor(orgId, product.id))!;
    expect(r.pricing.grossMarginPaise).toBe(1284);                   // 11984 - 10700
    expect(r.recommend.distributorPrice).toBe(11984);               // 10700 * 1.12
  });

  it('updatePrices sets manual_override + writes an audit row; SALES is forbidden', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedOneSku(orgId);
    await expect(updatePrices(sales(orgId), product.id, { distributorPrice: 12000 })).rejects.toThrow('forbidden');
    const updated = await updatePrices(owner(orgId), product.id, { distributorPrice: 12500 });
    expect(updated.distributorPrice).toBe(12500);
    expect(updated.manualOverride).toBe(true);
    expect(updated.overrideBy).toBe('u-owner');
    const audits = await testDb.select().from(auditLog).where(eq(auditLog.entityType, 'product_price'));
    expect(audits.length).toBe(1);
  });

  it('rejects a non-integer / negative price', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedOneSku(orgId);
    await expect(updatePrices(owner(orgId), product.id, { distributorPrice: -1 })).rejects.toThrow('invalid price');
    await expect(updatePrices(owner(orgId), product.id, { floorPrice: 10.5 as never })).rejects.toThrow('invalid price');
  });

  it('resetToRecommended restores the band values and clears manual_override', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedOneSku(orgId, { distributorPrice: 99999, manualOverride: true });
    const reset = await resetToRecommended(owner(orgId), product.id);
    expect(reset.distributorPrice).toBe(11984);
    expect(reset.manualOverride).toBe(false);
  });

  it('regenerateAllRecommended can skip manually-overridden rows', async () => {
    const { orgId } = await seedBase();
    const a = await seedOneSku(orgId);
    // a second sku, manually overridden
    const [p2] = await testDb.insert(products).values({
      orgId, categoryId: a.catId, skuCode: 'DF-CASHEW-100G', name: 'Cashew', packLabel: '100g', gstPct: 12, mrp: 15500,
    }).returning();
    await testDb.insert(productPrices).values({
      orgId, productId: p2.id, ssBillingPrice: 8600, distributorPrice: 90000, floorPrice: 9288,
      targetPrice: 10148, manualOverride: true,
    });
    await testDb.update(productPrices).set({ distributorPrice: 88888 }).where(eq(productPrices.productId, a.product.id));

    const res = await regenerateAllRecommended(owner(orgId), orgId, { onlyUnoverridden: true });
    expect(res.updated).toBe(1);
    const [pr1] = await testDb.select().from(productPrices).where(eq(productPrices.productId, a.product.id));
    const [pr2] = await testDb.select().from(productPrices).where(eq(productPrices.productId, p2.id));
    expect(pr1.distributorPrice).toBe(11984);        // regenerated
    expect(pr2.distributorPrice).toBe(90000);        // left alone (overridden)
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- services/product`
Expected: FAIL — `@/server/services/product` not found.

- [ ] **Step 5: Implement `src/server/services/product.ts`**

Implement every export from the Interfaces block. Key points:
- `listProducts` builds a `conds` array (`eq(products.orgId, orgId)`, `isNull(products.deletedAt)`, optional filters) exactly like `listLeads` in `lead.ts`; `leftJoin(productPrices, eq(productPrices.productId, products.id))`, `leftJoin(categories, eq(categories.id, products.categoryId))`; select the product columns + `price: {...}` (or select `productPrices` whole and reshape) + `categoryName: categories.name`.
- `updateProduct` mirrors `updateLead` (org-scoped `before`, `patchOnly`, `writeAudit`).
- `computeFor` reads config once (`getConfig(orgId, 'pricesGstInclusive')`, `bandsForCategory(orgId, categoryName)`).
- `resetToRecommended` / `regenerateAllRecommended` use `recommendPricing`. For `regenerateAllRecommended`, load all `{product, price, categoryName}` triples in one query, loop, and issue updates (a plain loop of `db.update` is fine at ~184 rows — YAGNI, no bulk-CTE).
- Add `productSchema` + `PRODUCT_UNITS` to `src/lib/schemas.ts` (append, keep territory/lead/etc exports intact); `type ProductInput = z.input<typeof productSchema>` local to `product.ts`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- services/product` and `npm test -- permissions` → PASS. Full `npm test` twice — stable. `tsc` + `lint` clean.

- [ ] **Step 7: Commit**

```bash
git add src/server/auth/permissions.ts src/server/services/product.ts src/lib/schemas.ts tests/domain/permissions.test.ts tests/services/product.test.ts docs/BUILD-LOG.md
git commit -m "feat: product service (list/get/update/prices/recommend) + cost-field redaction + product perms"
```
Append a PONYTAIL-DEBT row: `PRODUCT_FINANCIAL_FIELDS` is fixed at 3 names — revisit if M2b/quotations add more cost columns to the product read path.

---

### Task 7: F&F catalogue seed

**Files:**
- Create: `src/server/db/seed-catalogue.ts`
- Modify: `src/server/db/seed.ts` (CLI wiring only)
- Modify: `package.json` (add `db:seed:catalogue` script)
- Create: `tests/services/seed-catalogue.test.ts`

**Interfaces:**
- Consumes: `FF_CATALOGUE`, `seedBase`, `categories`/`products`/`productPrices`, `recommendPricing`, `CONFIG_DEFAULTS.pricingBands`, `db`.
- Produces:
  - `seedCatalogue(orgId?: string): Promise<{ categories: number; products: number }>` — resolves `orgId` via `seedBase()` when omitted. **Idempotent** by `(orgId, skuCode)`: skip a product that already exists; skip if `products` already has ≥ 150 rows for the org (fast bail). For each `FF_CATALOGUE.skus[i]`:
    - upsert the category by name (create if absent), `active: true`.
    - `skuCode` = `slug(category) + '-' + slug(product) + '-' + slug(packLabel)` uppercased, e.g. `DRY-FRUITS-ALMOND-100G` (a local `slug()` that upppercases, replaces non-alphanumerics with `-`, collapses repeats, trims). Guarantee uniqueness — if a collision somehow occurs, suffix `-2`.
    - insert `products`: `name` = `${product} ${packLabel}` (e.g. `Almond 100g`), `categoryId`, `packLabel`, `packGrams`, `unit`, `mrp = mrpPaise`, `gstPct = FF_CATALOGUE.gstPctByCategory[category]`, `volatilePrice = volatile`, `isDemo: false` (this is real catalogue data), sensible stock defaults (`reorderLevel` 0, etc. — leave at column defaults).
    - compute `recommendPricing({ ssBillingPrice: currentPaise, mrp: mrpPaise, gstPct, volatile, bands: CONFIG_DEFAULTS.pricingBands })` and insert `productPrices`: `ssBillingPrice = currentPaise`, `distributorPrice`/`floorPrice`/`targetPrice`/`retailerPrice` from the recommendation, `mrp = mrpPaise`, `isDemoAssumption: true` (the three set prices are band-derived, not real), `manualOverride: false`.
  - CLI: `npm run db:seed:catalogue` runs `seedBase().then(({orgId}) => seedCatalogue(orgId))`. Also have the existing `npm run db:seed` call `seedCatalogue` after `seedDemo` (so the demo/dev DB gets the real catalogue too).

- [ ] **Step 1: Write the failing test**

Create `tests/services/seed-catalogue.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { seedCatalogue } from '@/server/db/seed-catalogue';
import { categories, products, productPrices } from '@/server/db/schema/product';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('seedCatalogue', () => {
  it('loads all 184 SKUs with a 1:1 price row and real ss cost', async () => {
    const { orgId } = await seedBase();
    const res = await seedCatalogue(orgId);
    expect(res.products).toBe(184);
    expect(res.categories).toBe(5);

    const prodRows = await testDb.select().from(products).where(eq(products.orgId, orgId));
    expect(prodRows).toHaveLength(184);
    expect(prodRows.every((p) => p.isDemo === false)).toBe(true);

    const priceRows = await testDb.select().from(productPrices).where(eq(productPrices.orgId, orgId));
    expect(priceRows).toHaveLength(184);
    expect(priceRows.every((pr) => pr.isDemoAssumption === true)).toBe(true);
    expect(priceRows.every((pr) => pr.floorPrice > pr.ssBillingPrice)).toBe(true);
    expect(priceRows.every((pr) => pr.targetPrice >= pr.distributorPrice)).toBe(true);
  });

  it('sets Almond 100g to the sheet cost ₹107 and a 12% GST', async () => {
    const { orgId } = await seedBase();
    await seedCatalogue(orgId);
    const [almond] = await testDb.select().from(products)
      .where(and(eq(products.orgId, orgId), eq(products.name, 'Almond 100g')));
    expect(almond.gstPct).toBe(12);
    expect(almond.volatilePrice).toBe(true);
    const [pr] = await testDb.select().from(productPrices).where(eq(productPrices.productId, almond.id));
    expect(pr.ssBillingPrice).toBe(10700);
    expect(pr.mrp).toBe(19300);
  });

  it('is idempotent — a second run adds nothing', async () => {
    const { orgId } = await seedBase();
    await seedCatalogue(orgId);
    const res2 = await seedCatalogue(orgId);
    expect(res2.products).toBe(0);
    expect(await testDb.select().from(products).where(eq(products.orgId, orgId))).toHaveLength(184);
  });
});
```
> `res.products` / `res.categories` are the counts **created this run** (0 on a repeat run).

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- seed-catalogue`
Expected: FAIL — `@/server/db/seed-catalogue` not found.

- [ ] **Step 3: Implement `src/server/db/seed-catalogue.ts`** per the Interfaces block. Use `FF_CATALOGUE` and `recommendPricing`. Keep it a plain loop; batch-insert per category is fine but not required.

- [ ] **Step 4: Wire the CLI**

`package.json` scripts: add `"db:seed:catalogue": "DOTENV_CONFIG_PATH=.env.local tsx -r dotenv/config src/server/db/seed-catalogue.ts"`. Give `seed-catalogue.ts` a CLI guard (`if (process.argv[1]?.endsWith('seed-catalogue.ts'))` → `seedBase().then(({orgId}) => seedCatalogue(orgId)).then((r) => { console.log(r); process.exit(0); })`). In `src/server/db/seed.ts`'s existing `db:seed` CLI branch, call `await seedCatalogue(orgId)` after `seedDemo()`.
> **Naming collision guard:** `seed-catalogue.ts` ends in neither `seed.ts` (good — no collision with `seed.ts`'s guard) — but double-check `seed.ts`'s guard is `endsWith('seed.ts')` and would NOT match `seed-catalogue.ts` (it wouldn't). Note it in the report.

- [ ] **Step 5: Run the tests + a real seed**

Run: `npm test -- seed-catalogue` → PASS. Full `npm test` twice. Then:
```bash
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/devbrowse' npm run db:seed:catalogue
```
Expected: `{ categories: 5, products: 184 }` (or `0` if already seeded). `tsc` + `lint` clean.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/seed-catalogue.ts src/server/db/seed.ts package.json tests/services/seed-catalogue.test.ts docs/BUILD-LOG.md
git commit -m "feat: F&F catalogue seed — 184 real SKUs, band-derived prices flagged is_demo_assumption"
```

---

### Task 8: Products & Pricing screens + nav

**Files:**
- Create: `src/app/(app)/products/page.tsx`, `src/app/(app)/products/[id]/page.tsx`, `src/app/(app)/products/actions.ts`, `src/app/(app)/products/pricing-panel.tsx`
- Modify: `src/components/app-nav.tsx` (add the nav item)
- Create: `tests/e2e/products.spec.ts` (`describe.skip`)

**Interfaces:**
- Consumes: `requireUser`, `can`, `listProducts`, `listCategories`, `getProduct`, `computeFor`, `redactProducts`, `redactProduct` (Task 6), `formatINR`, plus the actions below.
- Produces:
  - `src/app/(app)/products/actions.ts`:
    - `savePrices(productId: string, formData: FormData)` — `requireUser`; build the patch by reading only the fields present & non-empty in `formData` (`ssBillingPrice`, `distributorPrice`, `floorPrice`, `targetPrice`, `retailerPrice`) as **rupees → paise via `rupees(Number(...))`**; `updatePrices(user, productId, patch)`; `revalidatePath('/products/${productId}')`.
    - `resetPrices(productId: string)` — `requireUser`; `resetToRecommended(user, productId)`; `revalidatePath('/products/${productId}')`.
    - `regenerateAll(formData: FormData)` — `requireUser`; `regenerateAllRecommended(user, user.orgId, { onlyUnoverridden: formData.get('onlyUnoverridden') === 'on' })`; `revalidatePath('/', 'layout')`.
  - `NAV_ITEMS` gains `{ href: '/products', label: 'Products' }` (visible to both roles — `product.view` is granted to SALES). Place it after "Territories".
  - `pricing-panel.tsx` — a small `'use client'` component: props `{ recommend: RecommendResult; current: {distributorPrice; floorPrice; targetPrice; retailerPrice|null; ssBillingPrice?|undefined}; canEdit: boolean; savePrices: (fd: FormData)=>void; resetPrices: ()=>void }`. Renders a table with columns **Field | Recommended | Current | (override input if canEdit)**, the `recommend.rationale` list below it, a "Reset to recommended" button (calls `resetPrices`), and a `<form action={savePrices}>` wrapping the override inputs (rupee values, `step="0.01"`). Hide the `ssBillingPrice` row entirely when it is `undefined` (SALES).

- [ ] **Step 1: Write the failing e2e spec**

Create `tests/e2e/products.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

// ponytail: needs `supabase start` (Docker) for a real login — run locally / in CI.
test.describe.skip('products & pricing', () => {
  async function login(page, email, password) {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL('/');
  }

  test('owner sees the catalogue with cost prices and can override one', async ({ page }) => {
    await login(page, 'owner@example.com', 'password123');
    await page.goto('/products');
    await expect(page.getByRole('heading', { name: /products/i })).toBeVisible();
    await page.getByRole('link', { name: /Almond 100g/ }).click();
    await expect(page.getByText(/recommended/i)).toBeVisible();
    await page.getByLabel(/distributor price/i).fill('130');
    await page.getByRole('button', { name: /save prices/i }).click();
    await expect(page.getByText(/₹130\.00/)).toBeVisible();
  });

  test('sales rep sees the catalogue but no cost columns', async ({ page }) => {
    await login(page, 'sales@example.com', 'password123');
    await page.goto('/products');
    await expect(page.getByText(/super.?stockist cost/i)).toHaveCount(0);
    await expect(page.getByText(/floor price/i)).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run it to verify it's skipped/pending**

Run: `npm run e2e -- products`
Expected: the suite reports as **skipped** (not failed).

- [ ] **Step 3: Implement the list page**

`src/app/(app)/products/page.tsx` — server component:
```tsx
import Link from 'next/link';
import { requireUser } from '@/server/auth/session';
import { listProducts, listCategories, redactProducts } from '@/server/services/product';
import { formatINR } from '@/domain/money';

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  const user = await requireUser();
  const { q, cat } = await searchParams;
  const [cats, rowsRaw] = await Promise.all([
    listCategories(user.orgId),
    listProducts(user.orgId, { q, categoryId: cat }),
  ]);
  const rows = redactProducts(user, rowsRaw);
  const showCost = user.role === 'OWNER';
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Products &amp; Pricing</h1>
      <form className="flex flex-wrap gap-2" action="/products">
        <input name="q" defaultValue={q} placeholder="Search name / SKU" className="rounded border px-3 py-1.5 text-sm" />
        <select name="cat" defaultValue={cat} className="rounded border px-2 py-1.5 text-sm">
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="rounded border px-3 py-1.5 text-sm">Filter</button>
      </form>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-neutral-500">
          <th className="py-2">Product</th><th>Category</th><th>MRP</th>
          {showCost && <th>SS cost</th>}
          <th>Distributor</th>{showCost && <th>Floor</th>}{showCost && <th>Target</th>}
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2"><Link href={`/products/${r.id}`} className="text-blue-700 hover:underline">{r.name}</Link>
                <div className="text-neutral-400">{r.skuCode}{r.volatilePrice ? ' · volatile' : ''}</div></td>
              <td>{r.categoryName}</td>
              <td>{r.mrp != null ? formatINR(r.mrp) : '—'}</td>
              {showCost && <td>{r.price ? formatINR((r.price as { ssBillingPrice: number }).ssBillingPrice) : '—'}</td>}
              <td>{r.price ? formatINR(r.price.distributorPrice) : '—'}</td>
              {showCost && <td>{r.price ? formatINR((r.price as { floorPrice: number }).floorPrice) : '—'}</td>}
              {showCost && <td>{r.price ? formatINR((r.price as { targetPrice: number }).targetPrice) : '—'}</td>}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-neutral-400">No products. Run `npm run db:seed:catalogue`.</td></tr>}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 4: Implement the detail page + pricing panel + actions**

- `src/app/(app)/products/actions.ts` — the three actions from Interfaces. `savePrices` example:
```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { updatePrices, resetToRecommended, regenerateAllRecommended } from '@/server/services/product';
import { rupees } from '@/domain/money';

const PRICE_FIELDS = ['ssBillingPrice', 'distributorPrice', 'floorPrice', 'targetPrice', 'retailerPrice'] as const;

export async function savePrices(productId: string, formData: FormData) {
  const user = await requireUser();
  const patch: Record<string, number> = {};
  for (const f of PRICE_FIELDS) {
    const v = formData.get(f);
    if (v !== null && v !== '') patch[f] = rupees(Number(v));
  }
  await updatePrices(user, productId, patch);
  revalidatePath(`/products/${productId}`);
}

export async function resetPrices(productId: string) {
  const user = await requireUser();
  await resetToRecommended(user, productId);
  revalidatePath(`/products/${productId}`);
}

export async function regenerateAll(formData: FormData) {
  const user = await requireUser();
  await regenerateAllRecommended(user, user.orgId, { onlyUnoverridden: formData.get('onlyUnoverridden') === 'on' });
  revalidatePath('/', 'layout');
}
```
- `src/app/(app)/products/[id]/page.tsx` — server component: `requireUser`; `const data = await computeFor(user.orgId, id)`; `notFound()` if null; redact for display (`redactProduct(user, data.product)`); render:
  - a **Fields** card (name, category, pack, GST %, MRP, `volatilePrice`, `active`) — read-only in M2a unless `can(user, 'product.edit')`, in which case a small form calling a `saveProduct` action (add it to `actions.ts`, mirrors `savePrices`, calls `updateProduct`). Keep it minimal — name / gstPct / volatilePrice / active only.
  - the **`<PricingPanel>`** with `recommend={data.recommend}`, `current={{ distributorPrice, floorPrice (owner only), targetPrice (owner only), retailerPrice, ssBillingPrice (owner only) }}`, `canEdit={can(user, 'product.edit')}`, actions bound with `id`.
  - a **waterfall** display from `data.pricing.waterfall` + `data.pricing` margins (`formatINR` + `%.toFixed(1)`), and the `belowFloor` flag shown red if set.
- `src/app/(app)/products/pricing-panel.tsx` — the `'use client'` table described in Interfaces.

- [ ] **Step 5: Add the nav item**

`src/components/app-nav.tsx` — add `{ href: '/products', label: 'Products' }` to `NAV_ITEMS` after the Territories entry. Its `visibleNavItems` filter already handles role via `ownerOnly` — leave `ownerOnly` unset so SALES sees it. Extend `tests/domain/nav.test.ts`: `visibleNavItems('SALES')` includes `Products`.

- [ ] **Step 6: Verify**

Run `npm test` (full, twice) — green (nav test updated). `npm run e2e -- products` — skipped. `tsc` + `lint` + `npm run build` clean. `npm run dev` (:3000): as the dev OWNER open `/products` — 184 rows, cost columns visible; open Almond 100g — recommended-vs-current table + rationale + waterfall render; override the distributor price, Save, see it change and "manual override" reflected; Reset to recommended puts it back.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/products" src/components/app-nav.tsx tests/e2e/products.spec.ts tests/domain/nav.test.ts docs/BUILD-LOG.md docs/PONYTAIL-DEBT.md
git commit -m "feat: Products & Pricing screens — catalogue list, per-SKU calculator, recommended-vs-current overrides"
```

---

### Task 9: Settings — pricing bands form + regenerate

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`, `src/app/(app)/settings/forms.tsx`, `src/app/(app)/settings/actions.ts`
- Modify: `tests/services/settings-actions.test.ts`
- Modify: `tests/e2e/settings.spec.ts` (extend the skipped suite)

**Interfaces:**
- Consumes: `getConfig`, `setConfig`, `CONFIG_DEFAULTS`, `assertCan`, `writeAudit`, `regenerateAllRecommended`.
- Produces:
  - `savePricingBands(_prev: unknown, formData: FormData)` in `settings/actions.ts` — `requireUser`; `assertCan(user, 'config.edit')`; read the 6 band fields as numbers; guard `every(Number.isFinite)` and `0 <= v <= 100` → `{ error: 'bands must be 0–100' }`; `const before = await getConfig(user.orgId, 'pricingBands')`; `setConfig(user.orgId, 'pricingBands', bands)`; `await writeAudit(user, 'config', 'pricingBands', 'update', before, bands)`; `revalidatePath('/settings')`; return `{ ok: true }`.
  - The `regenerateAll` action already exists (Task 8) — Settings just renders a `<form action={regenerateAll}>` with an "Only prices not manually set" checkbox (`name="onlyUnoverridden"`) and a "Regenerate recommended prices" button (rendered only when `can(user, 'pricing.recommend')`).
  - `settings/page.tsx` loads `getConfig(orgId, 'pricingBands')` and passes it to `<SettingsForms>`; `forms.tsx` renders a "Pricing bands (%)" `useActionState` form with the 6 labelled number inputs + a live note + "Saved" on `ok`.

- [ ] **Step 1: Write the failing test** — add to `tests/services/settings-actions.test.ts`:
```ts
import { savePricingBands } from '@/app/(app)/settings/actions';
import { auditLog } from '@/server/db/schema/audit';
import { eq } from 'drizzle-orm';
// ... existing requireUser mock returning an OWNER ...

it('savePricingBands persists valid bands and writes a config audit row', async () => {
  const { orgId } = await seedBase();
  const fd = new FormData();
  for (const [k, v] of Object.entries({
    ssMinMarginPct: 9, ssNormalMarginPct: 13, ssTargetMarginPct: 19,
    distributorMarginPct: 16, retailerMarginPct: 24, volatileFloorBufferPct: 14,
  })) fd.set(k, String(v));
  const res = await savePricingBands(null, fd);
  expect(res).toEqual({ ok: true });
  expect(await getConfig(orgId, 'pricingBands')).toMatchObject({ ssMinMarginPct: 9, retailerMarginPct: 24 });
  const audits = await testDb.select().from(auditLog).where(eq(auditLog.entityType, 'config'));
  expect(audits.some((a) => a.entityId === 'pricingBands')).toBe(true);
});

it('savePricingBands rejects an out-of-range band', async () => {
  await seedBase();
  const fd = new FormData();
  for (const k of ['ssMinMarginPct','ssNormalMarginPct','ssTargetMarginPct','distributorMarginPct','retailerMarginPct','volatileFloorBufferPct']) fd.set(k, '10');
  fd.set('retailerMarginPct', '250');
  expect(await savePricingBands(null, fd)).toEqual({ error: 'bands must be 0–100' });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- settings-actions`
Expected: FAIL — `savePricingBands` not exported.

- [ ] **Step 3: Implement**

Add `savePricingBands` to `settings/actions.ts` per Interfaces. Add the "Pricing bands" form to `forms.tsx` (copy the shape of the existing score-weights form — `useActionState(savePricingBands, null)`, 6 inputs, error line, Saved state). Add the "Regenerate recommended prices" form to `settings/page.tsx` (gated by `can(user, 'pricing.recommend')`). Load `pricingBands` in `page.tsx` and pass through.

- [ ] **Step 4: Run tests + boot check**

Run: `npm test -- settings-actions` → PASS. Full `npm test` twice. `tsc` + `lint` + `build` clean. `npm run dev`: `/settings` as OWNER — change `ssTargetMarginPct` to 20, Save, reload, confirm it stuck; click "Regenerate recommended prices" with the checkbox on, then check a non-overridden product's target price moved on `/products`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/settings" tests/services/settings-actions.test.ts tests/e2e/settings.spec.ts docs/BUILD-LOG.md
git commit -m "feat: Settings — editable pricing bands (audited) + regenerate recommended prices"
```

---

### Task 10: Demo/dev seed wiring, docs, M2a wrap

**Files:**
- Modify: `scripts/dev-fixtures.ts` (call `seedCatalogue`)
- Modify: `docs/BUILD-LOG.md`, `docs/PONYTAIL-DEBT.md`, `README.md`
- Create: `tests/services/dev-fixtures-catalogue.test.ts` (light)

**Interfaces:**
- Consumes: `seedCatalogue`, `seedBase`.
- Produces: `dev-fixtures.ts` seeds the F&F catalogue (via `seedCatalogue(orgId)`) alongside the dev OWNER + leads, so `npm run dev:fixtures` alone gives a browsable app with products. Idempotent (seedCatalogue already bails when populated).

- [ ] **Step 1: Wire `dev-fixtures.ts`**

In `scripts/dev-fixtures.ts`, after `seedBase()` and the dev-user/leads block, add `await seedCatalogue(orgId);` and log the count in the final line. (`dev-fixtures.ts` runs against `DATABASE_URL` = devbrowse.)

- [ ] **Step 2: Light test**

Create `tests/services/dev-fixtures-catalogue.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { seedCatalogue } from '@/server/db/seed-catalogue';
import { products } from '@/server/db/schema/product';
import { eq } from 'drizzle-orm';

beforeAll(migrateTestDb);
beforeEach(resetDb);

it('seedCatalogue leaves a browsable catalogue for the dev org', async () => {
  const { orgId } = await seedBase();
  await seedCatalogue(orgId);
  const rows = await testDb.select().from(products).where(eq(products.orgId, orgId));
  expect(rows.length).toBe(184);
  expect(rows.filter((p) => p.category ?? true).length).toBe(184); // sanity: all rows present
});
```
> This overlaps `seed-catalogue.test.ts`; keep it only if it adds a distinct assertion — otherwise skip creating it and note the decision. (YAGNI check.)

- [ ] **Step 3: Docs**

- `docs/BUILD-LOG.md` — Task 10 entry + a short "Milestone 2a complete" summary line.
- `docs/PONYTAIL-DEBT.md` — confirm rows exist for: CSV product import/export UI deferred to M3 (spec §40); GST slabs per category are best-guess defaults (Dry Fruits 12 / others 5) — confirm with F&F; `PRODUCT_FINANCIAL_FIELDS` fixed at 3 names; `product_prices.mrp` is a snapshot copy of `products.mrp` (keep them in sync when MRP editing lands — M2b/M3).
- `README.md` — add `npm run db:seed:catalogue` to the local-setup section; note the catalogue is real data, `distributor/floor/target` are band-derived until the owner sets them (`is_demo_assumption`).

- [ ] **Step 4: Full verification**

Run `npm test` (full, twice) — all green. `tsc --noEmit` + `npm run lint` + `npm run build` clean. `npm run dev:fixtures` then `npm run dev` — `/products`, `/settings`, `/leads`, `/pipeline` all render; demo banner as before.

- [ ] **Step 5: Commit**

```bash
git add scripts/dev-fixtures.ts docs/ tests/ 
git commit -m "chore: dev fixtures seed the catalogue; M2a docs + debt ledger"
```

---

## Self-Review

**1. Spec coverage (Milestone 2a scope — spec §9 "Categories/Products/product_prices + real-catalogue import → Pricing Calculator + recommendation engine → Settings bands"):**

| Spec item | Task(s) |
|---|---|
| Categories + Products (SKU master, one row per product×pack) — spec §4.5 | 2, 7 |
| `product_prices` (1:1, current values only; ssBillingPrice / distributor / floor / target / retailer / MRP; is_demo_assumption; manual_override) — spec §4.5 | 2 |
| Drop `manufacturer_price` / `strategic_price`; single global price set (no PriceList) — spec §4.5 + ponytail-debt | 2 (schema has neither; `pricingBandsByCategory` is the only differentiation, empty) |
| Real F&F catalogue loaded as live data (184 SKUs, real Current/MRP, GST-inclusive) — spec §9 + decisions log #10 | 1, 7 |
| `prices_gst_inclusive` config flag | 3 |
| `gst_pct` per product, category defaults (Dry Fruits 12; Seeds/Flours/Spices 5) — spec §4.5 | 1 (`gstPctByCategory`), 7 (applied) |
| `volatile_price` flag (Almond/Cashew/Pumpkin Seeds) — spec §4.5 | 1, 2, 7 |
| Pricing calculator: waterfall, net contribution, gross/contribution margin %, ex-GST taxable, max permissible discount, floor guard — spec §5.2 | 4 |
| `product cost` = ssBillingPrice (freight below gross per §28) | 4 (reconciliation noted) |
| Price recommendation engine: floor/distributor/target/retailer + MRP-suggestion + rationale[] + chain sanity check + volatile buffer — spec §5.3 | 5 |
| Recommendation bands in `app_config`, editable in Settings, per-category override — spec §5.3 | 3, 9 |
| Products & Pricing screen: list, per-SKU calc panel, recommended-vs-current side by side, "reset to recommended", bulk band re-generate — spec §5.3 | 8, 9 |
| SALES never sees `ss_billing_price` / `floor_price` (wire `stripFinancial`) — spec §51 + M1 I6 | 6 (`PRODUCT_FINANCIAL_FIELDS` + `redactProduct`), 8 (applied in the screen) |
| `writeAudit` on price / cost / band changes — spec §38 | 6 (`product`, `product_price`), 9 (`config`) |
| Query indexes on the new hot columns | 2 (in the schema `index()` defs) |

Deferred (correctly out of M2a, each a PONYTAIL-DEBT row): CSV product import/export UI (spec §40 → M3); `manufacturer_price`/`strategic_price` columns (dropped per §4.5); per-category band overrides have no editor UI yet (config-only in M2a); `product_prices.mrp` snapshot vs `products.mrp` sync. Distributor Master, lead→distributor conversion, Quotations, price approval, Schemes → **Milestone 2b** (separate plan).

**2. Placeholder scan:** No "TBD/TODO/handle edge cases" as instructions. Tasks 6 and 8 describe some UI/service surface in prose but always name the exact exports, signatures, audit calls, and field lists; every domain task (4, 5) and every schema/config task (2, 3) carries complete code; every task has runnable test code.

**3. Type consistency check:**
- `Paise` — `@/domain/money`, used in `PricingInput`/`PricingResult`/`RecommendResult`.
- `PricingBands` — canonical home `@/domain/pricing-recommend` (Task 5); `config.ts` imports it (Task 3 notes the stub-first ordering if 5 runs after 3).
- `PricingInput` / `PricingResult` — `@/domain/pricing` (Task 4); consumed by `computeFor` in `product.ts` (Task 6) via `import('@/domain/pricing').PricingResult`.
- `RecommendInput` / `RecommendResult` — `@/domain/pricing-recommend` (Task 5); consumed by `product.ts` (Task 6) and `seed-catalogue.ts` (Task 7).
- `ProductRow` / `ProductPriceRow` / `ProductWithPrice` — `product.ts` (Task 6); consumed by the screens (Task 8).
- `PRODUCT_FINANCIAL_FIELDS` / `redactProduct` / `redactProducts` — `product.ts` (Task 6); applied in `products/page.tsx` + `[id]/page.tsx` (Task 8).
- `writeAudit(user, entityType, entityId, action, old, new)` — unchanged M1 signature; `entityType` values `'product'`, `'product_price'`, `'config'`.
- `patchOnly(input, parsed)` — `src/lib/patch.ts` (M1); used in `updateProduct` (Task 6).
- `bandsForCategory(orgId, categoryName)` — `config.ts` (Task 3); used in `computeFor` / `resetToRecommended` / `regenerateAllRecommended` (Task 6).
- `Action` union additions `'product.view' | 'product.edit' | 'pricing.recommend'` — `permissions.ts` (Task 6); referenced by every product action (Tasks 8, 9).
- `savePrices` / `resetPrices` / `regenerateAll` — `products/actions.ts` (Task 8); `regenerateAll` reused by Settings (Task 9). `savePricingBands` — `settings/actions.ts` (Task 9).
- Migration numbering: M1 ended at 0006; this plan adds exactly one — **0007** (Task 2). Tasks 3–10 add no schema.

No mismatches found. One deliberate ordering note (carried in Task 3): if Task 5 has not run when Task 3 executes, Task 3 creates `src/domain/pricing-recommend.ts` with only the `PricingBands` interface and Task 5 replaces the file.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-01-super-stockist-milestone-2a-masters-pricing.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
