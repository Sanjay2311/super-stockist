import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { listDistributors, redactDistributors } from '@/server/services/distributor';
import { listTerritories } from '@/server/services/territory';
import { formatINR } from '@/domain/money';
import { DISTRIBUTOR_STATUSES } from '@/lib/schemas';

export default async function DistributorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, 'distributor.view')) redirect('/');
  const { q, status } = await searchParams;
  const [rowsRaw, territories] = await Promise.all([
    listDistributors(user.orgId, { q, status }),
    listTerritories(user.orgId),
  ]);
  const rows = redactDistributors(user, rowsRaw);
  const territoryName = new Map(territories.map((t) => [t.id, t.name]));

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Distributors</h1>

      <form className="flex flex-wrap gap-2" action="/distributors">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search business / contact / phone"
          className="rounded border px-3 py-1.5 text-sm"
        />
        <select
          name="status"
          defaultValue={status}
          aria-label="Status"
          className="rounded border px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {DISTRIBUTOR_STATUSES.map((s) => (
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
            <th className="py-2">Business</th>
            <th>Contact</th>
            <th>Territory</th>
            <th>Status</th>
            <th>Grade</th>
            <th>Credit limit</th>
            <th>Assigned</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2">
                <Link href={`/distributors/${r.id}`} className="text-blue-700 hover:underline">
                  {r.businessName}
                </Link>
              </td>
              <td>
                {r.contactPerson}
                <div className="text-neutral-400">{r.phone}</div>
              </td>
              <td>{r.territoryId ? territoryName.get(r.territoryId) ?? '—' : '—'}</td>
              <td>{r.status}</td>
              <td>{r.grade ?? '—'}</td>
              <td>{formatINR(r.creditLimit)}</td>
              <td className="text-neutral-500">{r.assignedEmployeeId ?? '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-6 text-center text-neutral-400">
                No distributors yet. Convert an approved lead from its lead page.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
