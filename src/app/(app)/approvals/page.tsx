import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { listPendingApprovals } from '@/server/services/quotation';
import { formatINR } from '@/domain/money';
import { decideApprovalAction } from './actions';

export default async function ApprovalsPage() {
  const user = await requireUser();
  if (!can(user, 'quotation.approve')) redirect('/');

  const rows = await listPendingApprovals(user.orgId);

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Price approvals</h1>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-neutral-500">
            <th className="py-2">Quote #</th>
            <th>Product</th>
            <th className="text-right">Qty</th>
            <th className="text-right">List</th>
            <th className="text-right">Requested</th>
            <th className="text-right">Gap %</th>
            <th>Band</th>
            <th>Requested by</th>
            <th>Decision</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const gap =
              r.originalRate > 0
                ? ((r.requestedRate - r.originalRate) / r.originalRate) * 100
                : 0;
            // §16: "below floor" is blocked-unless-override; "[floor,target)" is
            // ordinary admin approval. The reason string already distinguishes them.
            const belowFloor = (r.reason ?? '').startsWith('below floor');
            return (
              <tr key={r.id} className="border-b align-top">
                <td className="py-2">
                  <Link
                    href={`/quotations/${r.quotationId}`}
                    className="text-blue-700 hover:underline"
                  >
                    {r.quoteNo}
                  </Link>
                </td>
                <td>{r.productName || '—'}</td>
                <td className="text-right">{r.qty}</td>
                <td className="text-right">{formatINR(r.originalRate)}</td>
                <td className="text-right">{formatINR(r.requestedRate)}</td>
                <td className="text-right">{gap.toFixed(1)}%</td>
                <td>
                  <span
                    className={
                      belowFloor
                        ? 'rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700'
                        : 'rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700'
                    }
                  >
                    {belowFloor ? 'below floor' : 'needs approval'}
                  </span>
                </td>
                <td className="text-neutral-500">{r.requestedBy}</td>
                <td>
                  <div className="flex flex-wrap items-end gap-2">
                    <form
                      action={decideApprovalAction.bind(null, r.id, 'APPROVED')}
                      className="flex items-end gap-2"
                    >
                      <input
                        name="note"
                        placeholder="note (optional)"
                        className="rounded border px-2 py-1 text-sm"
                      />
                      <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white">
                        Approve
                      </button>
                    </form>
                    <form action={decideApprovalAction.bind(null, r.id, 'REJECTED')}>
                      <button className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700">
                        Reject
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="py-6 text-center text-neutral-400">
                No price approvals waiting.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
