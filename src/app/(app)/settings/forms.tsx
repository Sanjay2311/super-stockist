'use client';

import { useActionState, useState } from 'react';
import type { ScoreWeights } from '@/domain/scoring';
import type { PricingBands } from '@/domain/pricing-recommend';
import { saveScoreWeights, saveThresholds, savePricingBands, purgeDemoAction } from './actions';

const WEIGHT_KEYS: (keyof ScoreWeights)[] = [
  'retailerNetwork', 'categoryExperience', 'geoCoverage', 'salesmen', 'deliveryInfra',
  'workingCapital', 'brandPortfolio', 'reputation', 'willingness',
];

const BAND_KEYS: (keyof PricingBands)[] = [
  'ssMinMarginPct', 'ssNormalMarginPct', 'ssTargetMarginPct',
  'distributorMarginPct', 'retailerMarginPct', 'volatileFloorBufferPct',
];

const BAND_LABELS: Record<keyof PricingBands, string> = {
  ssMinMarginPct: 'SS min margin',
  ssNormalMarginPct: 'SS normal margin',
  ssTargetMarginPct: 'SS target margin',
  distributorMarginPct: 'Distributor margin',
  retailerMarginPct: 'Retailer margin',
  volatileFloorBufferPct: 'Volatile floor buffer',
};

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

export function SettingsForms({
  weights,
  threshold,
  bands,
}: {
  weights: ScoreWeights;
  threshold: number;
  bands: PricingBands;
}) {
  const [weightState, weightAction, weightPending] = useActionState<ActionState, FormData>(saveScoreWeights, null);
  const [thresholdState, thresholdAction, thresholdPending] = useActionState<ActionState, FormData>(saveThresholds, null);
  const [bandState, bandAction, bandPending] = useActionState<ActionState, FormData>(savePricingBands, null);

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

      <form action={bandAction} className="max-w-md space-y-3">
        <h2 className="text-sm font-semibold text-neutral-600">Pricing bands (%)</h2>
        <p className="text-sm text-neutral-500">
          Margins the recommended-price calculator marks up from SS billing cost. Editing these does
          not re-price existing products — use “Regenerate recommended prices” after saving.
        </p>
        {BAND_KEYS.map((k) => (
          <label key={k} className="flex items-center justify-between gap-4 text-sm">
            {BAND_LABELS[k]}
            <input
              name={k}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              defaultValue={bands[k]}
              className="w-20 rounded border px-2 py-1 text-right"
            />
          </label>
        ))}
        {bandState && 'error' in bandState && <p className="text-sm text-red-600">{bandState.error}</p>}
        {bandState && 'ok' in bandState && <p className="text-sm text-green-700">Saved</p>}
        <button
          disabled={bandPending}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {bandPending ? 'Saving…' : 'Save pricing bands'}
        </button>
      </form>
    </div>
  );
}

export function PurgeDemoButton({ hasDemo }: { hasDemo: boolean }) {
  const [pending, setPending] = useState(false);
  return (
    <form
      action={purgeDemoAction}
      onSubmit={(e) => {
        if (!confirm('Delete all demo data (leads, activities, tasks, territories)? This cannot be undone.')) {
          e.preventDefault();
          return;
        }
        setPending(true);
      }}
      className="max-w-md space-y-2"
    >
      <h2 className="text-sm font-semibold text-neutral-600">Demo data</h2>
      <p className="text-sm text-neutral-500">
        {hasDemo
          ? 'Demo data is currently loaded. Purge it before using this org for real work.'
          : 'No demo data is loaded.'}
      </p>
      <button
        disabled={!hasDemo || pending}
        className="rounded bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {pending ? 'Purging…' : 'Purge demo data'}
      </button>
    </form>
  );
}
