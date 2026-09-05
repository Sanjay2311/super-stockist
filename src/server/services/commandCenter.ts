import { getTodayView } from './task';
import { getFollowUpBuckets } from './followup';
import { dashboardSummary } from '@/domain/dashboard';
import { listLeads } from './lead';
import { listQuotations, listPendingApprovals } from './quotation';
import { listDistributors } from './distributor';
import { listTerritories } from './territory';
import { OPEN_STAGES, stageRank, funnelConversion, type LeadStage } from '@/domain/pipeline';
import { db } from '@/server/db/client';
import { distributors } from '@/server/db/schema/distributor';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { employeeDailyReports } from '@/server/db/schema/crm';
import { listEmployees } from './employee';
import { istDayBounds, istDayKey } from './dailyReport';
import { can } from '@/server/auth/permissions';
import type { AppUser } from '@/server/auth/session';

const day = 86_400_000;

export interface CommandCenterSummary {
  mode: 'morning' | 'eod';
  yesterday: { activityCount: number; quotationsSent: number; quotationsSentValue: number };
  today: { meetingsToday: number; followUpsDueToday: number; openQuotations: number };
  forecast: { weightedPipeline: number; hotDeals: number; quotationsExpiring7d: number; quotationsExpiring30d: number };
  attention: {
    // OWNER-only fields (permission-gated below) — `null` for a role that lacks the
    // underlying permission, so a SALES caller never receives the value at all.
    pendingApprovals: number | null;
    hotLeadsNoAction: { id: string; businessName: string }[];
    exclusivityOverrides: { id: string; businessName: string }[] | null;
    missingDailyReports: number | null;
  };
  growth: { newDistributorsMtd: number; territoryCoveragePct: number };
  kpis: {
    totalLeads: number; qualifiedLeads: number; appointedDistributors: number; activeDistributors: number;
    openQuotationsValue: number; avgLeadScore: number;
  };
  funnel: ReturnType<typeof funnelConversion>;
}

