import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { employeesReport } from '@/server/services/reports';
import { listTerritories } from '@/server/services/territory';
import { listEmployees } from '@/server/services/employee';
import { parseFilters } from '@/lib/filters';
import { GlobalFilters } from '@/components/global-filters';

const ACTIVITY_ROWS: [string, string][] = [
  ['calls', 'Calls'],
  ['meetings', 'Meetings'],
  ['presentations', 'Presentations'],
  ['followUpsCompleted', 'Follow-ups'],
  ['quotations', 'Quotations'],
];
const FUNNEL_ROWS: [string, string][] = [
  ['newLeads', 'New'],
  ['qualifiedLeads', 'Qualified'],
  ['appointments', 'Appointments'],
  ['firstOrders', 'First orders'],
];

function CountBlock({ rows, counts }: { rows: [string, string][]; counts: Record<string, number> }) {
  return (
    <ul className="space-y-0.5 text-xs">
      {rows.map(([key, label]) => (
        <li key={key} className="flex justify-between gap-3">
          <span className="text-neutral-500">{label}</span>
          <span className="font-medium">{counts[key] ?? 0}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function EmployeesReportPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!can(user, 'dailyReport.viewAll')) redirect('/');
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [report, territories, employees] = await Promise.all([
    employeesReport(user.orgId, filters),
    listTerritories(user.orgId),
    listEmployees(user.orgId, { activeOnly: true }),
  ]);

  return (
    <main className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Employees report</h1>
        <a href={`/api/reports/employees/export?${new URLSearchParams(sp as Record<string, string>).toString()}`}
           className="rounded border px-3 py-1.5 text-sm">Export CSV</a>
      </div>
      <GlobalFilters territories={territories} employees={employees} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left align-top text-neutral-500">
              <th className="py-2 pr-3">Employee</th>
              <th className="pr-3">Activity</th>
              <th>Funnel</th>
            </tr>
          </thead>
          <tbody>
            {report.map((r) => (
              <tr key={r.employeeId} className="border-b align-top">
                <td className="py-2 pr-3 font-medium">{r.employeeName}</td>
                <td className="pr-3 min-w-[9rem]"><CountBlock rows={ACTIVITY_ROWS} counts={r.counts.activity} /></td>
                <td className="min-w-[9rem]"><CountBlock rows={FUNNEL_ROWS} counts={r.counts.funnel} /></td>
              </tr>
            ))}
            {report.length === 0 && (
              <tr><td colSpan={3} className="py-6 text-center text-neutral-400">No data.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
