'use client';
import { formatINR } from '@/domain/money';
import type { RecommendResult } from '@/domain/pricing-recommend';

type Current = {
  distributorPrice: number;
  retailerPrice: number | null;
  floorPrice?: number;
  targetPrice?: number;
  ssBillingPrice?: number;
};

const rupeeStr = (paise: number | null | undefined) =>
  paise == null ? '' : (paise / 100).toFixed(2);

export function PricingPanel({
  recommend,
  current,
  canEdit,
  savePrices,
  resetPrices,
}: {
  recommend: RecommendResult;
  current: Current;
  canEdit: boolean;
  savePrices: (formData: FormData) => void;
  resetPrices: () => void;
}) {
  type Row = { key: keyof Current; label: string; recommended: number | null; value: number | null | undefined };
  const allRows: Row[] = [
    { key: 'ssBillingPrice', label: 'SS billing price', recommended: null, value: current.ssBillingPrice },
    { key: 'floorPrice', label: 'Floor price', recommended: recommend.floorPrice, value: current.floorPrice },
    { key: 'distributorPrice', label: 'Distributor price', recommended: recommend.distributorPrice, value: current.distributorPrice },
    { key: 'targetPrice', label: 'Target price', recommended: recommend.targetPrice, value: current.targetPrice },
    { key: 'retailerPrice', label: 'Retailer price', recommended: recommend.retailerPrice, value: current.retailerPrice },
  ];
  const rows = allRows.filter(
    (r) => !((r.key === 'ssBillingPrice' || r.key === 'floorPrice' || r.key === 'targetPrice') && r.value === undefined),
  );

  return (
    <div className="space-y-4">
      <form action={savePrices}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-neutral-500">
              <th className="py-2">Field</th>
              <th>Recommended</th>
              <th>Current</th>
              {canEdit && <th>Override (₹)</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b">
                <td className="py-2">{r.label}</td>
                <td>{r.recommended != null ? formatINR(r.recommended) : '—'}</td>
                <td>{r.value != null ? formatINR(r.value) : '—'}</td>
                {canEdit && (
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      name={r.key}
                      aria-label={`${r.label} override`}
                      placeholder={rupeeStr(r.value)}
                      className="w-28 rounded border px-2 py-1"
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {canEdit && (
          <button className="mt-3 rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Save prices</button>
        )}
      </form>

      {canEdit && (
        <form action={resetPrices}>
          <button className="rounded border px-3 py-1.5 text-sm">Reset to recommended</button>
        </form>
      )}

      {canEdit && (
        <div>
          <h3 className="mb-1 text-xs font-medium uppercase text-neutral-500">Why these numbers</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-600">
            {recommend.rationale.map((r) => (
              <li key={r.field}>
                <span className="font-medium text-neutral-800">{r.field}</span>
                {r.valuePaise != null ? ` ${formatINR(r.valuePaise)}` : ''} — {r.why}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
