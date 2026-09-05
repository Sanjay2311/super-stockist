import * as XLSX from 'xlsx';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { pipelineReport, quotationsReport, employeesReport, distributorsReport } from '@/server/services/reports';
import { parseFilters } from '@/lib/filters';

export const dynamic = 'force-dynamic';

const KINDS = ['pipeline', 'quotations', 'employees', 'distributors'] as const;
type Kind = (typeof KINDS)[number];

function flatten(kind: Kind, report: unknown): Record<string, unknown>[] {
  switch (kind) {
    case 'pipeline': {
      const r = report as Awaited<ReturnType<typeof pipelineReport>>;
      return [
        ...r.byStage.map((x) => ({ cut: 'stage', key: x.stage, count: x.count })),
        ...r.byTerritory.map((x) => ({ cut: 'territory', key: x.territoryName ?? '—', count: x.count })),
        ...r.byEmployee.map((x) => ({ cut: 'employee', key: x.employeeName ?? '—', count: x.count })),
        ...r.lossReasons.map((x) => ({ cut: 'loss_reason', key: x.reason, count: x.count })),
      ];
    }
    case 'quotations': {
      const r = report as Awaited<ReturnType<typeof quotationsReport>>;
      return [
        ...r.byStatus.map((x) => ({ cut: 'status', key: x.status, count: x.count, valuePaise: x.value })),
        ...r.byDistributor.map((x) => ({ cut: 'distributor', key: x.businessName, count: x.count, valuePaise: x.value })),
        ...r.byEmployee.map((x) => ({ cut: 'employee', key: x.employeeName ?? '—', count: x.count, valuePaise: x.value })),
      ];
    }
    case 'employees': {
      const r = report as Awaited<ReturnType<typeof employeesReport>>;
      return r.map((e) => ({
        employee: e.employeeName,
        calls: e.counts.activity.calls, meetings: e.counts.activity.meetings,
        presentations: e.counts.activity.presentations, followUpsCompleted: e.counts.activity.followUpsCompleted,
        quotations: e.counts.activity.quotations,
        newLeads: e.counts.funnel.newLeads, qualifiedLeads: e.counts.funnel.qualifiedLeads,
        appointments: e.counts.funnel.appointments, firstOrders: e.counts.funnel.firstOrders,
      }));
    }
    case 'distributors': {
      const r = report as Awaited<ReturnType<typeof distributorsReport>>;
      return [
        ...r.byStatus.map((x) => ({ cut: 'status', key: x.status, count: x.count })),
        ...r.byGrade.map((x) => ({ cut: 'grade', key: x.grade ?? '—', count: x.count })),
        ...r.byTerritory.map((x) => ({ cut: 'territory', key: x.territoryName ?? '—', count: x.count })),
        ...r.dailyReportCompliance.map((x) => ({ cut: 'daily_report', key: x.employeeName, count: x.submitted })),
      ];
    }
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await requireUser();
  if (!can(user, 'dailyReport.viewAll')) redirect('/');
  const { kind } = await params;
  if (!KINDS.includes(kind as Kind)) return new Response('not found', { status: 404 });

  const url = new URL(req.url);
  const sp: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { sp[k] = v; });
  const filters = parseFilters(sp);

  const report = kind === 'pipeline' ? await pipelineReport(user.orgId, filters)
    : kind === 'quotations' ? await quotationsReport(user.orgId, filters)
    : kind === 'employees' ? await employeesReport(user.orgId, filters)
    : await distributorsReport(user.orgId, filters);

  const rows = flatten(kind as Kind, report);
  const sheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(sheet);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${kind}-report.csv"`,
    },
  });
}
