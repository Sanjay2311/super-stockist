import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { territories } from '@/server/db/schema/territory';
import { distributors } from '@/server/db/schema/distributor';
import { overlapsExclusive } from '@/server/services/territory';

beforeAll(migrateTestDb);
beforeEach(resetDb);

async function tree(orgId: string) {
  const [zone] = await testDb.insert(territories).values({ orgId, name: 'East', type: 'ZONE', parentId: null }).returning();
  const [area] = await testDb.insert(territories).values({ orgId, name: 'Whitefield', type: 'AREA', parentId: zone.id }).returning();
  const [pin] = await testDb.insert(territories).values({ orgId, name: '560066', type: 'PINCODE', parentId: area.id }).returning();
  const [other] = await testDb.insert(territories).values({ orgId, name: 'Indiranagar', type: 'AREA', parentId: zone.id }).returning();
  return { zone, area, pin, other };
}

describe('overlapsExclusive', () => {
  it('is false when no exclusive distributor holds any overlapping territory', async () => {
    const { orgId } = await seedBase();
    const { area } = await tree(orgId);
    expect(await overlapsExclusive(orgId, area.id)).toBe(false);
  });

  it('is true on an exact-territory clash with an active exclusive distributor', async () => {
    const { orgId } = await seedBase();
    const { area } = await tree(orgId);
    await testDb.insert(distributors).values({
      orgId, businessName: 'X', contactPerson: 'x', phone: '9800000000',
      territoryId: area.id, exclusive: true, status: 'ACTIVE',
    });
    expect(await overlapsExclusive(orgId, area.id)).toBe(true);
  });

  it('is true when the requested territory sits UNDER a territory held exclusively (ancestor clash)', async () => {
    const { orgId } = await seedBase();
    const { area, pin } = await tree(orgId);
    await testDb.insert(distributors).values({
      orgId, businessName: 'X', contactPerson: 'x', phone: '9800000000',
      territoryId: area.id, exclusive: true, status: 'APPROVED',
    });
    expect(await overlapsExclusive(orgId, pin.id)).toBe(true);
  });

  it('is true when the requested territory CONTAINS a territory held exclusively (descendant clash)', async () => {
    const { orgId } = await seedBase();
    const { area, pin } = await tree(orgId);
    await testDb.insert(distributors).values({
      orgId, businessName: 'X', contactPerson: 'x', phone: '9800000000',
      territoryId: pin.id, exclusive: true, status: 'ACTIVE',
    });
    expect(await overlapsExclusive(orgId, area.id)).toBe(true);
  });

  it('ignores a sibling territory, a non-exclusive holder, a closed distributor, and the excluded distributor itself', async () => {
    const { orgId } = await seedBase();
    const { area, other } = await tree(orgId);
    const [sibling] = await testDb.insert(distributors).values({
      orgId, businessName: 'Sib', contactPerson: 'x', phone: '9800000000',
      territoryId: other.id, exclusive: true, status: 'ACTIVE',
    }).returning();
    await testDb.insert(distributors).values({
      orgId, businessName: 'NonExcl', contactPerson: 'x', phone: '9800000001',
      territoryId: area.id, exclusive: false, status: 'ACTIVE',
    });
    await testDb.insert(distributors).values({
      orgId, businessName: 'Closed', contactPerson: 'x', phone: '9800000002',
      territoryId: area.id, exclusive: true, status: 'CLOSED',
    });
    const [self] = await testDb.insert(distributors).values({
      orgId, businessName: 'Self', contactPerson: 'x', phone: '9800000003',
      territoryId: area.id, exclusive: true, status: 'ACTIVE',
    }).returning();
    void sibling;
    expect(await overlapsExclusive(orgId, area.id, self.id)).toBe(false);
  });
});
