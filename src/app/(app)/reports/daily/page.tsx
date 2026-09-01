import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { listReports } from '@/server/services/dailyReport';

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

export default async function DailyReportsPage() {
  const user = await requireUser();
  if (!can(user, 'dailyReport.viewAll')) redirect('/');

  const reports = await listReports(user.orgId);

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Daily Reports</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left align-top text-neutral-500">
              <th className="py-2 pr-3">Date</th>
              <th className="pr-3">Employee</th>
              <th className="pr-3">Areas</th>
              <th className="pr-3">Activity</th>
              <th className="pr-3">Funnel</th>
              <th className="pr-3">Notes</th>
              <th>Blockers</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} className="border-b align-top">
                <td className="py-2 pr-3 whitespace-nowrap">{r.reportDate}</td>
                <td className="pr-3">{r.employeeName ?? '—'}</td>
                <td className="pr-3">{(r.areasVisited as string[]).join(', ') || '—'}</td>
                <td className="pr-3 min-w-[9rem]"><CountBlock rows={ACTIVITY_ROWS} counts={r.counts.activity} /></td>
                <td className="pr-3 min-w-[9rem]"><CountBlock rows={FUNNEL_ROWS} counts={r.counts.funnel} /></td>
                <td className="pr-3 max-w-xs whitespace-pre-wrap text-neutral-600">{r.notes ?? '—'}</td>
                <td className="max-w-xs whitespace-pre-wrap text-neutral-600">{r.blockers ?? '—'}</td>
              </tr>
            ))}
            {reports.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-neutral-400">No reports submitted yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
