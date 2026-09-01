import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { computeFor, redactProduct } from '@/server/services/product';
import { can } from '@/server/auth/permissions';
import { formatINR } from '@/domain/money';
import { savePrices, resetPrices, saveProduct } from '../actions';
import { PricingPanel } from '../pricing-panel';

const field = 'mt-1 block w-full rounded border px-2 py-1 text-sm';

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const data = await computeFor(user.orgId, id);
  if (!data) notFound();

  const product = redactProduct(user, data.product);
  const price = product.price!;
  const { pricing, recommend } = data;
  const w = pricing.waterfall;
  const canEdit = can(user, 'product.edit');
  const showCost = user.role === 'OWNER';

  return (
    <main className="max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">{product.name}</h1>
        <p className="text-sm text-neutral-500">
          {product.skuCode} · {product.categoryName ?? '—'} · {product.packLabel}
          {product.volatilePrice ? ' · volatile' : ''}
          {product.active ? '' : ' · inactive'}
        </p>
      </div>

      {/* Fields */}
      <section className="rounded border p-4">
        <h2 className="mb-3 text-sm font-medium">Fields</h2>
        {canEdit ? (
          <form action={saveProduct.bind(null, id)} className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Name
              <input name="name" defaultValue={product.name} required minLength={2} className={field} />
            </label>
            <label className="text-sm">
              GST %
              <input
                name="gstPct"
                type="number"
                min="0"
                max="28"
                step="1"
                defaultValue={product.gstPct}
                className={field}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="volatilePrice" defaultChecked={product.volatilePrice} /> Volatile price
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={product.active} /> Active
            </label>
            <div className="col-span-2">
              <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Save fields</button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-neutral-500">Name</dt>
              <dd>{product.name}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Category</dt>
              <dd>{product.categoryName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Pack</dt>
              <dd>{product.packLabel}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">GST %</dt>
              <dd>{product.gstPct}%</dd>
            </div>
            <div>
              <dt className="text-neutral-500">MRP</dt>
              <dd>{product.mrp != null ? formatINR(product.mrp) : '—'}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Volatile price</dt>
              <dd>{product.volatilePrice ? 'yes' : 'no'}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Active</dt>
              <dd>{product.active ? 'yes' : 'no'}</dd>
            </div>
          </dl>
        )}
      </section>

      {/* Recommended vs current + overrides.
          PricingPanel is a client component and would serialize the whole
          RecommendResult (floorPrice / targetPrice / marginAtEach / cost-revealing
          rationale) into the RSC payload — readable via view-source even when the
          rows are painted hidden. So it is mounted ONLY for the editing role
          (OWNER); SALES gets a plain server-rendered table of non-cost prices and
          no `recommend` object ever crosses to a client component. */}
      <section className="rounded border p-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-medium">{canEdit ? 'Recommended vs current' : 'Current prices'}</h2>
          {price.manualOverride && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">manual override</span>
          )}
        </div>
        {canEdit ? (
          <PricingPanel
            recommend={recommend}
            current={{
              distributorPrice: price.distributorPrice,
              retailerPrice: price.retailerPrice,
              floorPrice: price.floorPrice,
              targetPrice: price.targetPrice,
              ssBillingPrice: price.ssBillingPrice,
            }}
            canEdit
            savePrices={savePrices.bind(null, id)}
            resetPrices={resetPrices.bind(null, id)}
          />
        ) : (
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b">
                <td className="py-1 text-neutral-500">MRP</td>
                <td className="text-right">{product.mrp != null ? formatINR(product.mrp) : '—'}</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 text-neutral-500">Retailer price</td>
                <td className="text-right">{price.retailerPrice != null ? formatINR(price.retailerPrice) : '—'}</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 text-neutral-500">Distributor price</td>
                <td className="text-right">{formatINR(price.distributorPrice)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* Price waterfall + margins — OWNER only (every row below distributor is a
          cost/margin figure; the non-cost rows are already shown above for SALES). */}
      {showCost && (
        <section className="rounded border p-4">
          <h2 className="mb-3 text-sm font-medium">Price waterfall</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b">
                <td className="py-1 text-neutral-500">MRP</td>
                <td className="text-right">{w.mrp != null ? formatINR(w.mrp) : '—'}</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 text-neutral-500">Retailer price</td>
                <td className="text-right">{w.retailerPrice != null ? formatINR(w.retailerPrice) : '—'}</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 text-neutral-500">Distributor price</td>
                <td className="text-right">{formatINR(w.distributorPrice)}</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 text-neutral-500">SS billing price</td>
                <td className="text-right">{formatINR(w.ssPrice)}</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 text-neutral-500">SS cost</td>
                <td className="text-right">{formatINR(w.ssCost)}</td>
              </tr>
            </tbody>
          </table>

          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-neutral-500">Gross margin</dt>
              <dd>
                {formatINR(pricing.grossMarginPaise)} ({pricing.grossMarginPct.toFixed(1)}%)
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Net contribution</dt>
              <dd>
                {formatINR(pricing.netContributionPaise)} ({pricing.netContributionPct.toFixed(1)}%)
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Max permissible discount</dt>
              <dd>{formatINR(pricing.maxPermissibleDiscountPaise)}</dd>
            </div>
            {pricing.belowFloor && <div className="font-medium text-red-600">Below floor price</div>}
          </dl>
        </section>
      )}
    </main>
  );
}
