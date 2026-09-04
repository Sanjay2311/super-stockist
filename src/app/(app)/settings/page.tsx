import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { getConfig, CONFIG_DEFAULTS } from '@/server/services/config';
import { hasDemoData } from '@/server/db/seed';
import { regenerateAll } from '../products/actions';
import { runAlertScanAction } from './actions';
import { SettingsForms, PurgeDemoButton } from './forms';

export default async function SettingsPage() {
  const user = await requireUser();
  if (!can(user, 'config.edit')) redirect('/');

  const [weights, threshold, bands, hasDemo] = await Promise.all([
    getConfig(user.orgId, 'scoreWeights'),
    getConfig(user.orgId, 'hotLeadProbabilityThreshold'),
    getConfig(user.orgId, 'pricingBands'),
    hasDemoData(user.orgId),
  ]);

  return (
    <main className="space-y-8 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <SettingsForms weights={weights} threshold={threshold} bands={bands} />
      {can(user, 'pricing.recommend') && (
        <form action={regenerateAll} className="max-w-md space-y-2">
          <h2 className="text-sm font-semibold text-neutral-600">Recommended prices</h2>
          <p className="text-sm text-neutral-500">
            Recompute every product’s recommended floor / distributor / target / retailer price from
            the current pricing bands.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="onlyUnoverridden" defaultChecked className="rounded border" />
            Only prices not manually set
          </label>
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">
            Regenerate recommended prices
          </button>
        </form>
      )}
      <form
        action={async () => {
          'use server';
          await runAlertScanAction();
        }}
        className="max-w-md space-y-2"
      >
        <h2 className="text-sm font-semibold text-neutral-600">Alerts</h2>
        <p className="text-sm text-neutral-500">
          Manually run the alert scan (the same job the nightly cron trigger runs once deployed).
        </p>
        <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Run alert scan</button>
      </form>
      <PurgeDemoButton hasDemo={hasDemo} />
      <section>
        {/* ponytail: stage-probability map is read-only in M1 — editing it is deferred to
            M2 (needs per-stage validation + a rescore sweep). Shown here for reference. */}
        <h2 className="text-sm font-semibold text-neutral-600">Stage probabilities (read-only in M1)</h2>
        <pre className="mt-2 overflow-x-auto rounded border bg-neutral-50 p-3 text-xs">
          {JSON.stringify(CONFIG_DEFAULTS.stageProbability, null, 2)}
        </pre>
      </section>
    </main>
  );
}
