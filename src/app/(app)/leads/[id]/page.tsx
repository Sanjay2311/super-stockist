import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { getLead, redactLead } from '@/server/services/lead';
import { listActivities } from '@/server/services/activity';
import { listTerritories } from '@/server/services/territory';
import { GradeBadge } from '@/components/grade-badge';
import { formatINR } from '@/domain/money';
import { ACTIVITY_TYPES } from '@/lib/schemas';
import { saveLeadFields, saveScore, changeStage, logActivity, convertToDistributor } from './actions';
import { StageForm } from './stage-form';
import { ConvertForm } from './convert-form';

const SCORE_FIELDS: { key: string; label: string }[] = [
  { key: 'retailerNetwork', label: 'Retailer network' },
  { key: 'categoryExperience', label: 'Category experience' },
  { key: 'geoCoverage', label: 'Geographic coverage' },
  { key: 'salesmen', label: 'Salesmen' },
  { key: 'deliveryInfra', label: 'Delivery infrastructure' },
  { key: 'workingCapital', label: 'Working capital' },
  { key: 'brandPortfolio', label: 'Brand portfolio' },
  { key: 'reputation', label: 'Reputation' },
  { key: 'willingness', label: 'Willingness' },
];

const field = 'mt-1 block w-full rounded border px-2 py-1 text-sm';

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const found = await getLead(user.orgId, id);
  if (!found) notFound();
  const lead = redactLead(user, found);

  const scoreInputs = (lead.scoreInputs ?? {}) as Record<string, number>;
  const timeline = await listActivities(user.orgId, id);
  const territories = lead.convertedDistributorId ? [] : await listTerritories(user.orgId);
  const showConvert = ['APPROVED', 'APPOINTED'].includes(lead.stage) && !lead.convertedDistributorId;

  return (
    <main className="max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">{lead.businessName}</h1>
        <p className="text-sm text-neutral-500">{lead.contactPerson} · {lead.phone}</p>
      </div>

      {/* Card 1: editable fields */}
      <section className="rounded border p-4">
        <h2 className="mb-3 text-sm font-medium">Fields</h2>
        <form action={saveLeadFields.bind(null, id)} className="grid grid-cols-2 gap-3">
          <label className="text-sm">Business name
            <input name="businessName" defaultValue={lead.businessName} required className={field} />
          </label>
          <label className="text-sm">Contact person
            <input name="contactPerson" defaultValue={lead.contactPerson} required className={field} />
          </label>
          <label className="text-sm">Phone
            <input name="phone" defaultValue={lead.phone} required pattern="[6-9][0-9]{9}" className={field} />
          </label>
          <label className="text-sm">Email
            <input name="email" type="email" defaultValue={lead.email ?? ''} className={field} />
          </label>
          <label className="col-span-2 text-sm">Address
            <input name="address" defaultValue={lead.address ?? ''} className={field} />
          </label>
          <label className="text-sm">Monthly potential (₹)
            <input
              name="expectedFfMonthlyPotential"
              type="number"
              min="0"
              step="1"
              defaultValue={lead.expectedFfMonthlyPotential / 100}
              className={field}
            />
          </label>
          <div className="col-span-2">
            <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Save fields</button>
          </div>
        </form>
      </section>

      {/* Card 2: qualification score */}
      <section className="rounded border p-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-medium">Qualification score</h2>
          <span className="text-sm text-neutral-500">{lead.score}</span>
          <GradeBadge grade={lead.grade} />
        </div>
        <form action={saveScore.bind(null, id)} className="space-y-2">
          {SCORE_FIELDS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 text-sm">
              <span className="w-44 shrink-0">{label}</span>
              <input
                name={key}
                type="range"
                min="0"
                max="1"
                step="0.1"
                defaultValue={Number(scoreInputs[key] ?? 0)}
                className="flex-1"
              />
            </label>
          ))}
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Save score</button>
        </form>
      </section>

      {/* Card 3: stage */}
      <section className="rounded border p-4">
        <h2 className="mb-3 text-sm font-medium">Stage</h2>
        <StageForm
          currentStage={lead.stage}
          currentProbability={lead.probability}
          lostReason={lead.lostReason}
          lostNotes={lead.lostNotes}
          action={changeStage.bind(null, id)}
        />
        <p className="mt-2 text-xs text-neutral-400">Weighted value: {formatINR(Math.round((lead.expectedFfMonthlyPotential * lead.probability) / 100))}</p>
      </section>

      {/* Card 3b: convert to distributor */}
      {showConvert && (
        <section className="rounded border p-4">
          <h2 className="mb-3 text-sm font-medium">Convert to Distributor</h2>
          <ConvertForm action={convertToDistributor.bind(null, id)} territories={territories} />
        </section>
      )}
      {lead.convertedDistributorId && (
        <section className="rounded border p-4 text-sm">
          Converted — <a className="underline" href={`/distributors/${lead.convertedDistributorId}`}>view distributor</a>
        </section>
      )}

      {/* Card 4: activity timeline */}
      <section id="timeline" className="rounded border p-4">
        <h2 className="mb-3 text-sm font-medium">Timeline</h2>
        <form action={logActivity.bind(null, id)} className="grid grid-cols-2 gap-3">
          <label className="text-sm">Type
            <select name="type" defaultValue="CALL" className={field}>
              {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-sm">Next follow-up
            <input name="nextFollowUpAt" type="date" className={field} />
          </label>
          <label className="col-span-2 text-sm">Notes
            <textarea name="notes" rows={2} className={field} />
          </label>
          <label className="text-sm">Outcome
            <input name="outcome" className={field} />
          </label>
          <label className="text-sm">Next action
            <input name="nextAction" className={field} />
          </label>
          <div className="col-span-2">
            <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Log activity</button>
          </div>
        </form>

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
