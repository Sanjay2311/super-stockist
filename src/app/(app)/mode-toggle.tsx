'use client';
import Link from 'next/link';

export function ModeToggle({ mode }: { mode: 'morning' | 'eod' }) {
  return (
    <div className="flex gap-2 text-sm">
      <Link href="/?mode=morning" className={`rounded px-3 py-1 ${mode === 'morning' ? 'bg-neutral-900 text-white' : 'border'}`}>Morning</Link>
      <Link href="/?mode=eod" className={`rounded px-3 py-1 ${mode === 'eod' ? 'bg-neutral-900 text-white' : 'border'}`}>EOD</Link>
    </div>
  );
}