export async function commandCenterSummary(user: AppUser, mode: 'morning' | 'eod'): Promise<CommandCenterSummary> {
  const orgId = user.orgId;
  const now = new Date();
  // Same scoping rule as the M1 dashboard / `/today`: a SALES rep only ever sees their
  // own leads, tasks and follow-ups here. Quotations/distributors stay org-wide because
  // that already matches every other SALES-visible screen in the app (`/quotations`,
  // `/distributors` show all org rows to SALES too) — only the lead-derived reads below
  // are the ones this bug leaked unscoped.
  const scope = user.role === 'SALES' && user.employeeId ? { assignedEmployeeId: user.employeeId } : {};
  const canViewApprovals = can(user, 'quotation.approve');
  const canViewDailyReports = can(user, 'dailyReport.viewAll');
  const canViewExclusivity = can(user, 'distributor.edit');

  const [leads, allQuotations, sentQuotations, pending, dists, territories, view, followUps] = await Promise.all([
    listLeads(orgId, { ...scope, limit: 1000 }),
    listQuotations(orgId, {}),
    listQuotations(orgId, { status: 'SENT' }),
    canViewApprovals ? listPendingApprovals(orgId) : Promise.resolve([]),
    listDistributors(orgId),
    listTerritories(orgId),
    getTodayView(orgId, scope),
    getFollowUpBuckets(orgId, scope),
  ]);

  const openLeads = leads.filter((l) => OPEN_STAGES.includes(l.stage as LeadStage));
  const { funnel, weightedPipeline } = dashboardSummary(openLeads.map((l) => ({
    stage: l.stage as LeadStage, expectedFfMonthlyPotential: l.expectedFfMonthlyPotential, probability: l.probability,
  })));

  // IST month-start, matching the shared `istDayBounds` day-key math (not
  // server-local/UTC `getFullYear`/`getMonth`) — see `dailyReport.ts`.
  const [nowY, nowM] = istDayKey(now).split('-').map(Number);
  const startOfMonthIst = istDayBounds(new Date(Date.UTC(nowY, nowM - 1, 1))).start;
  const inMonth = (d: Date) => d >= startOfMonthIst;
  const newDistributorsMtd = dists.filter((d) => inMonth(d.createdAt)).length;
  const territoriesWithDist = new Set(dists.map((d) => d.territoryId).filter((x): x is string => x != null));
  const territoryCoveragePct = territories.length === 0 ? 0 : Math.round((territoriesWithDist.size / territories.length) * 100);

  const yesterday = new Date(now.getTime() - day);
  const { start: yesterdayStart, end: yesterdayEnd } = istDayBounds(yesterday);
  const quotationsCreatedYesterday = allQuotations.filter((q) => q.createdAt >= yesterdayStart && q.createdAt < yesterdayEnd);

  // §-gated: only an OWNER (dailyReport.viewAll) ever sees compliance counts.
  let missingDailyReports: number | null = null;
  if (canViewDailyReports) {
    const yesterdayYmd = istDayKey(yesterday);
    const activeEmployees = await listEmployees(orgId, { activeOnly: true });
    const reportedYesterday = await db.select({ employeeId: employeeDailyReports.employeeId })
      .from(employeeDailyReports)
      .where(and(eq(employeeDailyReports.orgId, orgId), eq(employeeDailyReports.reportDate, yesterdayYmd)));
    const reportedSet = new Set(reportedYesterday.map((r) => r.employeeId));
    missingDailyReports = activeEmployees.filter((e) => !reportedSet.has(e.id)).length;
  }

  // Gated: exclusivity overrides are a raw list of commercially-sensitive
  // distributor terms — only computed for a role that can edit distributors (OWNER).
  let overrideRows: { id: string; businessName: string }[] | null = null;
  if (canViewExclusivity) {
    overrideRows = await db.select({ id: distributors.id, businessName: distributors.businessName })
      .from(distributors)
      .where(and(eq(distributors.orgId, orgId), isNull(distributors.deletedAt), isNotNull(distributors.exclusivityNote)));
  }

  const in7 = new Date(now.getTime() + 7 * day);
  const in30 = new Date(now.getTime() + 30 * day);
  const quotationsExpiring7d = sentQuotations.filter((q) => new Date(q.validUntil) <= in7).length;
  const quotationsExpiring30d = sentQuotations.filter((q) => new Date(q.validUntil) <= in30).length;

  return {
    mode,
    yesterday: {
      activityCount: 0, // ponytail: an org-wide "activities logged yesterday" count needs a
      // dedicated query across all employees — deferred to the per-employee scorecard
      // (Task 3), which already covers this per-employee. Cross-employee rollup here is
      // a straightforward follow-up, not added now to keep this task's query count bounded.
      quotationsSent: quotationsCreatedYesterday.length,
      quotationsSentValue: 0, // ponytail: needs a per-quotation netAmount sum on
      // quotationsCreatedYesterday — same N+1-avoidance rationale as
      // kpis.openQuotationsValue below; deferred together.
    },
    today: {
      meetingsToday: view.tasks.today.filter((t) => t.type === 'MEETING').length,
      followUpsDueToday: followUps.today.length,
      openQuotations: sentQuotations.length,
    },
    forecast: {
      weightedPipeline,
      hotDeals: openLeads.filter((l) => l.grade === 'A').length,
      quotationsExpiring7d,
      quotationsExpiring30d,
    },
    attention: {
      pendingApprovals: canViewApprovals ? pending.length : null,
      hotLeadsNoAction: followUps.hotNoAction.map((l) => ({ id: l.id, businessName: l.businessName })),
      exclusivityOverrides: overrideRows,
      missingDailyReports,
    },
    growth: { newDistributorsMtd, territoryCoveragePct },
    kpis: {
      totalLeads: leads.length,
      qualifiedLeads: leads.filter((l) => stageRank(l.stage as LeadStage) >= stageRank('QUALIFIED')).length,
      appointedDistributors: dists.filter((d) => d.status === 'APPROVED').length,
      activeDistributors: dists.filter((d) => d.status === 'ACTIVE').length,
      openQuotationsValue: 0, // ponytail: needs per-quotation netAmount sum via a join;
      // deferred alongside the row-by-row totals debt already logged for the quotation
      // list screen (M2b PONYTAIL-DEBT) rather than duplicating that N+1 pattern here.
      avgLeadScore: leads.length === 0 ? 0 : Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length),
    },
    funnel,
  };
}
