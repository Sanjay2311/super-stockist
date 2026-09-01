import { and, asc, eq, ilike, isNull, or } from 'drizzle-orm';
import type { z } from 'zod';
import { db } from '@/server/db/client';
import { categories, products, productPrices } from '@/server/db/schema/product';
import { productSchema } from '@/lib/schemas';
import { patchOnly } from '@/lib/patch';
import { assertCan, stripFinancial } from '@/server/auth/permissions';
import { getConfig, bandsForCategory } from './config';
import { computePricing, type PricingResult } from '@/domain/pricing';
import { recommendPricing, type RecommendResult } from '@/domain/pricing-recommend';
import { writeAudit } from './audit';
import type { AppUser } from '@/server/auth/session';
import type { Paise } from '@/domain/money';

export type ProductRow = typeof products.$inferSelect;
export type ProductPriceRow = typeof productPrices.$inferSelect;
export type ProductWithPrice = ProductRow & { price: ProductPriceRow | null; categoryName: string | null };

// Callers supply raw form values; defaults/coercion are applied by `productSchema.parse`.
export type ProductInput = z.input<typeof productSchema>;

// Cost columns SALES must never see on a product-price read. Fixed at 3 names —
// every wired read path redacts these for the SALES role (see redactProduct).
// ponytail: hard-coded list — revisit if M2b/quotations add product cost columns
// to this read path (logged in docs/PONYTAIL-DEBT.md).
export const PRODUCT_FINANCIAL_FIELDS: (keyof ProductPriceRow)[] = ['ssBillingPrice', 'floorPrice', 'targetPrice'];

export function redactPrice(user: AppUser, row: ProductPriceRow | null): ProductPriceRow | null {
  return row === null ? null : stripFinancial(user, row, PRODUCT_FINANCIAL_FIELDS);
}

export function redactProduct(user: AppUser, row: ProductWithPrice): ProductWithPrice {
  return { ...row, price: redactPrice(user, row.price) };
}

export function redactProducts(user: AppUser, rows: ProductWithPrice[]): ProductWithPrice[] {
  return rows.map((r) => redactProduct(user, r));
}

export function listCategories(orgId: string): Promise<(typeof categories.$inferSelect)[]> {
  return db.select().from(categories)
    .where(and(eq(categories.orgId, orgId), isNull(categories.deletedAt), eq(categories.active, true)))
    .orderBy(asc(categories.name));
}

const withPrice = {
  product: products,
  price: productPrices,
  categoryName: categories.name,
} as const;

const shape = (r: { product: ProductRow; price: ProductPriceRow | null; categoryName: string | null }): ProductWithPrice =>
  ({ ...r.product, price: r.price, categoryName: r.categoryName });

export async function listProducts(orgId: string, opts: {
  categoryId?: string; q?: string; activeOnly?: boolean; limit?: number; offset?: number;
} = {}): Promise<ProductWithPrice[]> {
  const conds = [eq(products.orgId, orgId), isNull(products.deletedAt)];
  if (opts.categoryId) conds.push(eq(products.categoryId, opts.categoryId));
  if (opts.activeOnly) conds.push(eq(products.active, true));
  if (opts.q) {
    const like = `%${opts.q}%`;
    conds.push(or(ilike(products.name, like), ilike(products.skuCode, like))!);
  }
  const rows = await db.select(withPrice).from(products)
    .leftJoin(productPrices, eq(productPrices.productId, products.id))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(...conds))
    .orderBy(asc(products.name))
    .limit(opts.limit ?? 100).offset(opts.offset ?? 0);
  return rows.map(shape);
}

export async function getProduct(orgId: string, id: string): Promise<ProductWithPrice | null> {
  const [r] = await db.select(withPrice).from(products)
    .leftJoin(productPrices, eq(productPrices.productId, products.id))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.id, id), eq(products.orgId, orgId), isNull(products.deletedAt)));
  return r ? shape(r) : null;
}

export async function updateProduct(user: AppUser, id: string, input: Partial<ProductInput>): Promise<ProductRow> {
  assertCan(user, 'product.edit');
  const [before] = await db.select().from(products)
    .where(and(eq(products.id, id), eq(products.orgId, user.orgId)));
  if (!before) throw new Error('not found');
  const data = patchOnly(input, productSchema.partial().parse(input));
  const [row] = await db.update(products)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(products.id, id)).returning();
  await writeAudit(user, 'product', id, 'update', before, row);
  return row;
}

