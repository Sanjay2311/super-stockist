import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { getConfig, CONFIG_DEFAULTS } from '@/server/services/config';
import { hasDemoData } from '@/server/db/seed';
import { SettingsForms, PurgeDemoButton } from './forms';

export default async function SettingsPage() {
  const user = await requireUser();
  if (!can(user, 'config.edit')) redirect('/');

  const [weights, threshold, hasDemo] = await Promise.all([
    getConfig(user.orgId, 'scoreWeights'),
    getConfig(user.orgId, 'hotLeadProbabilityThreshold'),
    hasDemoData(user.orgId),
  ]);

  return (
    <main className="space-y-8 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <SettingsForms weights={weights} threshold={threshold} />
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
