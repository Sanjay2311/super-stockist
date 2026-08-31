import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, migrateTestDb, resetDb } from '../helpers/db';
import { orgs, brands } from '@/server/db/schema/identity';
import { seedBase } from '@/server/db/seed';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('identity schema + base seed', () => {
  it('seeds exactly one org and one brand, idempotently', async () => {
    const a = await seedBase();
    const b = await seedBase();
    expect(a.orgId).toBe(b.orgId);
    const orgRows = await testDb.select().from(orgs);
    const brandRows = await testDb.select().from(brands).where(eq(brands.orgId, a.orgId));
    expect(orgRows).toHaveLength(1);
    expect(brandRows).toHaveLength(1);
    expect(brandRows[0].billingState).toBe('Rajasthan');
  });
});
