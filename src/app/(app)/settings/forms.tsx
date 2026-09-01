'use client';

import { useActionState, useState } from 'react';
import type { ScoreWeights } from '@/domain/scoring';
import { saveScoreWeights, saveThresholds } from './actions';

const WEIGHT_KEYS: (keyof ScoreWeights)[] = [
  'retailerNetwork', 'categoryExperience', 'geoCoverage', 'salesmen', 'deliveryInfra',
  'workingCapital', 'brandPortfolio', 'reputation', 'willingness',
];

const LABELS: Record<keyof ScoreWeights, string> = {
  retailerNetwork: 'Retailer network',
  categoryExperience: 'Category experience',
  geoCoverage: 'Geo coverage',
  salesmen: 'Salesmen',
  deliveryInfra: 'Delivery infrastructure',
  workingCapital: 'Working capital',
  brandPortfolio: 'Brand portfolio',
  reputation: 'Reputation',
  willingness: 'Willingness',
};

type ActionState = null | { ok: true } | { error: string };

export function SettingsForms({ weights, threshold }: { weights: ScoreWeights; threshold: number }) {
  const [weightState, weightAction, weightPending] = useActionState<ActionState, FormData>(saveScoreWeights, null);
  const [thresholdState, thresholdAction, thresholdPending] = useActionState<ActionState, FormData>(saveThresholds, null);

  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(WEIGHT_KEYS.map((k) => [k, weights[k]])),
  );
  const sum = WEIGHT_KEYS.reduce((a, k) => a + (Number(values[k]) || 0), 0);

  return (
    <div className="space-y-10">
      <form action={weightAction} className="max-w-md space-y-3">
        <h2 className="text-sm font-semibold text-neutral-600">Distributor score weights</h2>
        {WEIGHT_KEYS.map((k) => (
          <label key={k} className="flex items-center justify-between gap-4 text-sm">
            {LABELS[k]}
            <input
              name={k}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={values[k]}
              onChange={(e) => setValues((v) => ({ ...v, [k]: Number(e.target.value) }))}
              className="w-20 rounded border px-2 py-1 text-right"
            />
          </label>
        ))}
        <p className={`text-sm ${sum === 100 ? 'text-neutral-600' : 'text-red-600'}`}>Sum: {sum} / 100</p>
        {weightState && 'error' in weightState && <p className="text-sm text-red-600">{weightState.error}</p>}
        {weightState && 'ok' in weightState && <p className="text-sm text-green-700">Saved</p>}
        <button
          disabled={weightPending}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {weightPending ? 'Saving…' : 'Save score weights'}
        </button>
      </form>

      <form action={thresholdAction} className="max-w-md space-y-3">
        <h2 className="text-sm font-semibold text-neutral-600">Follow-up</h2>
        <label className="flex items-center justify-between gap-4 text-sm">
          Hot-lead probability threshold (%)
          <input
            name="hotLeadProbabilityThreshold"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            defaultValue={threshold}
            className="w-20 rounded border px-2 py-1 text-right"
          />
        </label>
        {thresholdState && 'error' in thresholdState && <p className="text-sm text-red-600">{thresholdState.error}</p>}
        {thresholdState && 'ok' in thresholdState && <p className="text-sm text-green-700">Saved</p>}
        <button
          disabled={thresholdPending}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {thresholdPending ? 'Saving…' : 'Save thresholds'}
        </button>
      </form>
    </div>
  );
}
