import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { getConfig, CONFIG_DEFAULTS } from '@/server/services/config';
import { auditLog } from '@/server/db/schema/audit';
import type { AppUser } from '@/server/auth/session';

// The actions call requireUser() (needs Next request context + Supabase) — stub it.
// revalidatePath() needs a request scope it does not have under vitest — stub it too.
vi.mock('@/server/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/server/auth/session')>()),
  requireUser: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { requireUser } from '@/server/auth/session';
import { saveScoreWeights, saveThresholds } from '@/app/(app)/settings/actions';

const owner = (orgId: string): AppUser => ({ id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });
const sales = (orgId: string): AppUser => ({ id: 's', email: 's', name: 'S', role: 'SALES', employeeId: null, orgId });

const WEIGHT_KEYS = [
  'retailerNetwork', 'categoryExperience', 'geoCoverage', 'salesmen', 'deliveryInfra',
  'workingCapital', 'brandPortfolio', 'reputation', 'willingness',
] as const;

function weightsForm(w: Record<string, number>): FormData {
  const fd = new FormData();
  for (const k of WEIGHT_KEYS) fd.set(k, String(w[k] ?? 0));
  return fd;
}

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('saveScoreWeights', () => {
  it('persists 9 weights that sum to 100', async () => {
    const { orgId } = await seedBase();
    vi.mocked(requireUser).mockResolvedValue(owner(orgId));
    const w = {
      retailerNetwork: 25, categoryExperience: 15, geoCoverage: 15, salesmen: 10, deliveryInfra: 10,
      workingCapital: 10, brandPortfolio: 10, reputation: 5, willingness: 0,
    };

    const res = await saveScoreWeights(null, weightsForm(w));

    expect(res).toEqual({ ok: true });
    expect(await getConfig(orgId, 'scoreWeights')).toEqual(w);

    const audit = await testDb.select().from(auditLog)
      .where(and(eq(auditLog.entityType, 'config'), eq(auditLog.entityId, 'scoreWeights')));
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe('update');
    expect(audit[0].newValues).toEqual(w);
  });

  it('rejects non-numeric (NaN) weights and leaves config unchanged', async () => {
    const { orgId } = await seedBase();
    vi.mocked(requireUser).mockResolvedValue(owner(orgId));
    const fd = weightsForm(CONFIG_DEFAULTS.scoreWeights);
    fd.set('retailerNetwork', 'abc'); // Number('abc') → NaN

    const res = await saveScoreWeights(null, fd);

    expect(res).toEqual({ error: 'weights must be numbers' });
    expect(await getConfig(orgId, 'scoreWeights')).toEqual(CONFIG_DEFAULTS.scoreWeights);
  });

  it('rejects weights that do not sum to 100 and leaves config unchanged', async () => {
    const { orgId } = await seedBase();
    vi.mocked(requireUser).mockResolvedValue(owner(orgId));
    const bad = { ...CONFIG_DEFAULTS.scoreWeights, reputation: 10 }; // 105

    const res = await saveScoreWeights(null, weightsForm(bad));

    expect(res).toEqual({ error: 'score weights must sum to 100, got 105' });
    expect(await getConfig(orgId, 'scoreWeights')).toEqual(CONFIG_DEFAULTS.scoreWeights);
  });

  it('lets assertCan reject a SALES caller', async () => {
    const { orgId } = await seedBase();
    vi.mocked(requireUser).mockResolvedValue(sales(orgId));
    await expect(saveScoreWeights(null, weightsForm(CONFIG_DEFAULTS.scoreWeights))).rejects.toThrow('forbidden');
  });
});

describe('saveThresholds', () => {
  it('persists an in-range hot-lead probability threshold', async () => {
    const { orgId } = await seedBase();
    vi.mocked(requireUser).mockResolvedValue(owner(orgId));
    const fd = new FormData();
    fd.set('hotLeadProbabilityThreshold', '55');

    const res = await saveThresholds(null, fd);

    expect(res).toEqual({ ok: true });
    expect(await getConfig(orgId, 'hotLeadProbabilityThreshold')).toBe(55);
  });

  it('rejects an out-of-range threshold', async () => {
    const { orgId } = await seedBase();
    vi.mocked(requireUser).mockResolvedValue(owner(orgId));
    const fd = new FormData();
    fd.set('hotLeadProbabilityThreshold', '120');

    const res = await saveThresholds(null, fd);

    expect(res).toEqual({ error: 'threshold must be 0–100' });
    expect(await getConfig(orgId, 'hotLeadProbabilityThreshold')).toBe(CONFIG_DEFAULTS.hotLeadProbabilityThreshold);
  });

  it('lets assertCan reject a SALES caller', async () => {
    const { orgId } = await seedBase();
    vi.mocked(requireUser).mockResolvedValue(sales(orgId));
    const fd = new FormData();
    fd.set('hotLeadProbabilityThreshold', '55');
    await expect(saveThresholds(null, fd)).rejects.toThrow('forbidden');
  });
});