type PricePatch = {
  ssBillingPrice?: number; distributorPrice?: number; floorPrice?: number; targetPrice?: number;
  retailerPrice?: number | null; mrp?: number | null;
};
const PRICE_PATCH_FIELDS = ['ssBillingPrice', 'distributorPrice', 'floorPrice', 'targetPrice', 'retailerPrice', 'mrp'] as const;

export async function updatePrices(user: AppUser, productId: string, patch: PricePatch): Promise<ProductPriceRow> {
  assertCan(user, 'product.edit');
  const [before] = await db.select().from(productPrices)
    .where(and(eq(productPrices.productId, productId), eq(productPrices.orgId, user.orgId)));
  if (!before) throw new Error('not found');

  const set: Partial<ProductPriceRow> = {};
  for (const f of PRICE_PATCH_FIELDS) {
    if (!(f in patch)) continue;
    const v = patch[f];
    if (v === null && (f === 'retailerPrice' || f === 'mrp')) { set[f] = null; continue; }
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new Error('invalid price');
    set[f] = v;
  }

  // I6: an empty patch is a no-op — don't stamp a manual override or write a no-op audit row.
  if (Object.keys(set).length === 0) return before;

  // The cost drives every downstream price. When it changes, recompute floor/distributor/
  // target/retailer from the bands rather than accepting stale sibling values from the same
  // submit (the "Save prices" form only sends the field(s) actually typed into) — a hand-typed
  // distributor/floor/target in the SAME submit as a cost change is discarded in favour of the
  // recomputed value; resubmit that field on its own afterwards to override it.
  const costChanged = 'ssBillingPrice' in set && set.ssBillingPrice !== before.ssBillingPrice;

  if (costChanged) {
    const full = await getProduct(user.orgId, productId);
    if (!full) throw new Error('not found');
    const bands = await bandsForCategory(user.orgId, full.categoryName);
    const effectiveMrp = 'mrp' in set ? (set.mrp ?? null) : full.mrp;
    const rec = recommendPricing({
      ssBillingPrice: set.ssBillingPrice!,
      mrp: effectiveMrp,
      gstPct: full.gstPct,
      volatile: full.volatilePrice,
      bands,
    });
    set.distributorPrice = rec.distributorPrice;
    set.floorPrice = rec.floorPrice;
    set.targetPrice = rec.targetPrice;
    set.retailerPrice = rec.retailerPrice;
  } else {
    // I5: cross-field price ordering on the merged effective row (all 4 checked columns
    // are NOT NULL, so the merge always has them). Only applies to a manual override —
    // a cost-driven recompute is trusted output of recommendPricing (bands are non-decreasing
    // ss-min <= ss-normal <= ss-target by construction, so ordering always holds).
    const eff = { ...before, ...set };
    if (eff.ssBillingPrice > eff.floorPrice) throw new Error('floor below cost');
    if (eff.floorPrice > eff.targetPrice) throw new Error('floor above target');
    if (eff.floorPrice > eff.distributorPrice) throw new Error('floor above distributor');
  }

  const [row] = await db.update(productPrices).set({
    ...set,
    manualOverride: !costChanged,
    overrideBy: user.id,
    overrideAt: new Date(),
    isDemoAssumption: costChanged,
    updatedAt: new Date(),
  }).where(eq(productPrices.id, before.id)).returning();
  await writeAudit(user, 'product_price', productId, costChanged ? 'cost_update_recompute' : 'override', before, row);
  return row;
}

export async function computeFor(orgId: string, productId: string, sellingPrice?: Paise): Promise<{
  product: ProductWithPrice; pricing: PricingResult; recommend: RecommendResult;
} | null> {
  const product = await getProduct(orgId, productId);
  if (!product || !product.price) return null;
  const price = product.price;
  const gstInclusive = await getConfig(orgId, 'pricesGstInclusive');
  const bands = await bandsForCategory(orgId, product.categoryName);
  const pricing = computePricing({
    mrp: product.mrp,
    ssBillingPrice: price.ssBillingPrice,
    sellingPrice: sellingPrice ?? price.distributorPrice,
    floorPrice: price.floorPrice,
    gstPct: product.gstPct,
    gstInclusive,
    retailerPrice: price.retailerPrice,
  });
  const recommend = recommendPricing({
    ssBillingPrice: price.ssBillingPrice,
    mrp: product.mrp,
    gstPct: product.gstPct,
    volatile: product.volatilePrice,
    bands,
  });
  return { product, pricing, recommend };
}

/** Recommend fresh band values for one product's price row and clear its override flags.
 *  Never overwrites a set `products.mrp` — only fills it from `mrpSuggestion` when null. */
