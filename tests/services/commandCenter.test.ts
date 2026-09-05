import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { territories } from '@/server/db/schema/territory';
import { distributorLeads, employeeDailyReports } from '@/server/db/schema/crm';
import { distributors } from '@/server/db/schema/distributor';
import { employees } from '@/server/db/schema/identity';
import { commandCenterSummary } from '@/server/services/commandCenter';
import { istDayKey } from '@/server/services/dailyReport';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'u-owner', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });
const sales = (orgId: string, employeeId: string): AppUser =>
  ({ id: 'u-sales', email: 's', name: 'S', role: 'SALES', employeeId, orgId });

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('commandCenterSummary', () => {
  it('SALES role: leads/tasks/follow-ups are scoped to the caller\'s own employeeId, and org-wide/owner-only attention fields are withheld', async () => {
    const { orgId } = await seedBase();
    const empMine = '11111111-1111-1111-1111-111111111111';
    const empOther = '22222222-2222-2222-2222-222222222222';
    await testDb.insert(distributorLeads).values([
      // owned by the SALES caller
      { orgId, businessName: 'Mine', contactPerson: 'x', phone: '9800000050', stage: 'QUALIFIED', assignedEmployeeId: empMine },
      // owned by someone else — must not leak into a SALES caller's totals
      { orgId, businessName: 'Not Mine', contactPerson: 'x', phone: '9800000051', stage: 'QUALIFIED', assignedEmployeeId: empOther },
    ]);
    await testDb.insert(distributors).values({
      orgId, businessName: 'D1', contactPerson: 'x', phone: '9800000052', status: 'ACTIVE', exclusivityNote: 'special terms',
    });

    const salesSummary = await commandCenterSummary(sales(orgId, empMine), 'morning');
    expect(salesSummary.kpis.totalLeads).toBe(1); // only "Mine", not the org-wide 2

    // OWNER-only attention fields must be withheld (null), not computed, for SALES.
    expect(salesSummary.attention.pendingApprovals).toBeNull();
    expect(salesSummary.attention.missingDailyReports).toBeNull();
    expect(salesSummary.attention.exclusivityOverrides).toBeNull();

    const ownerSummary = await commandCenterSummary(owner(orgId), 'morning');
    expect(ownerSummary.kpis.totalLeads).toBe(2); // OWNER sees both leads, org-wide
    expect(ownerSummary.attention.pendingApprovals).not.toBeNull();
    expect(ownerSummary.attention.missingDailyReports).not.toBeNull();
    expect(ownerSummary.attention.exclusivityOverrides).not.toBeNull();
    expect(ownerSummary.attention.exclusivityOverrides?.some((d) => d.businessName === 'D1')).toBe(true);
  });

  it('assembles the scoped blocks with real numbers', async () => {
    const { orgId } = await seedBase();
    const [zone] = await testDb.insert(territories).values({ orgId, name: 'Zone A', type: 'ZONE', parentId: null }).returning();
    await testDb.insert(distributorLeads).values([
      { orgId, businessName: 'Hot Lead', contactPerson: 'x', phone: '9800000020', stage: 'QUALIFIED', grade: 'A', probability: 70, territoryId: zone.id },
    ]);
    await testDb.insert(distributors).values({
      orgId, businessName: 'D1', contactPerson: 'x', phone: '9800000021', status: 'ACTIVE', territoryId: zone.id,
    });
    const summary = await commandCenterSummary(owner(orgId), 'morning');
    expect(summary.mode).toBe('morning');
    expect(summary.kpis.totalLeads).toBe(1);
    expect(summary.kpis.activeDistributors).toBe(1);
    expect(summary.growth.territoryCoveragePct).toBeGreaterThan(0);
    expect(summary.funnel.length).toBeGreaterThan(0);
  });

  it('missingDailyReports: an employee who submitted TODAY but not YESTERDAY still counts as missing', async () => {
    const { orgId } = await seedBase();
    const [emp] = await testDb.insert(employees).values({ orgId, name: 'Priya', phone: '9800000053' }).returning();
    const now = new Date();
    const todayYmd = istDayKey(now);
    // Submitted today, but NOT yesterday — the buggy `gte(reportDate, yesterday)`
    // predicate this fix replaces would have incorrectly treated this as compliant.
    await testDb.insert(employeeDailyReports).values({
      orgId, employeeId: emp.id, reportDate: todayYmd, submittedAt: now,
    });
    const summary = await commandCenterSummary(owner(orgId), 'morning');
    expect(summary.attention.missingDailyReports).toBe(1);
  });

  it('eod mode still returns a full summary (same shape, different mode field)', async () => {
    const { orgId } = await seedBase();
    const summary = await commandCenterSummary(owner(orgId), 'eod');
    expect(summary.mode).toBe('eod');
  });
});
