import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { getDistributor, redactDistributor } from '@/server/services/distributor';
import { listTerritories } from '@/server/services/territory';
import { listDistributorActivities } from '@/server/services/activity';
import { DISTRIBUTOR_STATUSES } from '@/lib/schemas';
import { saveDistributor } from './actions';

const field = 'mt-1 block w-full rounded border px-2 py-1 text-sm';

// ponytail: if saveDistributor throws EXCLUSIVITY_CONFLICT the Server Action
// rejection surfaces as the default dev error overlay — acceptable for M2b. A
// friendly inline error on the distributor edit form is deferred to M3 (Task 5's
// convert flow has the only friendly exclusivity banner in this milestone).
export default async function DistributorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user, 'distributor.view')) redirect('/');
  const { id } = await params;
  const found = await getDistributor(user.orgId, id);
  if (!found) notFound();
  const d = redactDistributor(user, found);

  const [territories, timeline] = await Promise.all([
    listTerritories(user.orgId),
    listDistributorActivities(user.orgId, id),
  ]);
  const territoryName = new Map(territories.map((t) => [t.id, t.name]));

  return (
    <main className="max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">{d.businessName}</h1>
        <p className="text-sm text-neutral-500">{d.contactPerson} · {d.phone}</p>
      </div>

      {/* Card 1: master fields */}
      <section className="rounded border p-4">
        <h2 className="mb-3 text-sm font-medium">Fields</h2>
        <form action={saveDistributor.bind(null, id)} className="grid grid-cols-2 gap-3">
          <label className="text-sm">Business name
            <input name="businessName" defaultValue={d.businessName} required className={field} />
          </label>
          <label className="text-sm">Contact person
            <input name="contactPerson" defaultValue={d.contactPerson} required className={field} />
          </label>
          <label className="text-sm">Phone
            <input name="phone" defaultValue={d.phone} required pattern="[6-9][0-9]{9}" className={field} />
          </label>
          <label className="text-sm">Email
            <input name="email" type="email" defaultValue={d.email ?? ''} className={field} />
          </label>
          <label className="col-span-2 text-sm">Address
            <input name="address" defaultValue={d.address ?? ''} className={field} />
          </label>
          <label className="text-sm">Territory
            <select name="territoryId" defaultValue={d.territoryId ?? ''} className={field}>
              <option value="">— none —</option>
              {territories.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="exclusive" defaultChecked={d.exclusive} /> Exclusive territory
          </label>
          <label className="text-sm">Assigned employee
            <input
              defaultValue={d.assignedEmployeeId ?? ''}
              readOnly
              className={`${field} bg-neutral-50 text-neutral-500`}
            />
          </label>
          <label className="text-sm">Status
            <select name="status" defaultValue={d.status} className={field}>
              {DISTRIBUTOR_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">Credit limit (₹)
            <input
              name="creditLimit"
              type="number"
              min="0"
              step="1"
              defaultValue={d.creditLimit / 100}
              className={field}
            />
          </label>
          <label className="text-sm">Credit days
            <input name="creditDays" type="number" min="0" max="365" step="1" defaultValue={d.creditDays} className={field} />
          </label>
          <label className="text-sm">Payment terms
            <input name="paymentTerms" defaultValue={d.paymentTerms ?? ''} className={field} />
          </label>
          <label className="text-sm">Expected monthly purchase (₹)
            <input
              name="expectedMonthlyPurchase"
              type="number"
              min="0"
              step="1"
              defaultValue={d.expectedMonthlyPurchase / 100}
              className={field}
            />
          </label>
          <label className="text-sm">Agreement status
            <input name="agreementStatus" defaultValue={d.agreementStatus ?? ''} className={field} />
          </label>
          <label className="col-span-2 text-sm">Override reason
            <input name="overrideReason" className={field} />
            <span className="mt-1 block text-xs text-neutral-400">
              Only needed if changing to an exclusive territory already held by another distributor.
            </span>
          </label>
          <div className="col-span-2">
            <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Save fields</button>
          </div>
        </form>
      </section>

      {/* Card 2: exclusivity */}
      <section className="rounded border p-4">
        <h2 className="mb-3 text-sm font-medium">Exclusivity</h2>
        {d.exclusive ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
            Exclusive · {d.territoryId ? territoryName.get(d.territoryId) ?? 'unknown territory' : 'no territory'}
          </span>
        ) : (
          <span className="text-sm text-neutral-400">Not exclusive.</span>
        )}
        {d.exclusivityNote && (
          <p className="mt-2 text-sm text-neutral-600">Override on record: {d.exclusivityNote}</p>
        )}
      </section>

      {/* Card 3: activity timeline */}
      <section id="timeline" className="rounded border p-4">
        <h2 className="mb-3 text-sm font-medium">Timeline</h2>
        <ol className="mt-4 space-y-3">
          {timeline.map((a) => (
            <li key={a.id} className="border-l-2 border-neutral-200 pl-3 text-sm">
              <div className="text-neutral-500">
                {new Date(a.occurredAt).toLocaleString('en-IN')} · <span className="font-medium text-neutral-800">{a.type}</span>
              </div>
              {a.notes && <div>{a.notes}</div>}
              {a.outcome && <div className="text-neutral-600">{a.outcome}</div>}
              {a.nextAction && <div className="text-neutral-600">next: {a.nextAction}</div>}
              {a.nextFollowUpAt && (
                <div className="text-neutral-400">follow-up {new Date(a.nextFollowUpAt).toLocaleDateString('en-IN')}</div>
              )}
            </li>
          ))}
          {timeline.length === 0 && <li className="text-sm text-neutral-400">No activity yet.</li>}
        </ol>
      </section>
    </main>
  );
}
