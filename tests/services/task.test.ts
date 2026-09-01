import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { createTask, completeTask, updateTask, listOpenTasks, getTodayView } from '@/server/services/task';
import { createLead } from '@/server/services/lead';
import { addActivity } from '@/server/services/activity';
import { tasks } from '@/server/db/schema/crm';
import { auditLog } from '@/server/db/schema/audit';
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

    // audit_log rows written for create + complete (plan line 21)
    const audit = await testDb.select().from(auditLog)
      .where(and(eq(auditLog.entityType, 'task'), eq(auditLog.entityId, t.id)));
    expect(audit.map((a) => a.action).sort()).toEqual(['complete', 'create']);
  });

  it('refuses to update or complete a task in another org', async () => {
    const { orgId } = await seedBase();
    const otherOrg = crypto.randomUUID();
    const [foreign] = await testDb.insert(tasks).values({
      orgId: otherOrg, title: 'Not yours', type: 'CALL', dueDate: '2026-08-31',
    }).returning();

    await expect(updateTask(owner(orgId), foreign.id, { title: 'hijack' })).rejects.toThrow('not found');
    await expect(completeTask(owner(orgId), foreign.id)).rejects.toThrow('not found');

    const [still] = await testDb.select().from(tasks).where(eq(tasks.id, foreign.id));
    expect(still.title).toBe('Not yours');
    expect(still.status).toBe('PENDING');
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
