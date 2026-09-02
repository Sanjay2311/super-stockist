import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { listQuotations, getQuotation } from '@/server/services/quotation';
import { listDistributors } from '@/server/services/distributor';
import { listLeads } from '@/server/services/lead';
import { formatINR } from '@/domain/money';
import { QUOTATION_STATUSES } from '@/lib/schemas';

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, 'quotation.view')) redirect('/');
  const { status } = await searchParams;

  const rows = await listQuotations(user.orgId, { status: status || undefined });
  const [distributors, leads] = await Promise.all([
    listDistributors(user.orgId),
    listLeads(user.orgId, { limit: 1000 }),
  ]);
  const dName = new Map(distributors.map((d) => [d.id, d.businessName]));
  const lName = new Map(leads.map((l) => [l.id, l.businessName]));

  // ponytail: N+1 read to sum each quote's net total — fine for M2b volume.
  // Replace with a SQL SUM(net_amount) GROUP BY quotation_id projection in M3.
  const withTotals = await Promise.all(
    rows.map(async (q) => {
      const full = await getQuotation(user.orgId, q.id);
      const net = full ? full.items.reduce((a, it) => a + it.netAmount, 0) : 0;
      return { q, net };
    }),
  );

  return (
    <main className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Quotations</h1>
        <Link
          href="/quotations/new"
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
        >
          New quotation
        </Link>
      </div>

      <form className="flex flex-wrap gap-2" action="/quotations">
        <select
          name="status"
          defaultValue={status}
          aria-label="Status"
          className="rounded border px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {QUOTATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="rounded border px-3 py-1.5 text-sm">Filter</button>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-neutral-500">
            <th className="py-2">Quote #</th>
            <th>Party</th>
            <th>Status</th>
            <th>Valid until</th>
            <th className="text-right">Net total</th>
          </tr>
        </thead>
        <tbody>
          {withTotals.map(({ q, net }) => (
            <tr key={q.id} className="border-b">
              <td className="py-2">
                <Link href={`/quotations/${q.id}`} className="text-blue-700 hover:underline">
                  {q.quoteNo}
                </Link>
              </td>
              <td>
                {q.distributorId
                  ? dName.get(q.distributorId) ?? '—'
                  : q.leadId
                    ? lName.get(q.leadId) ?? '—'
                    : '—'}
              </td>
              <td>{q.status}</td>
              <td>{new Date(q.validUntil).toLocaleDateString('en-IN')}</td>
              <td className="text-right">{formatINR(net)}</td>
            </tr>
          ))}
          {withTotals.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-neutral-400">
                No quotations yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
