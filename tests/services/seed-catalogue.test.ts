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

    const catRows = await testDb.select().from(categories).where(eq(categories.orgId, orgId));
    expect(catRows).toHaveLength(5);
    expect(catRows.every((c) => c.active)).toBe(true);

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
