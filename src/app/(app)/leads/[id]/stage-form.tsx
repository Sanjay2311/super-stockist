'use client';
import { useState } from 'react';
import { STAGES } from '@/domain/pipeline';
import { LOST_REASONS } from '@/lib/schemas';
import { StageBadge } from '@/components/stage-badge';

export function StageForm({
  currentStage,
  currentProbability,
  lostReason,
  lostNotes,
  action,
}: {
  currentStage: string;
  currentProbability: number;
  lostReason: string | null;
  lostNotes: string | null;
  action: (formData: FormData) => void;
}) {
  const [stage, setStage] = useState(currentStage);
  return (
    <form action={action} className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <StageBadge stage={currentStage} /> · {currentProbability}% probability
      </div>
      <label className="block text-sm">
        Stage
        <select
          name="stage"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="mt-1 block rounded border px-2 py-1"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </label>
      {stage === 'LOST' && (
        <>
          <label className="block text-sm">
            Lost reason
            <select name="lostReason" defaultValue={lostReason ?? ''} required className="mt-1 block rounded border px-2 py-1">
              <option value="" disabled>Select a reason</option>
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Lost notes
            <textarea name="lostNotes" defaultValue={lostNotes ?? ''} className="mt-1 block w-full rounded border px-2 py-1" rows={2} />
          </label>
        </>
      )}
      <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Update stage</button>
    </form>
  );
}
