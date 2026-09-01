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
