import { and, desc, eq, gte, isNull, lt, lte } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { activities, distributorLeads, employeeDailyReports } from '@/server/db/schema/crm';
import { employees } from '@/server/db/schema/identity';
import { dailyReportSchema } from '@/lib/schemas';
import { assertCan } from '@/server/auth/permissions';
import { stageRank, type LeadStage } from '@/domain/pipeline';
import type { AppUser } from '@/server/auth/session';
import type { z } from 'zod';

export type ReportRow = typeof employeeDailyReports.$inferSelect;
// Callers pass raw form values; `reportDate` coercion + `areasVisited` default come from the schema.
export type DailyReportInput = z.input<typeof dailyReportSchema>;

const IST_OFFSET_MIN = 330;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** UTC Date bounds `[start, end)` for the IST calendar day that `date` falls in. */
export function istDayBounds(date: Date): { start: Date; end: Date } {
  const shifted = new Date(date.getTime() + IST_OFFSET_MIN * 60_000);
  const midnightUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  const start = new Date(midnightUtc - IST_OFFSET_MIN * 60_000);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export async function submitReport(user: AppUser, input: DailyReportInput): Promise<ReportRow> {
  assertCan(user, 'dailyReport.submit');
  if (!user.employeeId) throw new Error('no employee record');
  const d = dailyReportSchema.parse(input);
  const now = new Date();
  const values = {
    areasVisited: d.areasVisited,
    notes: d.notes || null,
    blockers: d.blockers || null,
    submittedAt: now,
  };
  const [row] = await db.insert(employeeDailyReports)
    .values({ orgId: user.orgId, employeeId: user.employeeId, reportDate: ymd(d.reportDate), ...values })
    .onConflictDoUpdate({
      target: [employeeDailyReports.orgId, employeeDailyReports.employeeId, employeeDailyReports.reportDate],
      set: values,
    })
    .returning();
  return row;
}

/** Activity totals and funnel movement for one employee on the IST day of `date`.
 *  The two groups are reported separately and MUST NOT be summed (spec §5.7). */
export async function deriveCounts(
  orgId: string,
  employeeId: string,
  date: Date,
): Promise<{ activity: Record<string, number>; funnel: Record<string, number> }> {
  const { start, end } = istDayBounds(date);

  const acts = await db.select({ type: activities.type }).from(activities).where(and(
    eq(activities.orgId, orgId),
    eq(activities.employeeId, employeeId),
    gte(activities.occurredAt, start),
    lt(activities.occurredAt, end),
    isNull(activities.deletedAt),
  ));
  const n = (t: string) => acts.filter((a) => a.type === t).length;
  const activity = {
    calls: n('CALL'),
    meetings: n('MEETING'),
    presentations: n('PRESENTATION'),
    followUpsCompleted: n('FOLLOW_UP'),
    quotations: n('QUOTATION'),
  };

  const leads = await db.select({
    createdAt: distributorLeads.createdAt,
    updatedAt: distributorLeads.updatedAt,
    stage: distributorLeads.stage,
  }).from(distributorLeads).where(and(
    eq(distributorLeads.orgId, orgId),
    eq(distributorLeads.assignedEmployeeId, employeeId),
    isNull(distributorLeads.deletedAt),
  ));
  const inDay = (d: Date | null) => d != null && d >= start && d < end;
  // ponytail: funnel counts below use `updated_at` on the day as a proxy for "moved to
  // this stage that day". Ceiling: a lead edited for any other reason that day
  // double-counts. Upgrade path: derive from `audit_log` setStage rows in M3.
  // Logged in docs/PONYTAIL-DEBT.md.
  const movedTo = (s: LeadStage) => leads.filter((l) => l.stage === s && inDay(l.updatedAt)).length;
  const funnel = {
    newLeads: leads.filter((l) => inDay(l.createdAt)).length,
    qualifiedLeads: leads.filter(
      (l) => stageRank(l.stage as LeadStage) >= stageRank('QUALIFIED') && inDay(l.updatedAt),
    ).length,
    appointments: movedTo('APPOINTED'),
    firstOrders: movedTo('FIRST_ORDER'),
  };

  return { activity, funnel };
}

export type EnrichedReport = ReportRow & {
  employeeName: string | null;
  counts: Awaited<ReturnType<typeof deriveCounts>>;
};

export async function listReports(
  orgId: string,
  opts: { employeeId?: string; from?: Date; to?: Date } = {},
): Promise<EnrichedReport[]> {
  const conds = [eq(employeeDailyReports.orgId, orgId)];
  if (opts.employeeId) conds.push(eq(employeeDailyReports.employeeId, opts.employeeId));
  if (opts.from) conds.push(gte(employeeDailyReports.reportDate, ymd(opts.from)));
  if (opts.to) conds.push(lte(employeeDailyReports.reportDate, ymd(opts.to)));

  const rows = await db.select({ report: employeeDailyReports, employeeName: employees.name })
    .from(employeeDailyReports)
    .leftJoin(employees, eq(employees.id, employeeDailyReports.employeeId))
    .where(and(...conds))
    .orderBy(desc(employeeDailyReports.reportDate), desc(employeeDailyReports.submittedAt));

  return Promise.all(rows.map(async ({ report, employeeName }) => ({
    ...report,
    employeeName,
    counts: await deriveCounts(orgId, report.employeeId, new Date(report.reportDate)),
  })));
}
