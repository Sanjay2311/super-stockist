import Link from 'next/link';
import { requireUser } from '@/server/auth/session';
import { commandCenterSummary } from '@/server/services/commandCenter';
import { formatINR } from '@/domain/money';
import { ModeToggle } from './mode-toggle';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const user = await requireUser();
  const { mode: rawMode } = await searchParams;
  const mode = rawMode === 'eod' ? 'eod' : 'morning';
  const s = await commandCenterSummary(user, mode);

  const Stat = ({ label, value }: { label: string; value: number | string }) => (
    <div className="rounded border px-3 py-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );

  return (
    <main className="space-y-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Command Center</h1>
        <ModeToggle mode={mode} />
      </div>

      {mode === 'morning' ? (
        <>
          <section className="space-y-3">
            <h2 className="font-semibold">What happened? (yesterday)</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Quotations sent" value={s.yesterday.quotationsSent} />
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">
              What is happening? (today){' '}
              <Link href="/today" className="ml-2 text-xs font-normal text-blue-700 hover:underline">
                open →
              </Link>
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Meetings today" value={s.today.meetingsToday} />
              <Stat label="Follow-ups due today" value={s.today.followUpsDueToday} />
              <Stat label="Open quotations" value={s.today.openQuotations} />
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">What will happen?</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Weighted pipeline" value={formatINR(s.forecast.weightedPipeline)} />
              <Stat label="Hot deals" value={s.forecast.hotDeals} />
              <Stat label="Quotes expiring 7d" value={s.forecast.quotationsExpiring7d} />
              <Stat label="Quotes expiring 30d" value={s.forecast.quotationsExpiring30d} />
            </div>
          </section>
        </>
      ) : (
        <section className="space-y-3">
          <h2 className="font-semibold">Today&apos;s result</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Quotations sent" value={s.yesterday.quotationsSent} />
            <Stat label="Open quotations" value={s.today.openQuotations} />
          </div>
          <h2 className="font-semibold">Tomorrow: priorities</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Follow-ups due" value={s.today.followUpsDueToday} />
            <Stat label="Hot leads, no action" value={s.attention.hotLeadsNoAction.length} />
            {s.attention.pendingApprovals != null && (
              <Stat label="Pending approvals" value={s.attention.pendingApprovals} />
            )}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">What needs my attention?</h2>
        <ul className="space-y-1 text-sm">
          {/* pendingApprovals / exclusivityOverrides / missingDailyReports are `null`
              (not computed) for a role that lacks the underlying permission — e.g. a
              SALES rep — so those three sections simply don't render for them, rather
              than showing an empty box or a literal null. */}
          {s.attention.pendingApprovals != null && s.attention.pendingApprovals > 0 && (
            <li className="rounded border border-amber-300 bg-amber-50 px-3 py-2">
              <Link href="/approvals" className="text-blue-700 hover:underline">
                {s.attention.pendingApprovals} quotation line(s) awaiting price approval
              </Link>
            </li>
          )}
          {s.attention.hotLeadsNoAction.map((l) => (
            <li key={l.id} className="rounded border px-3 py-2">
              <Link href={`/leads/${l.id}`} className="text-blue-700 hover:underline">
                {l.businessName}
              </Link>{' '}
              — hot lead, no next action
            </li>
          ))}
          {s.attention.exclusivityOverrides?.map((d) => (
            <li key={d.id} className="rounded border px-3 py-2">
              <Link href={`/distributors/${d.id}`} className="text-blue-700 hover:underline">
                {d.businessName}
              </Link>{' '}
              — exclusivity override on record
            </li>
          ))}
          {s.attention.missingDailyReports != null && s.attention.missingDailyReports > 0 && (
            <li className="rounded border px-3 py-2">
              {s.attention.missingDailyReports} employee(s) missing yesterday&apos;s daily report
            </li>
          )}
          {!(s.attention.pendingApprovals ?? 0) &&
            s.attention.hotLeadsNoAction.length === 0 &&
            (s.attention.exclusivityOverrides ?? []).length === 0 &&
            !(s.attention.missingDailyReports ?? 0) && (
              <li className="text-neutral-400">Nothing needs attention right now.</li>
            )}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Where is my growth?</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="New distributors (MTD)" value={s.growth.newDistributorsMtd} />
          <Stat label="Territory coverage" value={`${s.growth.territoryCoveragePct}%`} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Key numbers</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Total leads" value={s.kpis.totalLeads} />
          <Stat label="Qualified leads" value={s.kpis.qualifiedLeads} />
          <Stat label="Appointed distributors" value={s.kpis.appointedDistributors} />
          <Stat label="Active distributors" value={s.kpis.activeDistributors} />
          <Stat label="Avg lead score" value={s.kpis.avgLeadScore} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Pipeline funnel</h2>
        <ul className="space-y-1">
          {s.funnel.map((r, i) => (
            <li key={r.key} className="flex items-center gap-3 text-sm">
              <span className="w-44 shrink-0 text-neutral-600">{r.label}</span>
              <span
                className="inline-block h-4 rounded bg-blue-600"
                style={{ width: `${Math.min(r.count * 12, 240)}px` }}
              />
              <span className="tabular-nums">{r.count}</span>
              {i > 0 && (
                <span className="text-xs text-neutral-400">{Math.round(r.convFromPrev ?? 0)}% from prev</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
