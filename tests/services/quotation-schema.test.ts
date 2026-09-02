import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { categories, products } from '@/server/db/schema/product';
import { quotations, quotationItems, priceApprovals } from '@/server/db/schema/quotation';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('quotation schema', () => {
  it('round-trips a quotation with an item and an approval', async () => {
    const { orgId } = await seedBase();
    const [cat] = await testDb.insert(categories).values({ orgId, name: 'Dry Fruits' }).returning();
    const [p] = await testDb.insert(products).values({
      orgId, categoryId: cat.id, skuCode: 'DF-ALMOND-100G', name: 'Almond', packLabel: '100g', gstPct: 12,
    }).returning();
    const [q] = await testDb.insert(quotations).values({
      orgId, quoteNo: 'Q-202609-001', leadId: crypto.randomUUID(),
      quoteDate: '2026-09-01', validUntil: '2026-09-08',
    }).returning();
    const [it] = await testDb.insert(quotationItems).values({
      orgId, quotationId: q.id, productId: p.id, qty: 10,
      requestedRate: 11000, listRate: 11984, floorRate: 11556, targetRate: 12626,
      gstPct: 12, netAmount: 110000, approvalStatus: 'PENDING',
    }).returning();
    const [ap] = await testDb.insert(priceApprovals).values({
      orgId, quotationItemId: it.id, requestedRate: 11000, originalRate: 11984, requestedBy: 'u-sales',
    }).returning();
    expect(ap.decision).toBe('PENDING');
    expect(it.netAmount).toBe(110000);
  });

  it('rejects a quotation that names both a lead and a distributor', async () => {
    const { orgId } = await seedBase();
    await expect(testDb.insert(quotations).values({
      orgId, quoteNo: 'Q-202609-002', leadId: crypto.randomUUID(), distributorId: crypto.randomUUID(),
      quoteDate: '2026-09-01', validUntil: '2026-09-08',
    })).rejects.toThrow();
  });
});
