import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { listSchemes, getScheme, type SchemeRow } from '@/server/services/scheme';
import { listProducts, listCategories } from '@/server/services/product';
import { formatINR } from '@/domain/money';
import { createSchemeAction, updateSchemeAction } from './actions';
import { SchemeForm, type SchemeFormDefaults } from './scheme-form';

const ymd = (d: unknown): string => String(d).slice(0, 10);

type Benefit = { kind: string; value: number };

function benefitSummary(b: Benefit): string {
  if (b.kind === 'PCT') return `${b.value}%`;
  if (b.kind === 'PER_UNIT') return `${formatINR(b.value)}/unit`;
  return formatINR(b.value);
}

function toDefaults(r: SchemeRow): SchemeFormDefaults {
  const b = r.benefit as Benefit;
  const grades = (r.eligibility as { distributorGrades?: string[] }).distributorGrades ?? [];
  return {
    name: r.name,
    type: r.type,
    scopeType: r.scopeType,
    scopeId: r.scopeId ?? '',
    startDate: ymd(r.startDate),
    endDate: ymd(r.endDate),
    minQty: r.minQty ?? '',
    minValue: r.minValue == null ? '' : r.minValue / 100,
    benefitKind: b.kind,
    benefitValue: b.kind === 'PCT' ? b.value : b.value / 100,
    eligibleGrades: grades,
    requiresApproval: r.requiresApproval,
    active: r.active,
  };
}

export default async function SchemesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, 'scheme.view')) redirect('/');

  const { edit } = await searchParams;
  const canEdit = can(user, 'scheme.edit');

  const [rows, products, categories] = await Promise.all([
    listSchemes(user.orgId),
    listProducts(user.orgId, { limit: 1000 }),
    listCategories(user.orgId),
  ]);

  const productName = new Map(products.map((p) => [p.id, p.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const scopeLabel = (r: SchemeRow): string => {
    if (r.scopeType === 'ALL') return 'All products';
    if (r.scopeType === 'PRODUCT') return productName.get(r.scopeId ?? '') ?? 'Product';
    return categoryName.get(r.scopeId ?? '') ?? 'Category';
  };

  const editRow = canEdit && edit ? await getScheme(user.orgId, edit) : null;

  const productOpts = products.map((p) => ({ id: p.id, name: p.name }));
  const categoryOpts = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <main className="space-y-8 p-6">
      <h1 className="text-xl font-semibold">Schemes</h1>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Scope</th>
              <th className="px-3 py-2">Window</th>
              <th className="px-3 py-2">Benefit</th>
              <th className="px-3 py-2">Active</th>
              {canEdit && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 7 : 6} className="px-3 py-4 text-neutral-400">
                  No schemes yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.type}</td>
                <td className="px-3 py-2">{scopeLabel(r)}</td>
                <td className="px-3 py-2">
                  {ymd(r.startDate)} → {ymd(r.endDate)}
                </td>
                <td className="px-3 py-2">{benefitSummary(r.benefit as Benefit)}</td>
                <td className="px-3 py-2">{r.active ? 'Yes' : 'No'}</td>
                {canEdit && (
                  <td className="px-3 py-2">
                    <Link href={`/schemes?edit=${r.id}`} className="text-blue-600 hover:underline">
                      Edit
                    </Link>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && editRow && (
        <SchemeForm
          key={editRow.id}
          action={updateSchemeAction.bind(null, editRow.id)}
          products={productOpts}
          categories={categoryOpts}
          defaults={toDefaults(editRow)}
        />
      )}
      {canEdit && !editRow && (
        <SchemeForm
          key="new"
          action={createSchemeAction}
          products={productOpts}
          categories={categoryOpts}
        />
      )}
    </main>
  );
}
