import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { employees } from '@/server/db/schema/identity';
import { activities, distributorLeads } from '@/server/db/schema/crm';
import { scorecardCounts, listScorecards, weeklyComparison } from '@/server/services/scorecard';

beforeAll(migrateTestDb);
beforeEach(resetDb);

const IST = (isoDateTime: string) => new Date(isoDateTime); // pass explicit UTC instants in tests

describe('scorecard service', () => {
  it('sums activity + funnel counts across a multi-day range for one employee', async () => {
    const { orgId } = await seedBase();
    const [emp] = await testDb.insert(employees).values({ orgId, name: 'Priya', phone: '9800000003' }).returning();
    // Two calls on day 1, one meeting on day 2 (both within IST range)
    await testDb.insert(activities).values([
      { orgId, employeeId: emp.id, leadId: null, distributorId: crypto.randomUUID(), type: 'CALL', occurredAt: IST('2026-09-01T05:00:00Z') },
      { orgId, employeeId: emp.id, leadId: null, distributorId: crypto.randomUUID(), type: 'CALL', occurredAt: IST('2026-09-01T10:00:00Z') },
      { orgId, employeeId: emp.id, leadId: null, distributorId: crypto.randomUUID(), type: 'MEETING', occurredAt: IST('2026-09-02T06:00:00Z') },
    ]);
    await testDb.insert(distributorLeads).values({
      orgId, businessName: 'New Co', contactPerson: 'x', phone: '9800000004',
      assignedEmployeeId: emp.id, stage: 'IDENTIFIED', createdAt: IST('2026-09-01T04:00:00Z'),
    });
    const counts = await scorecardCounts(orgId, emp.id, IST('2026-09-01T00:00:00Z'), IST('2026-09-02T00:00:00Z'));
    expect(counts.activity.calls).toBe(2);
    expect(counts.activity.meetings).toBe(1);
    expect(counts.funnel.newLeads).toBe(1);
  });

  it('listScorecards returns one row per active employee with a resolved name', async () => {
    const { orgId } = await seedBase();
    await testDb.insert(employees).values([
      { orgId, name: 'Bala', phone: '9800000005' },
      { orgId, name: 'Anu', phone: '9800000006', status: 'inactive' },
    ]);
    const rows = await listScorecards(orgId, IST('2026-09-01T00:00:00Z'), IST('2026-09-07T00:00:00Z'));
    expect(rows.map((r) => r.employeeName)).toEqual(['Bala']);
  });

  it('weeklyComparison contrasts this week against the 7 days before it', async () => {
    const { orgId } = await seedBase();
    const [emp] = await testDb.insert(employees).values({ orgId, name: 'Ravi', phone: '9800000007' }).returning();
    await testDb.insert(activities).values([
      { orgId, employeeId: emp.id, distributorId: crypto.randomUUID(), type: 'CALL', occurredAt: IST('2026-09-10T05:00:00Z') }, // this week
      { orgId, employeeId: emp.id, distributorId: crypto.randomUUID(), type: 'CALL', occurredAt: IST('2026-09-02T05:00:00Z') }, // last week
    ]);
    const { thisWeek, lastWeek } = await weeklyComparison(orgId, emp.id, IST('2026-09-07T00:00:00Z'));
    expect(thisWeek.activity.calls).toBe(1);
    expect(lastWeek.activity.calls).toBe(1);
  });
});
