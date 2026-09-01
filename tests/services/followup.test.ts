import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { createLead, setStage } from '@/server/services/lead';
import { addActivity } from '@/server/services/activity';
import { getFollowUpBuckets } from '@/server/services/followup';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });
const NOW = new Date('2026-08-31T09:00:00+05:30');

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('getFollowUpBuckets', () => {
  it('sorts leads into overdue / today / next7 / noAction', async () => {
    const { orgId } = await seedBase();
    const u = owner(orgId);
    const a = await createLead(u, { businessName: 'Overdue Co', contactPerson: 'Contact A', phone: '9000000010' });
    await addActivity(u, { leadId: a.id, type: 'CALL', nextFollowUpAt: new Date('2026-08-29T10:00:00+05:30') });
    const b = await createLead(u, { businessName: 'Today Co', contactPerson: 'Contact B', phone: '9000000011' });
    await addActivity(u, { leadId: b.id, type: 'CALL', nextFollowUpAt: new Date('2026-08-31T17:00:00+05:30') });
    const c = await createLead(u, { businessName: 'Soon Co', contactPerson: 'Contact C', phone: '9000000012' });
    await addActivity(u, { leadId: c.id, type: 'CALL', nextFollowUpAt: new Date('2026-09-04T10:00:00+05:30') });
    const d = await createLead(u, { businessName: 'NoAction Co', contactPerson: 'Contact D', phone: '9000000013' });
    await setStage(u, d.id, 'QUALIFIED');

    const buckets = await getFollowUpBuckets(orgId, { now: NOW });
    expect(buckets.overdue.map((l) => l.businessName)).toEqual(['Overdue Co']);
    expect(buckets.today.map((l) => l.businessName)).toEqual(['Today Co']);
    expect(buckets.next7.map((l) => l.businessName)).toEqual(['Soon Co']);
    expect(buckets.noAction.map((l) => l.businessName)).toContain('NoAction Co');
  });
});
