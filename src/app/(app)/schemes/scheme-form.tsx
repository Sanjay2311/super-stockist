'use client';

import { useActionState, useState } from 'react';
import {
  SCHEME_TYPES,
  SCHEME_SCOPES,
  SCHEME_BENEFIT_KINDS,
  DISTRIBUTOR_GRADES,
} from '@/lib/schemas';
import type { SchemeActionState } from './actions';

const field = 'mt-1 block w-full rounded border px-2 py-1 text-sm';

type Option = { id: string; name: string };

export type SchemeFormDefaults = {
  name: string;
  type: string;
  scopeType: string;
  scopeId: string;
  startDate: string;
  endDate: string;
  minQty: number | '';
  minValue: number | ''; // rupees, for display
  benefitKind: string;
  benefitValue: number | ''; // percent for PCT, rupees otherwise
  eligibleGrades: string[];
  requiresApproval: boolean;
  active: boolean;
};

export function SchemeForm({
  action,
  products,
  categories,
  defaults,
}: {
  action: (state: SchemeActionState, formData: FormData) => Promise<SchemeActionState>;
  products: Option[];
  categories: Option[];
  defaults?: SchemeFormDefaults;
}) {
  const [state, formAction, pending] = useActionState<SchemeActionState, FormData>(action, null);

  const [scopeType, setScopeType] = useState(defaults?.scopeType ?? 'ALL');
  const [benefitKind, setBenefitKind] = useState(defaults?.benefitKind ?? 'PCT');

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <h2 className="text-sm font-semibold text-neutral-600">
        {defaults ? 'Edit scheme' : 'New scheme'}
      </h2>

      <label className="block text-sm">
        Name
        <input name="name" required defaultValue={defaults?.name} className={field} />
      </label>

      <label className="block text-sm">
        Type
        <select name="type" defaultValue={defaults?.type ?? SCHEME_TYPES[0]} className={field}>
          {SCHEME_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        Scope
        <select
          name="scopeType"
          value={scopeType}
          onChange={(e) => setScopeType(e.target.value)}
          className={field}
        >
          {SCHEME_SCOPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      {scopeType === 'PRODUCT' && (
        <label className="block text-sm">
          Product
          <select name="scopeId" defaultValue={defaults?.scopeId ?? ''} required className={field}>
            <option value="" disabled>
              — select a product —
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {scopeType === 'CATEGORY' && (
        <label className="block text-sm">
          Category
          <select name="scopeId" defaultValue={defaults?.scopeId ?? ''} required className={field}>
            <option value="" disabled>
              — select a category —
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex gap-3">
        <label className="block grow text-sm">
          Start date
          <input
            name="startDate"
            type="date"
            required
            defaultValue={defaults?.startDate}
            className={field}
          />
        </label>
        <label className="block grow text-sm">
          End date
          <input
            name="endDate"
            type="date"
            required
            defaultValue={defaults?.endDate}
            className={field}
          />
        </label>
      </div>

      <div className="flex gap-3">
        <label className="block grow text-sm">
          Min qty
          <input
            name="minQty"
            type="number"
            min="0"
            step="1"
            defaultValue={defaults?.minQty}
            className={field}
          />
        </label>
        <label className="block grow text-sm">
          Min value (₹)
          <input
            name="minValue"
            type="number"
            min="0"
            step="0.01"
            defaultValue={defaults?.minValue}
            className={field}
          />
        </label>
      </div>

      <div className="flex gap-3">
        <label className="block grow text-sm">
          Benefit kind
          <select
            name="benefitKind"
            value={benefitKind}
            onChange={(e) => setBenefitKind(e.target.value)}
            className={field}
          >
            {SCHEME_BENEFIT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="block grow text-sm">
          {benefitKind === 'PCT' ? 'Benefit (percent)' : 'Benefit (₹)'}
          <input
            name="benefitValue"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={defaults?.benefitValue}
            className={field}
          />
        </label>
      </div>

      <fieldset className="text-sm">
        <legend className="text-neutral-600">Eligible distributor grades</legend>
        <div className="mt-1 flex gap-4">
          {DISTRIBUTOR_GRADES.map((g) => (
            <label key={g} className="flex items-center gap-1">
              <input
                type="checkbox"
                name="eligibleGrades"
                value={g}
                defaultChecked={defaults?.eligibleGrades.includes(g)}
                className="rounded border"
              />
              {g}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="requiresApproval"
          defaultChecked={defaults?.requiresApproval ?? false}
          className="rounded border"
        />
        Requires approval
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={defaults ? defaults.active : true}
          className="rounded border"
        />
        Active
      </label>

      {state && 'error' in state && <p className="text-sm text-red-600">{state.error}</p>}
      {state && 'ok' in state && <p className="text-sm text-green-700">Saved</p>}

      <button
        disabled={pending}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {pending ? 'Saving…' : defaults ? 'Save scheme' : 'Create scheme'}
      </button>
    </form>
  );
}
