import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { notifications } from '@/server/db/schema/notification';
import type { AlertCandidate } from '@/domain/alerts';
import {
  followUpOverdueAlert, quotationStaleAlert, distributorReviewDueAlert,
  inactiveDistributorAlert, emptyTerritoryAlert, missingDailyReportAlert,
} from '@/domain/alerts';
import { getFollowUpBuckets } from './followup';
import { listQuotations } from './quotation';
import { listDistributors } from './distributor';
import { listTerritories } from './territory';
import { listEmployees } from './employee';
import { getConfig } from './config';
import { employeeDailyReports } from '@/server/db/schema/crm';
import { istDayKey } from './dailyReport';
import type { AppUser } from '@/server/auth/session';

export type NotificationRow = typeof notifications.$inferSelect;

const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / 86_400_000);

export async function createNotification(
  orgId: string, candidate: AlertCandidate, dedupeDate: string,
): Promise<void> {
  await db.insert(notifications).values({
    orgId,
    severity: candidate.severity,
    category: candidate.category,
    title: candidate.title,
    body: candidate.body ?? null,
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    targetUserId: candidate.targetUserId ?? null,
    dedupeDate,
  }).onConflictDoNothing({
    target: [notifications.orgId, notifications.entityType, notifications.entityId, notifications.category, notifications.dedupeDate],
  });
}

/** System job — no AppUser, gated by the route handler's CRON_SECRET, not assertCan.
 *  Scoped to what exists today: no payments/stock/reorder-cadence alerts (Phase 2). */
export async function runAlertScan(orgId: string, now: Date = new Date()): Promise<{ created: number }> {
  const today = istDayKey(now);
  const candidates: AlertCandidate[] = [];

  const followUps = await getFollowUpBuckets(orgId, { now });
  for (const l of followUps.overdue) {
    const daysOverdue = l.nextFollowUpAt ? daysBetween(now, new Date(l.nextFollowUpAt)) : 0;
    candidates.push(followUpOverdueAlert({
      leadId: l.id, businessName: l.businessName, daysOverdue, assignedEmployeeId: l.assignedEmployeeId,
    }));
  }

  const staleDays = await getConfig(orgId, 'staleQuotationDays');
  const sent = await listQuotations(orgId, { status: 'SENT' });
  for (const q of sent) {
    const daysSinceSent = daysBetween(now, new Date(q.quoteDate));
    if (daysSinceSent >= staleDays) {
      candidates.push(quotationStaleAlert({
        quotationId: q.id, quoteNo: q.quoteNo, daysSinceSent, employeeId: q.employeeId,
      }));
    }
  }

  const dists = await listDistributors(orgId);
  for (const d of dists) {
    if (d.reviewDate) {
      const daysOverdue = daysBetween(now, new Date(`${d.reviewDate}T00:00:00+05:30`));
      if (daysOverdue >= 0) {
        candidates.push(distributorReviewDueAlert({ distributorId: d.id, businessName: d.businessName, daysOverdue }));
      }
    }
    if (d.status === 'TEMP_INACTIVE') {
      candidates.push(inactiveDistributorAlert({ distributorId: d.id, businessName: d.businessName }));
    }
  }

  const territories = await listTerritories(orgId);
  const distTerritoryIds = new Set(dists.map((d) => d.territoryId).filter((x): x is string => x != null));
  for (const t of territories) {
    if (!distTerritoryIds.has(t.id)) {
      candidates.push(emptyTerritoryAlert({ territoryId: t.id, name: t.name }));
    }
  }

  const yesterday = new Date(now.getTime() - 86_400_000);
  const yesterdayYmd = istDayKey(yesterday);
  const emps = await listEmployees(orgId, { activeOnly: true });
  const reportRows = await db.select({ employeeId: employeeDailyReports.employeeId })
    .from(employeeDailyReports)
    .where(and(eq(employeeDailyReports.orgId, orgId), eq(employeeDailyReports.reportDate, yesterdayYmd)));
  const reported = new Set(reportRows.map((r) => r.employeeId));
  for (const e of emps) {
    if (!reported.has(e.id)) {
      candidates.push(missingDailyReportAlert({ employeeId: e.id, employeeName: e.name, date: yesterdayYmd }));
    }
  }

  let created = 0;
  for (const c of candidates) {
    const before = await db.select().from(notifications).where(and(
      eq(notifications.orgId, orgId), eq(notifications.entityType, c.entityType),
      eq(notifications.entityId, c.entityId), eq(notifications.category, c.category),
      eq(notifications.dedupeDate, today),
    ));
    if (before.length === 0) {
      await createNotification(orgId, c, today);
      created++;
    }
  }
  return { created };
}

/** The same org + role/employee visibility rule `listNotifications` and `markRead`/
 *  `markAllRead` all need: OWNER sees every row for the org; anyone else only sees
 *  rows targeted at their own employeeId, or untargeted/org-wide rows. */
function visibilityConds(user: AppUser) {
  const conds = [eq(notifications.orgId, user.orgId)];
  if (user.role !== 'OWNER') {
    // targetUserId stores an *employee* id (see followUpOverdueAlert's
    // assignedEmployeeId / missingDailyReportAlert's employeeId), not the AppUser.id
    // (the Supabase auth uid) — so the "own" match must go through employeeId.
    conds.push(user.employeeId
      ? or(isNull(notifications.targetUserId), eq(notifications.targetUserId, user.employeeId))!
      : isNull(notifications.targetUserId));
  }
  return conds;
}

export async function listNotifications(
  user: AppUser, opts: { unreadOnly?: boolean; limit?: number } = {},
): Promise<NotificationRow[]> {
  const conds = visibilityConds(user);
  if (opts.unreadOnly) conds.push(isNull(notifications.readAt));
  return db.select().from(notifications).where(and(...conds))
    .orderBy(desc(notifications.createdAt)).limit(opts.limit ?? 50);
}

export async function markRead(user: AppUser, id: string): Promise<NotificationRow> {
  // Load first and check the caller's visibility scope (same rule as `listNotifications`)
  // before mutating — otherwise any authenticated user could mark an arbitrary
  // notification (including one targeted at a different employee) as read.
  const [existing] = await db.select().from(notifications)
    .where(and(eq(notifications.id, id), ...visibilityConds(user)));
  if (!existing) throw new Error('not found');
  const [row] = await db.update(notifications).set({ readAt: new Date() })
    .where(eq(notifications.id, id)).returning();
  return row;
}

/** Marks every notification currently visible to `user` (per `visibilityConds`) as
 *  read. Used by the "mark all read" bell action. */
export async function markAllRead(user: AppUser): Promise<{ updated: number }> {
  const rows = await db.update(notifications).set({ readAt: new Date() })
    .where(and(...visibilityConds(user), isNull(notifications.readAt))).returning({ id: notifications.id });
  return { updated: rows.length };
}

export async function unreadCount(user: AppUser): Promise<number> {
  return (await listNotifications(user, { unreadOnly: true, limit: 999 })).length;
}
