import { requireUser } from '@/server/auth/session';
import { boardLeads } from '@/server/services/lead';
import { STAGES } from '@/domain/pipeline';
import { Board } from './board';

// One column per stage except the two that need a reason (LOST/ON_HOLD) — those
// moves are handled on the lead detail page, so the board never drops a card there.
const OPEN = STAGES.filter((s) => s !== 'LOST' && s !== 'ON_HOLD');

export default async function PipelinePage() {
  const user = await requireUser();
  const leads = await boardLeads(user.orgId);

  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Distributor Pipeline</h1>
      <Board stages={OPEN} leads={leads} />
    </main>
  );
}
