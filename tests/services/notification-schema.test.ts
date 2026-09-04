import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { notifications } from '@/server/db/schema/notification';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('notifications schema', () => {
  it('round-trips a row and enforces the entity+category+day dedup uniqueness', async () => {
    const { orgId } = await seedBase();
    const base = {
      orgId, severity: 'critical' as const, category: 'follow_up_overdue',
      title: 'Test lead: follow-up overdue', entityType: 'lead', entityId: 'lead-1',
      dedupeDate: '2026-09-04',
    };
    const [row] = await testDb.insert(notifications).values(base).returning();
    expect(row.readAt).toBeNull();
    await expect(testDb.insert(notifications).values(base)).rejects.toThrow();
    // a different day is not a dupe
    await expect(testDb.insert(notifications).values({ ...base, dedupeDate: '2026-09-05' }))
      .resolves.toBeDefined();
  });
});
