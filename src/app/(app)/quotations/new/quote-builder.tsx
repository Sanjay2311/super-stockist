'use client';
import { useState } from 'react';

type Party = { id: string; name: string };
type Product = { id: string; name: string; rate: number };

const field = 'mt-1 block w-full rounded border px-2 py-1 text-sm';

export function QuoteBuilder({
  distributors,
  leads,
  products,
  action,
}: {
  distributors: Party[];
  leads: Party[];
  products: Product[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [rows, setRows] = useState<number[]>([0]);
  const [nextKey, setNextKey] = useState(1);

  const addRow = () => {
    setRows((r) => [...r, nextKey]);
    setNextKey((k) => k + 1);
  };
  const removeRow = (key: number) => setRows((r) => (r.length > 1 ? r.filter((k) => k !== key) : r));

  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm">
        Party
        <select name="party" defaultValue="" required className={field}>
          <option value="" disabled>
            — select a distributor or lead —
          </option>
          <optgroup label="Distributors">
            {distributors.map((d) => (
              <option key={d.id} value={`d:${d.id}`}>
                {d.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Leads">
            {leads.map((l) => (
              <option key={l.id} value={`l:${l.id}`}>
                {l.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>

      <label className="block text-sm">
        Valid until
        <input name="validUntil" type="date" required className={field} />
      </label>

      <label className="block text-sm">
        Notes
        <textarea name="notes" rows={2} className={field} />
      </label>

      <div className="space-y-2">
        <div className="text-sm font-medium">Line items</div>
        {rows.map((key) => (
          <LineRow key={key} products={products} onRemove={() => removeRow(key)} />
        ))}
        <button type="button" onClick={addRow} className="rounded border px-3 py-1.5 text-sm">
          Add line
        </button>
      </div>

      <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">
        Create quotation
      </button>
    </form>
  );
}

function LineRow({ products, onRemove }: { products: Product[]; onRemove: () => void }) {
  const [rate, setRate] = useState('');

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="grow text-sm">
        Product
        <select
          name="itemProductId"
          defaultValue=""
          className={field}
          onChange={(e) => {
            const p = products.find((x) => x.id === e.target.value);
            if (p) setRate(String(p.rate / 100));
          }}
        >
          <option value="">— none —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Qty
        <input
          name="itemQty"
          type="number"
          min="1"
          step="1"
          defaultValue={1}
          className={`${field} w-24`}
        />
      </label>
      <label className="text-sm">
        Rate (₹)
        <input
          name="itemRate"
          type="number"
          min="0"
          step="0.01"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className={`${field} w-32`}
        />
      </label>
      <button
        type="button"
        onClick={onRemove}
        className="rounded border px-2 py-1 text-sm text-red-600"
      >
        Remove
      </button>
    </div>
  );
}
