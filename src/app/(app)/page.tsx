import Link from 'next/link';
import { requireUser } from '@/server/auth/session';
import { listLeads } from '@/server/services/lead';
import { getTodayView } from '@/server/services/task';
import { OPEN_STAGES, type LeadStage } from '@/domain/pipeline';
import { dashboardSummary } from '@/domain/dashboard';
import { formatINR } from '@/domain/money';

// ponytail: deliberately thin M1 landing page — the full Command Center (six blocks,
// morning/eod modes) is Milestone 3. Tracked in docs/PONYTAIL-DEBT.md.
export default async function DashboardPage() {
  const user = await requireUser();
  const scope =
    user.role === 'SALES' && user.employeeId ? { assignedEmployeeId: user.employeeId } : {};

  const [leads, view] = await Promise.all([
    listLeads(user.orgId, { limit: 500 }),
    getTodayView(user.orgId, scope),
  ]);

  const openLeads = leads
    .filter((l) => OPEN_STAGES.includes(l.stage as LeadStage))
    .map((l) => ({
      stage: l.stage as LeadStage,
      expectedFfMonthlyPotential: l.expectedFfMonthlyPotential,
      probability: l.probability,
    }));
  const { funnel, weightedPipeline } = dashboardSummary(openLeads);
  const { followUps, tasks } = view;

  const Stat = ({ label, value }: { label: string; value: number }) => (
    <div className="rounded border px-3 py-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );

  return (
    <main className="space-y-8 p-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <section className="space-y-3">
        <h2 className="font-semibold">
          Today <Link href="/today" className="ml-2 text-xs font-normal text-blue-700 hover:underline">open →</Link>
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Follow-ups overdue" value={followUps.overdue.length} />
          <Stat label="Follow-ups today" value={followUps.today.length} />
          <Stat label="Follow-ups next 7d" value={followUps.next7.length} />
          <Stat label="Tasks overdue" value={tasks.overdue.length} />
          <Stat label="Tasks today" value={tasks.today.length} />
          <Stat label="Hot · no next action" value={followUps.hotNoAction.length} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Pipeline funnel</h2>
        <ul className="space-y-1">
          {funnel.map((r, i) => (
            <li key={r.key} className="flex items-center gap-3 text-sm">
              <span className="w-44 shrink-0 text-neutral-600">{r.label}</span>
              <span className="inline-block h-4 rounded bg-blue-600" style={{ width: `${Math.min(r.count * 12, 240)}px` }} />
              <span className="tabular-nums">{r.count}</span>
              {i > 0 && (
                <span className="text-xs text-neutral-400">{Math.round(r.convFromPrev ?? 0)}% from prev</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold">Weighted pipeline value</h2>
        <div className="text-2xl font-semibold tabular-nums">{formatINR(weightedPipeline)}</div>
        <p className="text-xs text-neutral-500">Σ expected F&amp;F potential × win probability across {openLeads.length} open leads.</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Leads needing attention</h2>
        <ul className="space-y-1">
          {followUps.hotNoAction.slice(0, 5).map((l) => (
            <li key={l.id} className="rounded border px-3 py-2 text-sm">
              <Link href={`/leads/${l.id}`} className="text-blue-700 hover:underline">{l.businessName}</Link>
              <span className="text-neutral-400"> · {l.stage} · {l.probability}%{l.assignee ? ` · ${l.assignee}` : ''}</span>
            </li>
          ))}
          {followUps.hotNoAction.length === 0 && (
            <li className="text-xs text-neutral-400">No hot leads without a next action.</li>
          )}
        </ul>
      </section>
    </main>
  );
}
