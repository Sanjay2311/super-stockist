import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { auditLog } from '@/server/db/schema/audit';
import { createScheme, updateScheme, activeSchemesFor } from '@/server/services/scheme';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'u-owner', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });
const sales = (orgId: string): AppUser => ({ id: 'u-sales', email: 's', name: 'S', role: 'SALES', employeeId: null, orgId });

beforeAll(migrateTestDb);
beforeEach(resetDb);

const form = {
  name: 'Sept Dry Fruits 5%', type: 'FLAT_DISCOUNT' as const, scopeType: 'CATEGORY' as const,
  scopeId: '00000000-0000-4000-8000-0000000000c1',
  startDate: '2026-09-01', endDate: '2026-09-30',
  benefitKind: 'PCT' as const, benefitValue: 5, eligibleGrades: [] as ('A'|'B'|'C')[],
};

describe('scheme service', () => {
  it('createScheme is OWNER-only, stores benefit/eligibility jsonb, and audits', async () => {
    const { orgId } = await seedBase();
    await expect(createScheme(sales(orgId), form)).rejects.toThrow('forbidden');
    const s = await createScheme(owner(orgId), { ...form, eligibleGrades: ['A', 'B'] });
    expect(s.benefit).toEqual({ kind: 'PCT', value: 5 });
    expect(s.eligibility).toEqual({ distributorGrades: ['A', 'B'] });
    expect(s.active).toBe(true);
    const rows = await testDb.select().from(auditLog).where(eq(auditLog.entityType, 'scheme'));
    expect(rows.length).toBe(1);
  });

  it('updateScheme patches supplied fields', async () => {
    const { orgId } = await seedBase();
    const s = await createScheme(owner(orgId), form);
    const up = await updateScheme(owner(orgId), s.id, { active: false, benefitKind: 'AMOUNT', benefitValue: 1000 });
    expect(up.active).toBe(false);
    expect(up.benefit).toEqual({ kind: 'AMOUNT', value: 1000 });
    expect(up.name).toBe(form.name);
  });

  it('activeSchemesFor filters by window + scope', async () => {
    const { orgId } = await seedBase();
    await createScheme(owner(orgId), { ...form, name: 'cat c1' });                         // CATEGORY c1
    await createScheme(owner(orgId), { ...form, name: 'all', scopeType: 'ALL', scopeId: null });
    await createScheme(owner(orgId), { ...form, name: 'expired', endDate: '2026-09-05' });

    const hits = await activeSchemesFor(orgId, {
      onDate: '2026-09-15', productId: '00000000-0000-4000-8000-0000000000d1',
      categoryId: '00000000-0000-4000-8000-0000000000c1',
    });
    expect(hits.map((h) => h.name).sort()).toEqual(['all', 'cat c1']);

    // categoryId: null — the CATEGORY branch must be skipped, not throw or match (Task 10's path)
    const noCat = await activeSchemesFor(orgId, {
      onDate: '2026-09-15', productId: '00000000-0000-4000-8000-0000000000d1',
      categoryId: null,
    });
    expect(noCat.map((h) => h.name).sort()).toEqual(['all']);
  });
});
