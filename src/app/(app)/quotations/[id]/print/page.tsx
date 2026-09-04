import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { getQuotation, redactQuotationItems } from '@/server/services/quotation';
import { getDistributor } from '@/server/services/distributor';
import { getLead } from '@/server/services/lead';
import { listProducts } from '@/server/services/product';
import { computeQuoteLine, quoteTotals } from '@/domain/quote';
import { formatINR } from '@/domain/money';

// ponytail: this route still renders inside the (app) layout, so it inherits the
// AppNav sidebar + header chrome. A truly chrome-less print view (its own route
// group outside (app), or a dedicated print stylesheet) is deferred to M3.
export default async function QuotationPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user, 'quotation.view')) redirect('/');
  const { id } = await params;

  const found = await getQuotation(user.orgId, id);
  if (!found) notFound();
  const { quotation } = found;
  const items = redactQuotationItems(user, found.items);

  const [party, productRows] = await Promise.all([
    quotation.distributorId
      ? getDistributor(user.orgId, quotation.distributorId).then((d) => d?.businessName ?? null)
      : quotation.leadId
        ? getLead(user.orgId, quotation.leadId).then((l) => l?.businessName ?? null)
        : Promise.resolve(null),
    listProducts(user.orgId, { limit: 1000 }),
  ]);
  const pName = new Map(productRows.map((p) => [p.id, p.name]));
  const pMrp = new Map(productRows.map((p) => [p.id, p.mrp]));

  const totals = quoteTotals(
    found.items.map((it) => {
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
    }),
  );

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8 text-sm text-black">
      <h1 className="text-lg font-semibold">Quotation {quotation.quoteNo}</h1>
      <p>{party ?? '—'}</p>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1">Product</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Rate</th>
            <th className="text-right">MRP</th>
            <th className="text-right">Discount</th>
            <th className="text-right">Scheme</th>
            <th className="text-right">Net</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const mrp = pMrp.get(it.productId);
            return (
              <tr key={it.id} className="border-b border-neutral-300">
                <td className="py-1">{pName.get(it.productId) ?? it.productId}</td>
                <td className="text-right">{it.qty}</td>
                <td className="text-right">{formatINR(it.requestedRate)}</td>
                <td className="text-right">{mrp != null ? formatINR(mrp) : '—'}</td>
                <td className="text-right">{formatINR(it.discount)}</td>
                <td className="text-right">{formatINR(it.schemeBenefit)}</td>
                <td className="text-right">{formatINR(it.netAmount)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-medium">
            <td className="py-1" colSpan={6}>
              Net total
            </td>
            <td className="text-right">{formatINR(totals.netTotal)}</td>
          </tr>
          <tr className="text-neutral-600">
            <td className="py-1" colSpan={6}>
              Taxable / GST
            </td>
            <td className="text-right">
              {formatINR(totals.taxableTotal)} / {formatINR(totals.gstTotal)}
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="text-neutral-600">
        Generated {new Date().toLocaleDateString('en-IN')} · valid until{' '}
        {new Date(quotation.validUntil).toLocaleDateString('en-IN')}
      </p>
    </main>
  );
}
