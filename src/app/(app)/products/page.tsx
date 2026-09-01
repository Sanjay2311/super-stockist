import Link from 'next/link';
import { requireUser } from '@/server/auth/session';
import { listProducts, listCategories, redactProducts } from '@/server/services/product';
import { can } from '@/server/auth/permissions';
import { formatINR } from '@/domain/money';
import { regenerateAll } from './actions';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string }>;
}) {
  const user = await requireUser();
  const { q, cat } = await searchParams;
  const [cats, rowsRaw] = await Promise.all([
    listCategories(user.orgId),
    listProducts(user.orgId, { q, categoryId: cat, limit: 1000 }),
  ]);
  const rows = redactProducts(user, rowsRaw);
  const showCost = can(user, 'product.viewCost');

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Products &amp; Pricing</h1>

      <form className="flex flex-wrap gap-2" action="/products">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name / SKU"
          className="rounded border px-3 py-1.5 text-sm"
        />
        <select name="cat" defaultValue={cat} className="rounded border px-2 py-1.5 text-sm">
          <option value="">All categories</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="rounded border px-3 py-1.5 text-sm">Filter</button>
      </form>

      {showCost && (
        <details className="rounded border p-4">
          <summary className="cursor-pointer text-sm font-medium">Regenerate recommended prices</summary>
          <form action={regenerateAll} className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="onlyUnoverridden" defaultChecked /> Only where not manually overridden
            </label>
            <button className="rounded bg-neutral-900 px-3 py-1.5 text-white">Regenerate all</button>
          </form>
        </details>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-neutral-500">
            <th className="py-2">Product</th>
            <th>Category</th>
            <th>MRP</th>
            {showCost && <th>SS cost</th>}
            <th>Distributor</th>
            {showCost && <th>Floor</th>}
            {showCost && <th>Target</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2">
                <Link href={`/products/${r.id}`} className="text-blue-700 hover:underline">
                  {r.name}
                </Link>
                <div className="text-neutral-400">
                  {r.skuCode}
                  {r.volatilePrice ? ' · volatile' : ''}
                </div>
              </td>
              <td>{r.categoryName ?? '—'}</td>
              <td>{r.mrp != null ? formatINR(r.mrp) : '—'}</td>
              {showCost && <td>{r.price ? formatINR(r.price.ssBillingPrice) : '—'}</td>}
              <td>{r.price ? formatINR(r.price.distributorPrice) : '—'}</td>
              {showCost && <td>{r.price ? formatINR(r.price.floorPrice) : '—'}</td>}
              {showCost && <td>{r.price ? formatINR(r.price.targetPrice) : '—'}</td>}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-6 text-center text-neutral-400">
                No products. Run `npm run db:seed:catalogue`.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
