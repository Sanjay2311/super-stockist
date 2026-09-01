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

  it('getProduct is org-scoped and hides a soft-deleted product', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedOneSku(orgId);
    expect((await getProduct(orgId, product.id))?.price?.distributorPrice).toBe(11984);
    await testDb.update(products).set({ deletedAt: new Date() }).where(eq(products.id, product.id));
    expect(await getProduct(orgId, product.id)).toBeNull();
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
