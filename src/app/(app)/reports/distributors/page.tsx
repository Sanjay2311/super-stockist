import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { distributorsReport } from '@/server/services/reports';
import { listTerritories } from '@/server/services/territory';
import { listEmployees } from '@/server/services/employee';
import { parseFilters } from '@/lib/filters';
import { GlobalFilters } from '@/components/global-filters';

export default async function DistributorsReportPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!can(user, 'dailyReport.viewAll')) redirect('/');
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [report, territories, employees] = await Promise.all([
    distributorsReport(user.orgId, filters),
    listTerritories(user.orgId),
    listEmployees(user.orgId, { activeOnly: true }),
  ]);

  return (
    <main className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Distributors report</h1>
        <a href={`/api/reports/distributors/export?${new URLSearchParams(sp as Record<string, string>).toString()}`}
           className="rounded border px-3 py-1.5 text-sm">Export CSV</a>
      </div>
      <GlobalFilters territories={territories} employees={employees} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-2 font-medium">By status</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-neutral-500">
                <th className="py-2 pr-3">Status</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {report.byStatus.map((r) => (
                <tr key={r.status} className="border-b">
                  <td className="py-2 pr-3">{r.status}</td>
                  <td>{r.count}</td>
                </tr>
              ))}
              {report.byStatus.length === 0 && (
                <tr><td colSpan={2} className="py-4 text-center text-neutral-400">No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="mb-2 font-medium">By grade</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-neutral-500">
                <th className="py-2 pr-3">Grade</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {report.byGrade.map((r) => (
                <tr key={r.grade ?? '—'} className="border-b">
                  <td className="py-2 pr-3">{r.grade ?? '—'}</td>
                  <td>{r.count}</td>
                </tr>
              ))}
              {report.byGrade.length === 0 && (
                <tr><td colSpan={2} className="py-4 text-center text-neutral-400">No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="mb-2 font-medium">By territory</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-neutral-500">
                <th className="py-2 pr-3">Territory</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {report.byTerritory.map((r) => (
                <tr key={r.territoryName ?? '—'} className="border-b">
                  <td className="py-2 pr-3">{r.territoryName ?? '—'}</td>
                  <td>{r.count}</td>
                </tr>
              ))}
              {report.byTerritory.length === 0 && (
                <tr><td colSpan={2} className="py-4 text-center text-neutral-400">No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="mb-2 font-medium">Daily report compliance</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-neutral-500">
                <th className="py-2 pr-3">Employee</th>
                <th className="pr-3">Submitted</th>
                <th>Expected</th>
              </tr>
            </thead>
            <tbody>
              {report.dailyReportCompliance.map((r) => (
                <tr key={r.employeeName} className="border-b">
                  <td className="py-2 pr-3">{r.employeeName}</td>
                  <td className="pr-3">{r.submitted}</td>
                  <td>{r.expected}</td>
                </tr>
              ))}
              {report.dailyReportCompliance.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-neutral-400">No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
