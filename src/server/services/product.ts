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

  const [row] = await db.update(productPrices).set({
    ...set,
    manualOverride: true,
    overrideBy: user.id,
    overrideAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(productPrices.id, before.id)).returning();
  await writeAudit(user, 'product_price', productId, 'override', before, row);
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
    isDemoAssumption: false,
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
 *  with a price row (optionally only where `manualOverride === false`). Never touches a set
 *  MRP. Writes ONE summary audit row — not per product (YAGNI). */
export async function regenerateAllRecommended(
  user: AppUser, orgId: string, opts: { onlyUnoverridden?: boolean } = {},
): Promise<{ updated: number }> {
  assertCan(user, 'pricing.recommend');
  const conds = [eq(products.orgId, orgId), isNull(products.deletedAt)];
  if (opts.onlyUnoverridden) conds.push(eq(productPrices.manualOverride, false));
  const rows = await db.select(withPrice).from(products)
    .innerJoin(productPrices, eq(productPrices.productId, products.id))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(...conds));

  let updated = 0;
  for (const r of rows) {
    const price = r.price!;
    const bands = await bandsForCategory(orgId, r.categoryName);
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
      updatedAt: new Date(),
    }).where(eq(productPrices.id, price.id));
    if (r.product.mrp == null && rec.mrpSuggestion != null) {
      await db.update(products).set({ mrp: rec.mrpSuggestion, updatedAt: new Date() })
        .where(eq(products.id, r.product.id));
    }
    updated++;
  }
  await writeAudit(user, 'config', 'regenerate_prices', 'regenerate_prices', null,
    { updated, onlyUnoverridden: opts.onlyUnoverridden ?? false });
  return { updated };
}
