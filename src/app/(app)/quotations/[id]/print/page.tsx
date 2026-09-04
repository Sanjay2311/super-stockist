import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { getQuotation, redactQuotationItems } from '@/server/services/quotation';
import { getDistributor } from '@/server/services/distributor';
import { getLead } from '@/server/services/lead';
import { listProducts } from '@/server/services/product';
import { computeQuoteLine, quoteTotals } from '@/domain/quote';
import { formatINR } from '@/domain/money';
import { PrintButton } from '../print-button';

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

  const quoteDate = new Date(quotation.quoteDate).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const validUntil = new Date(quotation.validUntil).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <main className="mx-auto max-w-2xl p-6 text-sm text-neutral-900 print:max-w-none print:p-0">
      {/* Backgrounds are dropped by default when a browser prints — this forces them
          through so the accent bar / table header / totals box survive Print and
          Save-as-PDF, not just the on-screen preview. @page controls the browser's
          own print margins so the document fits one page instead of stacking its
          on-screen padding on top of the browser default (~12.7mm each side). */}
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton />
      </div>

      {/* This quotation is FROM the Super Stockist, TO the distributor — F&F only
          appears as context ("Authorized Super Stockist for ..."), never as the
          issuer. F&F raises the actual GST bill later, separately (Billing
          Request, Phase 2), so no GSTIN belongs on this document at all.
          ponytail: phone/email/address below are placeholders — Sanjay asked to
          use dummy values "for now"; replace with real details before this is
          sent to an actual distributor. */}
      <div className="overflow-hidden rounded-lg border border-neutral-200 shadow-sm print:border-0 print:shadow-none">
        <div className="h-2 bg-emerald-700 print:h-1.5" />

        <div className="space-y-6 p-8 print:space-y-4 print:p-6">
          <header className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- static print asset, no next/image needed */}
              <img src="/farm-and-farmers-logo.jpg" alt="Farm & Farmers" className="h-14 w-14 shrink-0" />
              <div>
                <div className="text-lg font-bold tracking-tight">Sanjay Panday</div>
                <div className="text-xs font-medium text-emerald-700">
                  Authorized Super Stockist for Farm &amp; Farmers
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  +91 98765 43210 · sanjay@example.com
                  <br />
                  Bangalore East, Karnataka
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold uppercase tracking-wide text-emerald-700">Quotation</div>
              <div className="mt-1 text-xs text-neutral-500">
                <div>
                  <span className="text-neutral-400">No.</span>{' '}
                  <span className="font-medium text-neutral-800">{quotation.quoteNo}</span>
                </div>
                <div>
                  <span className="text-neutral-400">Date</span>{' '}
                  <span className="font-medium text-neutral-800">{quoteDate}</span>
                </div>
                <div>
                  <span className="text-neutral-400">Valid until</span>{' '}
                  <span className="font-medium text-neutral-800">{validUntil}</span>
                </div>
              </div>
            </div>
          </header>

          <div className="rounded-md bg-neutral-50 px-4 py-3 print:bg-neutral-50">
            <div className="text-[11px] uppercase tracking-wide text-neutral-400">Quotation for</div>
            <div className="text-base font-semibold text-neutral-900">{party ?? '—'}</div>
          </div>

          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-emerald-700 text-left text-white print:bg-emerald-700">
                <th className="rounded-l-md py-2 pl-3">Product</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Rate</th>
                <th className="py-2 text-right">MRP</th>
                <th className="py-2 text-right">Discount</th>
                <th className="py-2 text-right">Scheme</th>
                <th className="rounded-r-md py-2 pr-3 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const mrp = pMrp.get(it.productId);
                return (
                  <tr
                    key={it.id}
                    className={`${i % 2 === 1 ? 'bg-neutral-50 print:bg-neutral-50' : ''} border-b border-neutral-100`}
                  >
                    <td className="py-2 pl-3 font-medium">{pName.get(it.productId) ?? it.productId}</td>
                    <td className="py-2 text-right tabular-nums">{it.qty}</td>
                    <td className="py-2 text-right tabular-nums">{formatINR(it.requestedRate)}</td>
                    <td className="py-2 text-right tabular-nums text-neutral-500">
                      {mrp != null ? formatINR(mrp) : '—'}
                    </td>
                    <td className="py-2 text-right tabular-nums text-neutral-500">
                      {formatINR(it.discount)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-neutral-500">
                      {formatINR(it.schemeBenefit)}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                      {formatINR(it.netAmount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="w-56 space-y-1 text-xs">
              <div className="flex justify-between text-neutral-500">
                <span>Taxable value</span>
                <span className="tabular-nums">{formatINR(totals.taxableTotal)}</span>
              </div>
              <div className="flex justify-between text-neutral-500">
                <span>GST</span>
                <span className="tabular-nums">{formatINR(totals.gstTotal)}</span>
              </div>
              {totals.discountTotal > 0 && (
                <div className="flex justify-between text-neutral-500">
                  <span>Discount</span>
                  <span className="tabular-nums">− {formatINR(totals.discountTotal)}</span>
                </div>
              )}
              {totals.schemeTotal > 0 && (
                <div className="flex justify-between text-neutral-500">
                  <span>Scheme</span>
                  <span className="tabular-nums">− {formatINR(totals.schemeTotal)}</span>
                </div>
              )}
              <div className="flex items-center justify-between rounded-md bg-emerald-700 px-3 py-2 text-sm font-bold text-white print:bg-emerald-700">
                <span>Net total</span>
                <span className="tabular-nums">{formatINR(totals.netTotal)}</span>
              </div>
            </div>
          </div>

          {quotation.notes && (
            <div className="border-t border-neutral-100 pt-4 text-xs text-neutral-600">
              <div className="mb-1 font-medium text-neutral-500">Notes</div>
              {quotation.notes}
            </div>
          )}

          <div className="border-t border-neutral-100 pt-4 text-[11px] text-neutral-400">
            This is a price quotation, not a tax invoice — Farm &amp; Farmers issues the GST
            invoice separately. Prices are valid until {validUntil}.
          </div>
        </div>
      </div>
    </main>
  );
}
