import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';

const CARDS: { href: string; title: string; description: string }[] = [
  { href: '/reports/pipeline', title: 'Pipeline', description: 'Lead stages, territory and employee breakdown, loss reasons.' },
  { href: '/reports/quotations', title: 'Quotations', description: 'Quotation status, distributor and employee value breakdown.' },
  { href: '/reports/employees', title: 'Employees', description: 'Per-employee activity and funnel scorecards.' },
  { href: '/reports/distributors', title: 'Distributors', description: 'Distributor status, grade, territory and daily report compliance.' },
  { href: '/reports/daily', title: 'Daily Reports', description: 'Raw daily reports submitted by field employees.' },
];

export default async function ReportsHubPage() {
  const user = await requireUser();
  if (!can(user, 'dailyReport.viewAll')) redirect('/');

  return (
    <main className="space-y-6 p-6">
      <h1 className="text-xl font-semibold">Reports</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="block rounded border p-4 hover:bg-neutral-50"
          >
            <div className="font-medium">{c.title}</div>
            <div className="mt-1 text-sm text-neutral-500">{c.description}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
