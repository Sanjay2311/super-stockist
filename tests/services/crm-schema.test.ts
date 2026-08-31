import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { distributorLeads, employeeDailyReports } from '@/server/db/schema/crm';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('crm schema', () => {
  it('inserts a lead with defaulted stage/probability/grade', async () => {
    const { orgId } = await seedBase();
    const [lead] = await testDb.insert(distributorLeads)
      .values({ orgId, businessName: 'Acme Traders', contactPerson: 'R', phone: '9999999999' })
      .returning();
    expect(lead.stage).toBe('IDENTIFIED');
    expect(lead.probability).toBe(5);
    expect(lead.grade).toBe('REJECT');
    expect(lead.expectedFfMonthlyPotential).toBe(0);
  });

  it('enforces one daily report per employee per date', async () => {
    const { orgId } = await seedBase();
    const row = { orgId, employeeId: crypto.randomUUID(), reportDate: '2026-08-31', submittedAt: new Date() };
    await testDb.insert(employeeDailyReports).values(row);
    await expect(testDb.insert(employeeDailyReports).values(row)).rejects.toThrow();
  });
});
