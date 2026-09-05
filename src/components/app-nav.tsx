'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AppUser } from '@/server/auth/session';

type Item = { href: string; label: string; ownerOnly?: boolean };

const NAV_ITEMS: Item[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/today', label: 'Today' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/leads', label: 'Leads' },
  { href: '/distributors', label: 'Distributors' },
  { href: '/reports/employees', label: 'Employee Activity', ownerOnly: true },
  { href: '/quotations', label: 'Quotations' },
  { href: '/approvals', label: 'Approvals', ownerOnly: true },
  { href: '/territories', label: 'Territories' },
  { href: '/products', label: 'Products' },
  { href: '/schemes', label: 'Schemes', ownerOnly: true },
  { href: '/daily-report', label: 'Daily Report' },
  { href: '/reports', label: 'Reports', ownerOnly: true },
  { href: '/settings', label: 'Settings', ownerOnly: true },
];

// spec §6.1: mobile bottom nav shows a curated "field set" + a "+More" overflow,
// not every item — a phone-width bar can't fit all 13.
const MOBILE_PRIMARY_HREFS = ['/today', '/pipeline', '/distributors', '/quotations'];

export function visibleNavItems(role: AppUser['role']): Item[] {
  return NAV_ITEMS.filter((i) => !i.ownerOnly || role === 'OWNER');
}

export function AppNav({ user }: { user: AppUser }) {
  const path = usePathname();
  const items = visibleNavItems(user.role);
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the overflow sheet on navigation — AppNav persists across route
  // changes inside the shared layout, so its state otherwise would too.
  useEffect(() => {
    setMoreOpen(false);
  }, [path]);

  const primary = MOBILE_PRIMARY_HREFS
    .map((href) => items.find((i) => i.href === href))
    .filter((i): i is Item => i != null);
  const overflow = items.filter((i) => !MOBILE_PRIMARY_HREFS.includes(i.href));

  return (
    <>
      <aside className="hidden md:flex md:w-56 md:flex-col md:gap-1 md:border-r md:p-3 print:hidden">
        <div className="px-2 py-3 text-sm font-semibold">Super Stockist</div>
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={path === i.href ? 'page' : undefined}
            className={`rounded px-3 py-2 text-sm ${
              path === i.href ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'
            }`}
          >
            {i.label}
          </Link>
        ))}
      </aside>

      {moreOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMoreOpen(false)}
          className="fixed inset-0 z-10 bg-black/20 md:hidden print:hidden"
        />
      )}
      {moreOpen && (
        <div className="fixed inset-x-0 bottom-14 z-20 max-h-[60vh] overflow-y-auto rounded-t-lg border-t bg-white p-2 shadow-lg md:hidden print:hidden">
          {overflow.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={path === i.href ? 'page' : undefined}
              className={`block rounded px-3 py-2 text-sm ${
                path === i.href ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'
              }`}
            >
              {i.label}
            </Link>
          ))}
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t bg-white py-2 md:hidden print:hidden">
        {primary.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={path === i.href ? 'page' : undefined}
            className={`px-2 text-xs ${
              path === i.href ? 'font-semibold text-neutral-900' : 'text-neutral-500'
            }`}
          >
            {i.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className={`px-2 text-xs ${moreOpen ? 'font-semibold text-neutral-900' : 'text-neutral-500'}`}
        >
          More
        </button>
      </nav>
    </>
  );
}
