import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { territories } from '@/server/db/schema/territory';
import { distributors } from '@/server/db/schema/distributor';
import { auditLog } from '@/server/db/schema/audit';
import { listDistributors, getDistributor, updateDistributor } from '@/server/services/distributor';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'u-owner', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });
const sales = (orgId: string): AppUser => ({ id: 'u-sales', email: 's', name: 'S', role: 'SALES', employeeId: null, orgId });

beforeAll(migrateTestDb);
beforeEach(resetDb);

async function seedDist(orgId: string, over: Partial<typeof distributors.$inferInsert> = {}) {
  const [d] = await testDb.insert(distributors).values({
    orgId, businessName: 'Coastal Trading', contactPerson: 'W. Salian', phone: '9845000001',
    status: 'APPROVED', grade: 'A', ...over,
  }).returning();
  return d;
}

describe('distributor service', () => {
  it('lists and gets, org-scoped, hiding soft-deleted rows', async () => {
    const { orgId } = await seedBase();
    const d = await seedDist(orgId);
    expect((await listDistributors(orgId)).map((x) => x.id)).toContain(d.id);
    expect((await getDistributor(orgId, d.id))?.businessName).toBe('Coastal Trading');
    await testDb.update(distributors).set({ deletedAt: new Date() }).where(eq(distributors.id, d.id));
    expect(await getDistributor(orgId, d.id)).toBeNull();
  });

  it('filters the list by status', async () => {
    const { orgId } = await seedBase();
    await seedDist(orgId, { status: 'ACTIVE' });
    await seedDist(orgId, { businessName: 'Other', status: 'SUSPENDED' });
    expect((await listDistributors(orgId, { status: 'ACTIVE' })).length).toBe(1);
  });

  it('updateDistributor patches only supplied fields and writes an audit row; SALES is forbidden', async () => {
    const { orgId } = await seedBase();
    const d = await seedDist(orgId);
    await expect(updateDistributor(sales(orgId), d.id, { creditDays: 30 })).rejects.toThrow('forbidden');
    const up = await updateDistributor(owner(orgId), d.id, { creditLimit: 50000000, creditDays: 30 });
    expect(up.creditLimit).toBe(50000000);
    expect(up.creditDays).toBe(30);
    expect(up.businessName).toBe('Coastal Trading'); // untouched
    const rows = await testDb.select().from(auditLog).where(eq(auditLog.entityType, 'distributor'));
    expect(rows.length).toBe(1);
  });

  it('blocks an exclusive territory clash on update unless an override reason is given', async () => {
    const { orgId } = await seedBase();
    const [zone] = await testDb.insert(territories).values({ orgId, name: 'East', type: 'ZONE', parentId: null }).returning();
    const [area] = await testDb.insert(territories).values({ orgId, name: 'Whitefield', type: 'AREA', parentId: zone.id }).returning();
    await seedDist(orgId, { businessName: 'Incumbent', territoryId: area.id, exclusive: true, status: 'ACTIVE' });
    const mover = await seedDist(orgId, { businessName: 'Mover' });

    await expect(
      updateDistributor(owner(orgId), mover.id, { territoryId: area.id, exclusive: true }),
    ).rejects.toThrow('EXCLUSIVITY_CONFLICT');

    const ok = await updateDistributor(owner(orgId), mover.id, {
      territoryId: area.id, exclusive: true, overrideReason: 'Split retail vs HoReCa channel, agreed with F&F',
    });
    expect(ok.territoryId).toBe(area.id);
    expect(ok.exclusivityNote).toMatch(/HoReCa/);
    const rows = await testDb.select().from(auditLog).where(eq(auditLog.action, 'exclusivity_override'));
    expect(rows.length).toBe(1);
  });
});
