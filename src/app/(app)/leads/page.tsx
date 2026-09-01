import Link from 'next/link';
import { requireUser } from '@/server/auth/session';
import { listLeads, redactLeads } from '@/server/services/lead';
import { GradeBadge } from '@/components/grade-badge';
import { StageBadge } from '@/components/stage-badge';
import { formatINR } from '@/domain/money';
import { createLeadAction } from './actions';

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const leads = redactLeads(user, await listLeads(user.orgId, { q }));
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Leads</h1>
      <form className="flex gap-2" action="/leads">
        <input name="q" defaultValue={q} placeholder="Search name / phone" className="rounded border px-3 py-1.5 text-sm" />
        <button className="rounded border px-3 py-1.5 text-sm">Search</button>
      </form>
      <details className="rounded border p-4">
        <summary className="cursor-pointer text-sm font-medium">New lead</summary>
        <form action={createLeadAction} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm">Business<input name="businessName" required className="mt-1 block rounded border px-2 py-1" /></label>
          <label className="text-sm">Contact<input name="contactPerson" required className="mt-1 block rounded border px-2 py-1" /></label>
          <label className="text-sm">Phone<input name="phone" required pattern="[6-9][0-9]{9}" className="mt-1 block rounded border px-2 py-1" /></label>
          <label className="text-sm">Monthly potential (₹)<input name="expectedFfMonthlyPotential" type="number" min="0" className="mt-1 block rounded border px-2 py-1" /></label>
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Create</button>
        </form>
      </details>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-neutral-500">
          <th className="py-2">Business</th><th>Stage</th><th>Grade</th><th>Potential</th><th>Next follow-up</th>
        </tr></thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className="border-b">
              <td className="py-2"><Link href={`/leads/${l.id}`} className="text-blue-700 hover:underline">{l.businessName}</Link><div className="text-neutral-400">{l.contactPerson} · {l.phone}</div></td>
              <td><StageBadge stage={l.stage} /></td>
              <td><GradeBadge grade={l.grade} /></td>
              <td>{formatINR(l.expectedFfMonthlyPotential)}</td>
              <td className="text-neutral-500">{l.nextFollowUpAt ? new Date(l.nextFollowUpAt).toLocaleDateString('en-IN') : <span className="text-red-600">none</span>}</td>
            </tr>
          ))}
          {leads.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-neutral-400">No leads yet.</td></tr>}
        </tbody>
      </table>
    </main>
  );
}
