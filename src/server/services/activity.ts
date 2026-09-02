import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { activities, distributorLeads } from '@/server/db/schema/crm';
import { activitySchema } from '@/lib/schemas';
import { assertCan } from '@/server/auth/permissions';
import type { AppUser } from '@/server/auth/session';
import type { z } from 'zod';

export type ActivityRow = typeof activities.$inferSelect;
// Callers supply raw form values; `occurredAt` default + coercion come from `activitySchema.parse`.
export type ActivityInput = z.input<typeof activitySchema>;

export async function addActivity(user: AppUser, input: ActivityInput): Promise<ActivityRow> {
  assertCan(user, 'activity.create');
  const data = activitySchema.parse(input);
  if (data.leadId) {
    const [lead] = await db.select({ id: distributorLeads.id }).from(distributorLeads)
      .where(and(eq(distributorLeads.id, data.leadId), eq(distributorLeads.orgId, user.orgId)));
    if (!lead) throw new Error('not found');
  }
  const [row] = await db.insert(activities).values({
    orgId: user.orgId,
    leadId: data.leadId ?? null,
    distributorId: data.distributorId ?? null,
    employeeId: user.employeeId,
    type: data.type,
    occurredAt: data.occurredAt,
    notes: data.notes || null,
    outcome: data.outcome || null,
    nextAction: data.nextAction || null,
    nextFollowUpAt: data.nextFollowUpAt ?? null,
  }).returning();
  // The lead row is the single source of truth for the next follow-up (spec §4.3).
  if (data.leadId && data.nextFollowUpAt) {
    await db.update(distributorLeads)
      .set({ nextFollowUpAt: data.nextFollowUpAt, updatedAt: new Date() })
      .where(and(eq(distributorLeads.id, data.leadId), eq(distributorLeads.orgId, user.orgId)));
  }
  return row;
}

export async function listActivities(orgId: string, leadId: string): Promise<ActivityRow[]> {
  return db.select().from(activities)
    .where(and(eq(activities.orgId, orgId), eq(activities.leadId, leadId), isNull(activities.deletedAt)))
    .orderBy(desc(activities.occurredAt));
}

export async function listDistributorActivities(orgId: string, distributorId: string): Promise<ActivityRow[]> {
  return db.select().from(activities)
    .where(and(eq(activities.orgId, orgId), eq(activities.distributorId, distributorId), isNull(activities.deletedAt)))
    .orderBy(desc(activities.occurredAt));
}
