import { and, eq, gte, lt, isNull } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { activities, distributorLeads } from '@/server/db/schema/crm';
import { stageRank, type LeadStage } from '@/domain/pipeline';
import { listEmployees } from './employee';
import { IST_OFFSET_MIN } from './dailyReport';

/** UTC bounds `[start of from's IST day, end of to's IST day)`. Genuinely different
 *  math from the single-day `istDayKey`/`istDayBounds` helpers in `dailyReport.ts` (a
 *  range, not one day) — this stays its own function, but imports the shared offset
 *  constant above instead of redefining it (see the plan's IST Global Constraint). */
export function istRangeBounds(from: Date, to: Date): { start: Date; end: Date } {
  const shift = (d: Date) => new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  const startShifted = shift(from);
  const endShifted = shift(to);
  const startUtc = Date.UTC(startShifted.getUTCFullYear(), startShifted.getUTCMonth(), startShifted.getUTCDate());
  const endUtcExclusive = Date.UTC(endShifted.getUTCFullYear(), endShifted.getUTCMonth(), endShifted.getUTCDate()) + 86_400_000;
  return {
    start: new Date(startUtc - IST_OFFSET_MIN * 60_000),
    end: new Date(endUtcExclusive - IST_OFFSET_MIN * 60_000),
  };
}

export interface ScorecardCounts {
  activity: { calls: number; meetings: number; presentations: number; followUpsCompleted: number; quotations: number };
  funnel: { newLeads: number; qualifiedLeads: number; appointments: number; firstOrders: number };
}

/** Activity + funnel counts for one employee across `[from, to]` (inclusive IST days).
 *  The two groups are reported separately and MUST NOT be summed (spec §5.7). Mirrors
 *  `dailyReport.ts`'s `deriveCounts` query shape, generalized from one IST day to a range. */
export async function scorecardCounts(
  orgId: string, employeeId: string, from: Date, to: Date,
): Promise<ScorecardCounts> {
  const { start, end } = istRangeBounds(from, to);

  const acts = await db.select({ type: activities.type }).from(activities).where(and(
    eq(activities.orgId, orgId), eq(activities.employeeId, employeeId),
    gte(activities.occurredAt, start), lt(activities.occurredAt, end),
    isNull(activities.deletedAt),
  ));
  const n = (t: string) => acts.filter((a) => a.type === t).length;
  const activity = {
    calls: n('CALL'), meetings: n('MEETING'), presentations: n('PRESENTATION'),
    followUpsCompleted: n('FOLLOW_UP'), quotations: n('QUOTATION'),
  };

  const leads = await db.select({
    createdAt: distributorLeads.createdAt, updatedAt: distributorLeads.updatedAt, stage: distributorLeads.stage,
  }).from(distributorLeads).where(and(
    eq(distributorLeads.orgId, orgId), eq(distributorLeads.assignedEmployeeId, employeeId),
    isNull(distributorLeads.deletedAt),
  ));
  const inRange = (d: Date | null) => d != null && d >= start && d < end;
  const movedTo = (s: LeadStage) => leads.filter((l) => l.stage === s && inRange(l.updatedAt)).length;
  const funnel = {
    newLeads: leads.filter((l) => inRange(l.createdAt)).length,
    qualifiedLeads: leads.filter((l) => stageRank(l.stage as LeadStage) >= stageRank('QUALIFIED') && inRange(l.updatedAt)).length,
    appointments: movedTo('APPOINTED'),
    firstOrders: movedTo('FIRST_ORDER'),
  };
  return { activity, funnel };
}

export interface EmployeeScorecard {
  employeeId: string;
  employeeName: string;
  counts: ScorecardCounts;
}

export async function listScorecards(
  orgId: string, from: Date, to: Date, opts: { employeeId?: string } = {},
): Promise<EmployeeScorecard[]> {
  const emps = (await listEmployees(orgId, { activeOnly: true }))
    .filter((e) => !opts.employeeId || e.id === opts.employeeId);
  return Promise.all(emps.map(async (e) => ({
    employeeId: e.id, employeeName: e.name,
    counts: await scorecardCounts(orgId, e.id, from, to),
  })));
}

const day = 86_400_000;

export async function weeklyComparison(
  orgId: string, employeeId: string, weekStart: Date,
): Promise<{ thisWeek: ScorecardCounts; lastWeek: ScorecardCounts }> {
  const thisWeekEnd = new Date(weekStart.getTime() + 6 * day);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * day);
  const lastWeekEnd = new Date(weekStart.getTime() - 1 * day);
  const [thisWeek, lastWeek] = await Promise.all([
    scorecardCounts(orgId, employeeId, weekStart, thisWeekEnd),
    scorecardCounts(orgId, employeeId, lastWeekStart, lastWeekEnd),
  ]);
  return { thisWeek, lastWeek };
}
