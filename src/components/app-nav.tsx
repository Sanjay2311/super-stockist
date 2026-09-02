'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppUser } from '@/server/auth/session';

type Item = { href: string; label: string; ownerOnly?: boolean };

const NAV_ITEMS: Item[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/today', label: 'Today' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/leads', label: 'Leads' },
  { href: '/distributors', label: 'Distributors' },
  { href: '/quotations', label: 'Quotations' },
  { href: '/approvals', label: 'Approvals', ownerOnly: true },
  { href: '/territories', label: 'Territories' },
  { href: '/products', label: 'Products' },
  { href: '/daily-report', label: 'Daily Report' },
  { href: '/reports/daily', label: 'Reports', ownerOnly: true },
  { href: '/settings', label: 'Settings', ownerOnly: true },
];

export function visibleNavItems(role: AppUser['role']): Item[] {
  return NAV_ITEMS.filter((i) => !i.ownerOnly || role === 'OWNER');
}

export function AppNav({ user }: { user: AppUser }) {
  const path = usePathname();
  const items = visibleNavItems(user.role);
  return (
    <>
      <aside className="hidden md:flex md:w-56 md:flex-col md:gap-1 md:border-r md:p-3">
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
      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t bg-white py-2 md:hidden">
        {items.slice(0, 5).map((i) => (
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
      </nav>
    </>
  );
}
