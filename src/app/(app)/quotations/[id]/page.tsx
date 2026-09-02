import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import {
  getQuotation,
  redactQuotationItems,
  listPendingApprovals,
} from '@/server/services/quotation';
import { getDistributor } from '@/server/services/distributor';
import { getLead } from '@/server/services/lead';
import { listProducts } from '@/server/services/product';
import { computeQuoteLine, quoteTotals } from '@/domain/quote';
import { formatINR } from '@/domain/money';
import { QUOTATION_STATUSES } from '@/lib/schemas';
import { submitQuotationAction, setStatusAction } from '../actions';
import { decideApprovalAction } from '../../approvals/actions';
import { CopyWhatsApp } from './copy-whatsapp';

const APPROVAL_BADGE: Record<string, string> = {
  AUTO: 'bg-green-100 text-green-800',
  APPROVED: 'bg-green-100 text-green-800',
  PENDING: 'bg-amber-100 text-amber-800',
  REJECTED: 'bg-red-100 text-red-800',
  BLOCKED: 'bg-red-100 text-red-800',
};

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user, 'quotation.view')) redirect('/');
  const { id } = await params;

  const found = await getQuotation(user.orgId, id);
  if (!found) notFound();
  const { quotation } = found;
  const items = redactQuotationItems(user, found.items);

  const showCost = can(user, 'product.viewCost');
  const canApprove = can(user, 'quotation.approve');

  const [party, productRows] = await Promise.all([
    quotation.distributorId
      ? getDistributor(user.orgId, quotation.distributorId).then((d) => d?.businessName ?? null)
      : quotation.leadId
        ? getLead(user.orgId, quotation.leadId).then((l) => l?.businessName ?? null)
        : Promise.resolve(null),
    listProducts(user.orgId, { limit: 1000 }),
  ]);
  const partyName = party ?? '—';
  const pName = new Map(productRows.map((p) => [p.id, p.name]));

  const lines = found.items.map((it) => {
    const r = computeQuoteLine({
      qty: it.qty,
      requestedRate: it.requestedRate,
      discount: it.discount,
      schemeBenefit: it.schemeBenefit,
      gstPct: it.gstPct,
    });
    return {
      qty: it.qty,
      requestedRate: it.requestedRate,
      discount: it.discount,
      schemeBenefit: it.schemeBenefit,
      gstPct: it.gstPct,
      ...r,
    };
  });
  const totals = quoteTotals(lines);

  const pending = canApprove
    ? (await listPendingApprovals(user.orgId)).filter((a) => a.quotationId === id)
    : [];

  const waText = [
    `Quotation ${quotation.quoteNo}`,
    `Party: ${partyName}`,
    ...items.map(
      (it) =>
        `${pName.get(it.productId) ?? it.productId} x ${it.qty} @ ${formatINR(
          it.requestedRate,
        )} = ${formatINR(it.netAmount)}`,
    ),
    `Total: ${formatINR(totals.netTotal)}`,
    `Valid until ${new Date(quotation.validUntil).toLocaleDateString('en-IN')}`,
  ].join('\n');

  return (
    <main className="max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">{quotation.quoteNo}</h1>
        <p className="text-sm text-neutral-500">
          {partyName} · {quotation.status} · quoted{' '}
          {new Date(quotation.quoteDate).toLocaleDateString('en-IN')} · valid until{' '}
          {new Date(quotation.validUntil).toLocaleDateString('en-IN')}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {quotation.status === 'DRAFT' && (
          <form action={submitQuotationAction.bind(null, id)}>
            <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">
              Submit quotation
            </button>
          </form>
        )}
        <form action={setStatusAction.bind(null, id)} className="flex items-center gap-2">
          <select
            name="status"
            defaultValue={quotation.status}
            aria-label="Status"
            className="rounded border px-2 py-1.5 text-sm"
          >
            {QUOTATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="rounded border px-3 py-1.5 text-sm">Update status</button>
        </form>
        <Link href={`/quotations/${id}/print`} className="rounded border px-3 py-1.5 text-sm">
          Print / WhatsApp
        </Link>
        <CopyWhatsApp text={waText} />
      </div>

      <section className="rounded border p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-neutral-500">
              <th className="py-2">Product</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Requested</th>
              <th className="text-right">List</th>
              {showCost && <th className="text-right">Floor</th>}
              {showCost && <th className="text-right">Target</th>}
              <th className="text-right">Discount</th>
              <th className="text-right">Scheme</th>
              <th className="text-right">Net</th>
              <th>Approval</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b">
                <td className="py-2">{pName.get(it.productId) ?? it.productId}</td>
                <td className="text-right">{it.qty}</td>
                <td className="text-right">{formatINR(it.requestedRate)}</td>
                <td className="text-right">{formatINR(it.listRate)}</td>
                {showCost && (
                  <td className="text-right">
                    {it.floorRate != null ? formatINR(it.floorRate) : '—'}
                  </td>
                )}
                {showCost && (
                  <td className="text-right">
                    {it.targetRate != null ? formatINR(it.targetRate) : '—'}
                  </td>
                )}
                <td className="text-right">{formatINR(it.discount)}</td>
                <td className="text-right">{formatINR(it.schemeBenefit)}</td>
                <td className="text-right">{formatINR(it.netAmount)}</td>
                <td>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      APPROVAL_BADGE[it.approvalStatus] ?? 'bg-neutral-100 text-neutral-700'
                    }`}
                  >
                    {it.approvalStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-medium">
              <td className="py-2" colSpan={showCost ? 8 : 6}>
                Totals
              </td>
              <td className="text-right">{formatINR(totals.netTotal)}</td>
              <td />
            </tr>
            <tr className="text-neutral-500">
              <td className="py-1" colSpan={showCost ? 8 : 6}>
                Taxable {formatINR(totals.taxableTotal)} · GST {formatINR(totals.gstTotal)} ·
                Discount {formatINR(totals.discountTotal)} · Scheme {formatINR(totals.schemeTotal)}
              </td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </section>

      {quotation.notes && (
        <section className="rounded border p-4 text-sm">
          <h2 className="mb-1 text-sm font-medium">Notes</h2>
          <p className="text-neutral-600">{quotation.notes}</p>
        </section>
      )}

      {canApprove && (
        <section className="rounded border p-4">
          <h2 className="mb-3 text-sm font-medium">Pending price approvals</h2>
          {pending.length === 0 ? (
            <p className="text-sm text-neutral-400">None pending for this quote.</p>
          ) : (
            <ul className="space-y-3">
              {pending.map((a) => (
                <li key={a.id} className="flex flex-wrap items-end gap-2 border-b pb-3 text-sm">
                  <div className="grow">
                    {a.productName || 'item'} · qty {a.qty} · list {formatINR(a.originalRate)} →
                    requested {formatINR(a.requestedRate)}
                  </div>
                  <form action={decideApprovalAction.bind(null, a.id, 'APPROVED')} className="flex items-end gap-2">
                    <input
                      name="note"
                      placeholder="note (optional)"
                      className="rounded border px-2 py-1 text-sm"
                    />
                    <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white">
                      Approve
                    </button>
                  </form>
                  <form action={decideApprovalAction.bind(null, a.id, 'REJECTED')}>
                    <button className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700">
                      Reject
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
