import { and, eq } from 'drizzle-orm';
import { db } from './client';
import { seedBase } from './seed';
import { categories, products, productPrices } from './schema/product';
import { FF_CATALOGUE } from './ff-catalogue';
import { recommendPricing } from '@/domain/pricing-recommend';
import { CONFIG_DEFAULTS } from '@/server/services/config';

/** UPPERCASE, then collapse every non-alphanumeric run to '-', trim edge dashes. */
export function slug(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Full catalogue is 184 rows; a fast bail once the org clearly already has it.
const ALREADY_SEEDED_AT = 150;

/**
 * Load the real F&F catalogue (184 SKUs) as `products` + `product_prices` for an org.
 * Products carry `isDemo: false` (real data); the three band-derived set prices are
 * flagged `isDemoAssumption: true`. Idempotent: skips the whole run once the org has
 * ≥ 150 products, and skips any individual SKU whose `skuCode` already exists.
 * Returns the counts CREATED this run.
 */
export async function seedCatalogue(
  orgId?: string,
): Promise<{ categories: number; products: number }> {
  const resolvedOrgId = orgId ?? (await seedBase()).orgId;

  const existingRows = await db
    .select({ skuCode: products.skuCode })
    .from(products)
    .where(eq(products.orgId, resolvedOrgId));
  if (existingRows.length >= ALREADY_SEEDED_AT) return { categories: 0, products: 0 };
  const existingSkuCodes = new Set(existingRows.map((r) => r.skuCode));

  // ── categories: upsert by (orgId, name) ──────────────────────────────────────
  const catNames = [...new Set(FF_CATALOGUE.skus.map((s) => s.category))];
  const catIdByName = new Map<string, string>();
  let categoriesCreated = 0;
  for (const name of catNames) {
    const [row] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.orgId, resolvedOrgId), eq(categories.name, name)));
    if (row) {
      catIdByName.set(name, row.id);
      continue;
    }
    const [created] = await db
      .insert(categories)
      .values({ orgId: resolvedOrgId, name, active: true })
      .returning({ id: categories.id });
    catIdByName.set(name, created.id);
    categoriesCreated++;
  }

  // ── products + prices ────────────────────────────────────────────────────────
  const generated = new Set<string>();
  let productsCreated = 0;
  for (const sku of FF_CATALOGUE.skus) {
    const base = `${slug(sku.category)}-${slug(sku.product)}-${slug(sku.packLabel)}`;
    if (existingSkuCodes.has(base)) continue; // already seeded — skip

    // Category prefix makes the catalogue collision-free (e.g. Quinoa 1kg lives in
    // both Seeds and Flours); guard anyway in case future data collides.
    let skuCode = base;
    for (let n = 2; generated.has(skuCode); n++) skuCode = `${base}-${n}`;
    generated.add(skuCode);

    const gstPct = FF_CATALOGUE.gstPctByCategory[sku.category];
    const [product] = await db
      .insert(products)
      .values({
        orgId: resolvedOrgId,
        categoryId: catIdByName.get(sku.category)!,
        skuCode,
        name: `${sku.product} ${sku.packLabel}`,
        packLabel: sku.packLabel,
        packGrams: sku.packGrams,
        unit: sku.unit,
        mrp: sku.mrpPaise,
        gstPct,
        volatilePrice: sku.volatile,
        isDemo: false,
      })
      .returning({ id: products.id });

    const rec = recommendPricing({
      ssBillingPrice: sku.currentPaise,
      mrp: sku.mrpPaise,
      gstPct,
      volatile: sku.volatile,
      bands: CONFIG_DEFAULTS.pricingBands,
    });
    await db.insert(productPrices).values({
      orgId: resolvedOrgId,
      productId: product.id,
      ssBillingPrice: sku.currentPaise,
      distributorPrice: rec.distributorPrice,
      floorPrice: rec.floorPrice,
      targetPrice: rec.targetPrice,
      retailerPrice: rec.retailerPrice,
      mrp: sku.mrpPaise,
      isDemoAssumption: true,
      manualOverride: false,
    });
    productsCreated++;
  }

  return { categories: categoriesCreated, products: productsCreated };
}

if (process.argv[1]?.endsWith('seed-catalogue.ts')) {
  seedBase()
    .then(({ orgId }) => seedCatalogue(orgId))
    .then((r) => { console.log(r); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
