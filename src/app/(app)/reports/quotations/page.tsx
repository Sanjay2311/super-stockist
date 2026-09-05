import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { quotationsReport } from '@/server/services/reports';
import { listTerritories } from '@/server/services/territory';
import { listEmployees } from '@/server/services/employee';
import { parseFilters } from '@/lib/filters';
import { GlobalFilters } from '@/components/global-filters';
import { formatINR } from '@/domain/money';

export default async function QuotationsReportPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!can(user, 'dailyReport.viewAll')) redirect('/');
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [report, territories, employees] = await Promise.all([
    quotationsReport(user.orgId, filters),
    listTerritories(user.orgId),
    listEmployees(user.orgId, { activeOnly: true }),
  ]);

  return (
    <main className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Quotations report</h1>
        <a href={`/api/reports/quotations/export?${new URLSearchParams(sp as Record<string, string>).toString()}`}
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
                <th className="pr-3">Count</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {report.byStatus.map((r) => (
                <tr key={r.status} className="border-b">
                  <td className="py-2 pr-3">{r.status}</td>
                  <td className="pr-3">{r.count}</td>
                  <td>{formatINR(r.value)}</td>
                </tr>
              ))}
              {report.byStatus.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-neutral-400">No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="mb-2 font-medium">By distributor</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-neutral-500">
                <th className="py-2 pr-3">Distributor</th>
                <th className="pr-3">Count</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {report.byDistributor.map((r) => (
                <tr key={r.businessName} className="border-b">
                  <td className="py-2 pr-3">{r.businessName}</td>
                  <td className="pr-3">{r.count}</td>
                  <td>{formatINR(r.value)}</td>
                </tr>
              ))}
              {report.byDistributor.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-neutral-400">No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="mb-2 font-medium">By employee</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-neutral-500">
                <th className="py-2 pr-3">Employee</th>
                <th className="pr-3">Count</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {report.byEmployee.map((r) => (
                <tr key={r.employeeName} className="border-b">
                  <td className="py-2 pr-3">{r.employeeName}</td>
                  <td className="pr-3">{r.count}</td>
                  <td>{formatINR(r.value)}</td>
                </tr>
              ))}
              {report.byEmployee.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-neutral-400">No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