export async function resetToRecommended(user: AppUser, productId: string): Promise<ProductPriceRow> {
  assertCan(user, 'pricing.recommend');
  const product = await getProduct(user.orgId, productId);
  if (!product || !product.price) throw new Error('not found');
  const before = product.price;
  const bands = await bandsForCategory(user.orgId, product.categoryName);
  const rec = recommendPricing({
    ssBillingPrice: before.ssBillingPrice,
    mrp: product.mrp,
    gstPct: product.gstPct,
    volatile: product.volatilePrice,
    bands,
  });
  const [row] = await db.update(productPrices).set({
    distributorPrice: rec.distributorPrice,
    floorPrice: rec.floorPrice,
    targetPrice: rec.targetPrice,
    retailerPrice: rec.retailerPrice,
    manualOverride: false,
    isDemoAssumption: true,
    overrideBy: user.id,
    overrideAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(productPrices.id, before.id)).returning();
  if (product.mrp == null && rec.mrpSuggestion != null) {
    await db.update(products).set({ mrp: rec.mrpSuggestion, updatedAt: new Date() })
      .where(eq(products.id, productId));
  }
  await writeAudit(user, 'product_price', productId, 'reset_to_recommended', before, row);
  return row;
}

/** Recompute recommended distributor/floor/target/retailer for every non-deleted product
 *  whose price row is NOT a manual override. Never touches a set MRP. Writes ONE audit row
 *  carrying the before/after of the 4 prices on every row it rewrote (§38).
 *  ponytail: always skips manual overrides until per-price history exists (M3); the opt is
 *  kept for a future force path (see docs/PONYTAIL-DEBT.md + docs/BUILD-LOG.md). */
export async function regenerateAllRecommended(
  user: AppUser, opts: { onlyUnoverridden?: boolean } = {},
): Promise<{ updated: number }> {
  assertCan(user, 'pricing.recommend');
  void opts.onlyUnoverridden; // accepted but ignored — the manualOverride filter below is unconditional
  const conds = [
    eq(products.orgId, user.orgId),
    isNull(products.deletedAt),
    eq(productPrices.manualOverride, false),
  ];
  const rows = await db.select(withPrice).from(products)
    .innerJoin(productPrices, eq(productPrices.productId, products.id))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(...conds));

  // Read the band config once, not once per product — bandsForCategory would do two
  // getConfig round-trips on every row. Merge the per-category override in memory instead.
  const [baseBands, bandOverrides] = await Promise.all([
    getConfig(user.orgId, 'pricingBands'),
    getConfig(user.orgId, 'pricingBandsByCategory'),
  ]);
  const bandsFor = (categoryName: string | null) =>
    categoryName ? { ...baseBands, ...(bandOverrides[categoryName] ?? {}) } : baseBands;

  let updated = 0;
  const changes: {
    productId: string;
    before: { distributorPrice: number; floorPrice: number; targetPrice: number; retailerPrice: number | null };
    after: { distributorPrice: number; floorPrice: number; targetPrice: number; retailerPrice: number };
  }[] = [];
  for (const r of rows) {
    const price = r.price!;
    const bands = bandsFor(r.categoryName);
    const rec = recommendPricing({
      ssBillingPrice: price.ssBillingPrice,
      mrp: r.product.mrp,
      gstPct: r.product.gstPct,
      volatile: r.product.volatilePrice,
      bands,
    });
    await db.update(productPrices).set({
      distributorPrice: rec.distributorPrice,
      floorPrice: rec.floorPrice,
      targetPrice: rec.targetPrice,
      retailerPrice: rec.retailerPrice,
      isDemoAssumption: true,
      updatedAt: new Date(),
    }).where(eq(productPrices.id, price.id));
    if (r.product.mrp == null && rec.mrpSuggestion != null) {
      await db.update(products).set({ mrp: rec.mrpSuggestion, updatedAt: new Date() })
        .where(eq(products.id, r.product.id));
    }
    changes.push({
      productId: r.product.id,
      before: {
        distributorPrice: price.distributorPrice, floorPrice: price.floorPrice,
        targetPrice: price.targetPrice, retailerPrice: price.retailerPrice,
      },
      after: {
        distributorPrice: rec.distributorPrice, floorPrice: rec.floorPrice,
        targetPrice: rec.targetPrice, retailerPrice: rec.retailerPrice,
      },
    });
    updated++;
  }
  await writeAudit(user, 'config', 'regenerate_prices', 'regenerate_prices',
    { count: rows.length }, { updated, changes });
  return { updated };
}
