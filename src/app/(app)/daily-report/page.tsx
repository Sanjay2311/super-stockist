import { requireUser } from '@/server/auth/session';
import { deriveCounts } from '@/server/services/dailyReport';
import { submitDailyReport } from './actions';

const ACTIVITY_LABELS: Record<string, string> = {
  calls: 'Calls',
  meetings: 'Meetings',
  presentations: 'Presentations',
  followUpsCompleted: 'Follow-ups done',
  quotations: 'Quotations',
};
const FUNNEL_LABELS: Record<string, string> = {
  newLeads: 'New leads',
  qualifiedLeads: 'Qualified',
  appointments: 'Appointments',
  firstOrders: 'First orders',
};

function Tiles({ labels, counts }: { labels: Record<string, string>; counts: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {Object.entries(labels).map(([key, label]) => (
        <div key={key} className="rounded border px-3 py-2">
          <div className="text-lg font-semibold">{counts[key] ?? 0}</div>
          <div className="text-xs text-neutral-500">{label}</div>
        </div>
      ))}
    </div>
  );
}

export default async function DailyReportPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const user = await requireUser();
  const { done } = await searchParams;

  if (!user.employeeId) {
    return (
      <main className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Daily Report</h1>
        <p className="text-sm text-neutral-500">No employee record linked — ask the owner.</p>
      </main>
    );
  }

  const today = new Date();
  const counts = await deriveCounts(user.orgId, user.employeeId, today);

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Daily Report</h1>

      {done === '1' && (
        <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          Report submitted.
        </p>
      )}

      <form action={submitDailyReport} className="max-w-lg space-y-3 rounded border p-4">
        <label className="block text-sm">
          Date
          <input
            name="reportDate"
            type="date"
            required
            defaultValue={today.toISOString().slice(0, 10)}
            className="mt-1 block rounded border px-2 py-1"
          />
        </label>
        <label className="block text-sm">
          Areas visited <span className="text-neutral-400">(comma-separated)</span>
          <input name="areasVisited" placeholder="Whitefield, Hoodi" className="mt-1 block w-full rounded border px-2 py-1" />
        </label>
        <label className="block text-sm">
          Notes
          <textarea name="notes" rows={3} className="mt-1 block w-full rounded border px-2 py-1" />
        </label>
        <label className="block text-sm">
          Blockers
          <textarea name="blockers" rows={2} className="mt-1 block w-full rounded border px-2 py-1" />
        </label>
        <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Submit report</button>
      </form>

      <section className="space-y-4">
        <p className="text-sm text-neutral-500">
          Today&apos;s activity, auto-counted. The two groups are tracked separately — they are never added together.
        </p>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-neutral-600">Activity</h2>
          <Tiles labels={ACTIVITY_LABELS} counts={counts.activity} />
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-neutral-600">Funnel</h2>
          <Tiles labels={FUNNEL_LABELS} counts={counts.funnel} />
        </div>
      </section>
    </main>
  );
}
