import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { getConfig, setConfig, CONFIG_DEFAULTS } from '@/server/services/config';

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
});
