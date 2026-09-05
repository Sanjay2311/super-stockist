'use client';
import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const STORAGE_KEY = 'ss-global-filters';

export function GlobalFilters({
  territories, employees,
}: {
  territories: { id: string; name: string }[];
  employees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.toString()) return; // URL already carries filters — respect them
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) router.replace(`${pathname}?${stored}`);
    } catch {
      // sessionStorage unavailable (private mode etc.) — filters just don't persist
    }
  }, [pathname, router, searchParams]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const params = new URLSearchParams(new FormData(e.currentTarget) as unknown as Record<string, string>).toString();
    try {
      sessionStorage.setItem(STORAGE_KEY, params);
    } catch {
      // ignore
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 rounded border p-3 text-sm">
      <label>From
        <input type="date" name="from" defaultValue={searchParams.get('from') ?? ''} className="ml-1 rounded border px-2 py-1" />
      </label>
      <label>To
        <input type="date" name="to" defaultValue={searchParams.get('to') ?? ''} className="ml-1 rounded border px-2 py-1" />
      </label>
      <label>Territory
        <select name="territory" defaultValue={searchParams.get('territory') ?? ''} className="ml-1 rounded border px-2 py-1">
          <option value="">All</option>
          {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label>Employee
        <select name="employee" defaultValue={searchParams.get('employee') ?? ''} className="ml-1 rounded border px-2 py-1">
          <option value="">All</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </label>
      <button className="rounded bg-neutral-900 px-3 py-1.5 text-white">Apply</button>
    </form>
  );
}
