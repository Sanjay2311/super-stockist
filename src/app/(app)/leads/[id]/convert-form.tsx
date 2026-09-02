'use client';
import { useActionState } from 'react';

type Result = { error: 'EXCLUSIVITY_CONFLICT' | 'OWNER_ONLY' } | void;

export function ConvertForm({
  action,
  territories,
}: {
  action: (fd: FormData) => Promise<Result>;
  territories: { id: string; name: string; type: string }[];
}) {
  const [state, formAction, pending] = useActionState<Result, FormData>(
    async (_prev, fd) => action(fd), undefined,
  );
  const conflict = state?.error === 'EXCLUSIVITY_CONFLICT';
  const ownerOnly = state?.error === 'OWNER_ONLY';
  const field = 'mt-1 block w-full rounded border px-2 py-1 text-sm';

  return (
    <form action={formAction} className="grid grid-cols-2 gap-3">
      <label className="text-sm">Territory
        <select name="territoryId" defaultValue="" className={field}>
          <option value="">— none —</option>
          {territories.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.type}</option>)}
        </select>
      </label>
      <label className="flex items-end gap-2 text-sm">
        <input type="checkbox" name="exclusive" /> Exclusive territory
      </label>
      <label className="text-sm">Credit limit (₹)
        <input name="creditLimit" type="number" min="0" step="1" defaultValue={0} className={field} />
      </label>
      <label className="text-sm">Credit days
        <input name="creditDays" type="number" min="0" max="365" step="1" defaultValue={0} className={field} />
      </label>
      <label className="text-sm">Payment terms
        <input name="paymentTerms" className={field} placeholder="e.g. 50% advance, balance on delivery" />
      </label>
      <label className="text-sm">Expected monthly purchase (₹)
        <input name="expectedMonthlyPurchase" type="number" min="0" step="1" defaultValue={0} className={field} />
      </label>

      {(conflict || ownerOnly) && (
        <div className="col-span-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {ownerOnly
            ? 'This territory is already held exclusively by another distributor. Only the owner can override an exclusivity clash.'
            : 'This territory is already held exclusively by another distributor. Enter a reason to override and record it, then submit again.'}
          {conflict && (
            <textarea name="overrideReason" rows={2} required
              className="mt-2 block w-full rounded border px-2 py-1"
              placeholder="Why is this exclusivity clash acceptable?" />
          )}
        </div>
      )}

      <div className="col-span-2">
        <button disabled={pending}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          {pending ? 'Converting…' : 'Convert to Distributor'}
        </button>
      </div>
    </form>
  );
}
