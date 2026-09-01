import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrateTestDb, resetDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { db } from '@/server/db/client';
import { employees } from '@/server/db/schema/identity';
import { distributorLeads } from '@/server/db/schema/crm';
import { createLead } from '@/server/services/lead';
import { addActivity } from '@/server/services/activity';
import { submitReport, deriveCounts, listReports } from '@/server/services/dailyReport';
import type { AppUser } from '@/server/auth/session';

beforeAll(migrateTestDb);
beforeEach(resetDb);

async function salesUser(orgId: string): Promise<AppUser> {
  const [emp] = await db.insert(employees).values({ orgId, name: 'Rep', phone: '9000000099' }).returning();
  return { id: 'u-rep', email: 'rep', name: 'Rep', role: 'SALES', employeeId: emp.id, orgId };
}

describe('daily report service', () => {
  it('requires an employee record and upserts one row per (org, employee, date)', async () => {
    const { orgId } = await seedBase();
    const owner: AppUser = { id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId };
    await expect(submitReport(owner, { reportDate: new Date('2026-08-31'), areasVisited: [] }))
      .rejects.toThrow('no employee record');

    const rep = await salesUser(orgId);
    await submitReport(rep, { reportDate: new Date('2026-08-31'), areasVisited: ['Whitefield'], notes: 'ok' });
    await submitReport(rep, { reportDate: new Date('2026-08-31'), areasVisited: ['Hoodi'], notes: 'revised' });
    const reports = await listReports(orgId);
    expect(reports).toHaveLength(1);
    expect(reports[0].areasVisited).toEqual(['Hoodi']);
    expect(reports[0].notes).toBe('revised');
  });

  it('derives activity + funnel counts for the report day', async () => {
    const { orgId } = await seedBase();
    const rep = await salesUser(orgId);
    const day = new Date('2026-08-31T09:00:00+05:30');
    const lead = await createLead(rep, { businessName: 'D Co', contactPerson: 'Dinesh', phone: '9000000030' });
    // deriveCounts.newLeads filters on distributor_leads.created_at (defaultNow); pin it to the report day.
    await db.update(distributorLeads).set({ createdAt: day }).where(eq(distributorLeads.id, lead.id));
    await addActivity(rep, { leadId: lead.id, type: 'CALL', occurredAt: new Date('2026-08-31T10:00:00+05:30') });
    await addActivity(rep, { leadId: lead.id, type: 'MEETING', occurredAt: new Date('2026-08-31T12:00:00+05:30') });

    const counts = await deriveCounts(orgId, rep.employeeId!, day);
    expect(counts.activity.calls).toBe(1);
    expect(counts.activity.meetings).toBe(1);
    expect(counts.activity.presentations).toBe(0);
    expect(counts.funnel.newLeads).toBe(1);
  });
});
