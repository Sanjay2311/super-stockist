import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { createTask, completeTask, listOpenTasks, getTodayView } from '@/server/services/task';
import { createLead } from '@/server/services/lead';
import { addActivity } from '@/server/services/activity';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });
const NOW = new Date('2026-08-31T09:00:00+05:30');

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('task service', () => {
  it('creates, lists open, and completes a task', async () => {
    const { orgId } = await seedBase();
    const u = owner(orgId);
    const t = await createTask(u, { title: 'Call Acme', type: 'CALL', dueDate: new Date('2026-08-31') });
    expect((await listOpenTasks(orgId)).map((x) => x.title)).toEqual(['Call Acme']);
    const done = await completeTask(u, t.id);
    expect(done.status).toBe('COMPLETED');
    expect(await listOpenTasks(orgId)).toHaveLength(0);
  });

  it('today view unions open tasks with due follow-ups, without creating task rows', async () => {
    const { orgId } = await seedBase();
    const u = owner(orgId);
    await createTask(u, { title: 'Overdue meeting', type: 'MEETING', dueDate: new Date('2026-08-29') });
    const lead = await createLead(u, { businessName: 'FollowUp Co', contactPerson: 'Farida', phone: '9000000020' });
    await addActivity(u, { leadId: lead.id, type: 'CALL', nextFollowUpAt: new Date('2026-08-31T17:00:00+05:30') });

    const view = await getTodayView(orgId, { now: NOW });
    expect(view.tasks.overdue.map((t) => t.title)).toEqual(['Overdue meeting']);
    expect(view.followUps.today.map((l) => l.businessName)).toEqual(['FollowUp Co']);
    expect(await listOpenTasks(orgId)).toHaveLength(1);   // still just the manual task
  });
});
