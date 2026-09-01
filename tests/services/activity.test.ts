import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { createLead } from '@/server/services/lead';
import { addActivity, listActivities } from '@/server/services/activity';
import { distributorLeads } from '@/server/db/schema/crm';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('activity service', () => {
  it('appends an activity and pushes nextFollowUpAt onto the lead', async () => {
    const { orgId } = await seedBase();
    const lead = await createLead(owner(orgId), { businessName: 'C Co', contactPerson: 'Chandan', phone: '9000000003' });
    const due = new Date('2026-09-07T04:30:00Z');
    await addActivity(owner(orgId), { leadId: lead.id, type: 'CALL', notes: 'spoke to owner', nextFollowUpAt: due });
    const [row] = await testDb.select().from(distributorLeads).where(eq(distributorLeads.id, lead.id));
    expect(row.nextFollowUpAt?.toISOString()).toBe(due.toISOString());
    expect(await listActivities(orgId, lead.id)).toHaveLength(1);
  });

  it('rejects an activity with neither lead nor distributor', async () => {
    const { orgId } = await seedBase();
    await expect(addActivity(owner(orgId), { type: 'CALL' })).rejects.toThrow();
  });
});
