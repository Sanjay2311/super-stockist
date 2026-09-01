import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { tasks } from '@/server/db/schema/crm';
import { taskSchema, TASK_STATUSES } from '@/lib/schemas';
import { assertCan } from '@/server/auth/permissions';
import { getFollowUpBuckets } from './followup';
import { classifyFollowUp } from '@/domain/followup';
import type { AppUser } from '@/server/auth/session';
import type { z } from 'zod';

export type TaskRow = typeof tasks.$inferSelect;
export type TaskStatus = (typeof TASK_STATUSES)[number];
// Callers supply raw form values; `priority` default + `dueDate` coercion come from `taskSchema.parse`.
export type TaskInput = z.input<typeof taskSchema>;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function createTask(user: AppUser, input: TaskInput): Promise<TaskRow> {
  assertCan(user, 'task.create');
  const d = taskSchema.parse(input);
  const [row] = await db.insert(tasks).values({
    orgId: user.orgId,
    title: d.title,
    type: d.type,
    leadId: d.leadId ?? null,
    distributorId: d.distributorId ?? null,
    priority: d.priority,
    dueDate: ymd(d.dueDate),
    assignedEmployeeId: d.assignedEmployeeId ?? (user.role === 'SALES' ? user.employeeId : null),
    createdBy: user.id,
  }).returning();
  return row;
}

export async function updateTask(
  user: AppUser,
  id: string,
  input: Partial<TaskInput> & { status?: TaskStatus },
): Promise<TaskRow> {
  assertCan(user, 'task.update');
  const patch = taskSchema.partial().parse(input);
  const [row] = await db.update(tasks).set({
    ...patch,
    dueDate: patch.dueDate ? ymd(patch.dueDate) : undefined,
    status: input.status,
    updatedAt: new Date(),
  }).where(and(eq(tasks.id, id), eq(tasks.orgId, user.orgId))).returning();
  return row;
}

export async function completeTask(user: AppUser, id: string): Promise<TaskRow> {
  assertCan(user, 'task.complete');
  const [row] = await db.update(tasks)
    .set({ status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.orgId, user.orgId))).returning();
  return row;
}

export async function listOpenTasks(
  orgId: string,
  opts: { assignedEmployeeId?: string } = {},
): Promise<TaskRow[]> {
  const conds = [
    eq(tasks.orgId, orgId),
    isNull(tasks.deletedAt),
    inArray(tasks.status, ['PENDING', 'IN_PROGRESS']),
  ];
  if (opts.assignedEmployeeId) conds.push(eq(tasks.assignedEmployeeId, opts.assignedEmployeeId));
  return db.select().from(tasks).where(and(...conds)).orderBy(asc(tasks.dueDate));
}

/** Union view (spec §4.3): open tasks bucketed by `dueDate` vs IST today, plus the
 *  follow-up buckets from the lead rows. A due follow-up never creates a task row. */
export async function getTodayView(
  orgId: string,
  opts: { assignedEmployeeId?: string; now?: Date } = {},
): Promise<{
  tasks: { overdue: TaskRow[]; today: TaskRow[]; upcoming: TaskRow[] };
  followUps: Awaited<ReturnType<typeof getFollowUpBuckets>>;
}> {
  const now = opts.now ?? new Date();
  const open = await listOpenTasks(orgId, opts);
  const overdue: TaskRow[] = [];
  const today: TaskRow[] = [];
  const upcoming: TaskRow[] = [];
  for (const t of open) {
    const bucket = classifyFollowUp(new Date(`${t.dueDate}T12:00:00+05:30`), now);
    if (bucket === 'OVERDUE') overdue.push(t);
    else if (bucket === 'TODAY') today.push(t);
    else upcoming.push(t);
  }
  const followUps = await getFollowUpBuckets(orgId, opts);
  return { tasks: { overdue, today, upcoming }, followUps };
}
