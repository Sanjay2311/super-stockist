import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { employees } from '@/server/db/schema/identity';
import { listEmployees } from '@/server/services/employee';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('employee service', () => {
  it('lists org-scoped employees, ordered by name, filterable to active only', async () => {
    const { orgId } = await seedBase();
    await testDb.insert(employees).values([
      { orgId, name: 'Bala', phone: '9800000001', status: 'active' },
      { orgId, name: 'Anu', phone: '9800000002', status: 'inactive' },
    ]);
    const all = await listEmployees(orgId);
    expect(all.map((e) => e.name)).toEqual(['Anu', 'Bala']);
    const active = await listEmployees(orgId, { activeOnly: true });
    expect(active.map((e) => e.name)).toEqual(['Bala']);
  });
});
