import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { territories } from '@/server/db/schema/territory';
import { distributorLeads } from '@/server/db/schema/crm';
import { distributors } from '@/server/db/schema/distributor';
import { commandCenterSummary } from '@/server/services/commandCenter';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'u-owner', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('commandCenterSummary', () => {
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

  it('eod mode still returns a full summary (same shape, different mode field)', async () => {
    const { orgId } = await seedBase();
    const summary = await commandCenterSummary(owner(orgId), 'eod');
    expect(summary.mode).toBe('eod');
  });
});
