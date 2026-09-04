import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { distributorLeads } from '@/server/db/schema/crm';
import { distributors } from '@/server/db/schema/distributor';
import { pipelineReport, distributorsReport } from '@/server/services/reports';

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
});
