import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { getConfig, setConfig, CONFIG_DEFAULTS, bandsForCategory } from '@/server/services/config';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('config service', () => {
  it('returns the default when unset', async () => {
    const { orgId } = await seedBase();
    expect(await getConfig(orgId, 'scoreWeights')).toEqual(CONFIG_DEFAULTS.scoreWeights);
    expect(await getConfig(orgId, 'hotLeadProbabilityThreshold')).toBe(60);
  });
  it('persists and reads back an override', async () => {
    const { orgId } = await seedBase();
    const weights = { ...CONFIG_DEFAULTS.scoreWeights, reputation: 10, willingness: 0 };
    await setConfig(orgId, 'scoreWeights', weights);
    expect(await getConfig(orgId, 'scoreWeights')).toEqual(weights);
  });

  it('exposes default pricing bands and round-trips an override', async () => {
    const { orgId } = await seedBase();
    expect(await getConfig(orgId, 'pricingBands')).toEqual(CONFIG_DEFAULTS.pricingBands);
    expect(await getConfig(orgId, 'pricesGstInclusive')).toBe(true);
    const bands = { ...CONFIG_DEFAULTS.pricingBands, ssTargetMarginPct: 20 };
    await setConfig(orgId, 'pricingBands', bands);
    expect(await getConfig(orgId, 'pricingBands')).toEqual(bands);
  });

  it('bandsForCategory merges a per-category override onto the global bands', async () => {
    const { orgId } = await seedBase();
    await setConfig(orgId, 'pricingBandsByCategory', { 'Dry Fruits': { ssMinMarginPct: 10 } });
    const b = await bandsForCategory(orgId, 'Dry Fruits');
    expect(b.ssMinMarginPct).toBe(10);
    expect(b.ssNormalMarginPct).toBe(CONFIG_DEFAULTS.pricingBands.ssNormalMarginPct);
    const g = await bandsForCategory(orgId, 'Seeds');
    expect(g).toEqual(CONFIG_DEFAULTS.pricingBands);
  });
});
