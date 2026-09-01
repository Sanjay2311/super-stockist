import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase, seedDemo, purgeDemo, hasDemoData } from '@/server/db/seed';
import { distributorLeads, activities, tasks } from '@/server/db/schema/crm';
import { territories } from '@/server/db/schema/territory';
import { STAGES } from '@/domain/pipeline';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('demo seed', () => {
  it('creates ~20 leads across multiple stages, all flagged is_demo', async () => {
    const { orgId } = await seedBase();
    await seedDemo();

    const leads = await testDb.select().from(distributorLeads);
    expect(leads.length).toBeGreaterThanOrEqual(18);
    expect(leads.every((l) => l.isDemo)).toBe(true);
    expect(leads.every((l) => l.orgId === orgId)).toBe(true);

    const stages = new Set(leads.map((l) => l.stage));
    expect(stages.size).toBeGreaterThanOrEqual(6);
    expect([...stages].every((s) => STAGES.includes(s as never))).toBe(true);
    expect(stages.has('LOST')).toBe(true);
    expect(stages.has('ON_HOLD')).toBe(true);
    expect(leads.find((l) => l.stage === 'LOST')?.lostReason).toBeTruthy();

    // scoring ran: at least one graded lead, and every lead carries score inputs
    expect(leads.some((l) => l.grade !== 'REJECT')).toBe(true);
    expect(leads.every((l) => Object.keys(l.scoreInputs as object).length > 0)).toBe(true);

    // supporting rows exist and are demo-flagged
    const acts = await testDb.select().from(activities);
    const tsk = await testDb.select().from(tasks);
    expect(acts.length).toBeGreaterThanOrEqual(20);
    expect(acts.every((a) => a.isDemo)).toBe(true);
    expect(tsk.length).toBeGreaterThanOrEqual(6);
    expect(tsk.every((t) => t.isDemo)).toBe(true);

    const terr = await testDb.select().from(territories);
    expect(terr.length).toBeGreaterThanOrEqual(10);
    expect(terr.every((t) => t.isDemo)).toBe(true);

    expect(await hasDemoData(orgId)).toBe(true);
  });

  it('purge removes every demo row', async () => {
    const { orgId } = await seedBase();
    await seedDemo();
    await purgeDemo(orgId);

    expect(await testDb.select().from(distributorLeads).where(eq(distributorLeads.isDemo, true))).toHaveLength(0);
    expect(await testDb.select().from(activities).where(eq(activities.isDemo, true))).toHaveLength(0);
    expect(await testDb.select().from(tasks).where(eq(tasks.isDemo, true))).toHaveLength(0);
    expect(await testDb.select().from(territories).where(eq(territories.isDemo, true))).toHaveLength(0);

    expect(await testDb.select().from(distributorLeads)).toHaveLength(0);
    expect(await hasDemoData(orgId)).toBe(false);
  });

  it('purge is org-scoped — leaves another org\'s demo rows intact', async () => {
    const { orgId } = await seedBase();
    await seedDemo();
    const otherOrg = crypto.randomUUID();
    await testDb.insert(distributorLeads).values({
      orgId: otherOrg, businessName: 'Other Org Demo', contactPerson: 'X', phone: '9000000001', isDemo: true,
    });

    await purgeDemo(orgId);

    const survivors = await testDb.select().from(distributorLeads).where(eq(distributorLeads.orgId, otherOrg));
    expect(survivors).toHaveLength(1);
  });

  it('seedDemo is safe to run twice', async () => {
    await seedBase();
    await seedDemo();
    await seedDemo();
    const leads = await testDb.select().from(distributorLeads);
    expect(leads.length).toBeLessThanOrEqual(24);
  });
});
