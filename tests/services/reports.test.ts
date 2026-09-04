import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { distributorLeads } from '@/server/db/schema/crm';
import { distributors } from '@/server/db/schema/distributor';
import { categories, products } from '@/server/db/schema/product';
import { quotations, quotationItems } from '@/server/db/schema/quotation';
import { employees } from '@/server/db/schema/identity';
import { pipelineReport, distributorsReport, quotationsReport, employeesReport } from '@/server/services/reports';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('reports service', () => {
  it('pipelineReport groups open+lost leads by stage and surfaces loss reasons', async () => {
    const { orgId } = await seedBase();
    await testDb.insert(distributorLeads).values([
      { orgId, businessName: 'A', contactPerson: 'x', phone: '9800000030', stage: 'QUALIFIED' },
      { orgId, businessName: 'B', contactPerson: 'x', phone: '9800000031', stage: 'LOST', lostReason: 'PRICE' },
    ]);
    const r = await pipelineReport(orgId, { from: null, to: null, territoryId: null, employeeId: null, categoryId: null });
    expect(r.byStage.find((s) => s.stage === 'QUALIFIED')?.count).toBe(1);
    expect(r.lossReasons.find((l) => l.reason === 'PRICE')?.count).toBe(1);
  });

  it('distributorsReport groups by status and grade', async () => {
    const { orgId } = await seedBase();
    await testDb.insert(distributors).values([
      { orgId, businessName: 'D1', contactPerson: 'x', phone: '9800000032', status: 'ACTIVE', grade: 'A' },
      { orgId, businessName: 'D2', contactPerson: 'x', phone: '9800000033', status: 'ACTIVE', grade: 'B' },
    ]);
    const r = await distributorsReport(orgId, { from: null, to: null, territoryId: null, employeeId: null, categoryId: null });
    expect(r.byStatus.find((s) => s.status === 'ACTIVE')?.count).toBe(2);
    expect(r.byGrade.map((g) => g.grade).sort()).toEqual(['A', 'B']);
  });

  it('quotationsReport dedups a multi-item quotation to one count while summing all item netAmounts', async () => {
    const { orgId } = await seedBase();
    const [cat] = await testDb.insert(categories).values({ orgId, name: 'Dry Fruits' }).returning();
    const [product] = await testDb.insert(products).values({
      orgId, categoryId: cat.id, skuCode: 'DF-001', name: 'Almond 100g', packLabel: '100g', gstPct: 12,
    }).returning();
    const [d] = await testDb.insert(distributors).values({
      orgId, businessName: 'Coastal', contactPerson: 'W', phone: '9800000034', status: 'ACTIVE',
    }).returning();
    const [q] = await testDb.insert(quotations).values({
      orgId, quoteNo: 'Q-202609-001', distributorId: d.id, quoteDate: '2026-09-05', validUntil: '2026-12-31',
    }).returning();
    await testDb.insert(quotationItems).values([
      { orgId, quotationId: q.id, productId: product.id, qty: 1, requestedRate: 10000, listRate: 10000, floorRate: 9000, targetRate: 9500, gstPct: 12, netAmount: 10000 },
      { orgId, quotationId: q.id, productId: product.id, qty: 1, requestedRate: 25000, listRate: 25000, floorRate: 22000, targetRate: 23000, gstPct: 12, netAmount: 25000 },
    ]);
    const r = await quotationsReport(orgId, { from: null, to: null, territoryId: null, employeeId: null, categoryId: null });
    const status = r.byStatus.find((s) => s.status === 'DRAFT');
    expect(status?.count).toBe(1);
    expect(status?.value).toBe(35000);
    const dist = r.byDistributor.find((b) => b.businessName === 'Coastal');
    expect(dist?.count).toBe(1);
    expect(dist?.value).toBe(35000);
  });

  it('employeesReport defaults to the last 7 days when filters are null and returns one row per active employee', async () => {
    const { orgId } = await seedBase();
    await testDb.insert(employees).values({ orgId, name: 'Priya', phone: '9800000035' });
    const r = await employeesReport(orgId, { from: null, to: null, territoryId: null, employeeId: null, categoryId: null });
    expect(r).toHaveLength(1);
    expect(r[0].employeeName).toBe('Priya');
    expect(r[0].counts.activity).toBeDefined();
    expect(r[0].counts.funnel).toBeDefined();
  });
});
