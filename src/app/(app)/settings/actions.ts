'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { assertCan } from '@/server/auth/permissions';
import { getConfig, setConfig } from '@/server/services/config';
import { writeAudit } from '@/server/services/audit';
import { purgeDemo } from '@/server/db/seed';
import { assertWeightsValid, type ScoreWeights } from '@/domain/scoring';

const WEIGHT_KEYS = [
  'retailerNetwork', 'categoryExperience', 'geoCoverage', 'salesmen', 'deliveryInfra',
  'workingCapital', 'brandPortfolio', 'reputation', 'willingness',
] as const;

const BAND_KEYS = [
  'ssMinMarginPct', 'ssNormalMarginPct', 'ssTargetMarginPct',
  'distributorMarginPct', 'retailerMarginPct', 'volatileFloorBufferPct',
] as const;

// A blank ('') or omitted (null) numeric field is a validation failure — never a silent 0.
function numField(fd: FormData, k: string): number | null {
  const v = fd.get(k);
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function saveScoreWeights(_prev: unknown, formData: FormData) {
  const user = await requireUser();
  assertCan(user, 'config.edit');
  const raw = Object.fromEntries(
    WEIGHT_KEYS.map((k) => [k, numField(formData, k)] as [string, number | null]),
  );
  if (WEIGHT_KEYS.some((k) => raw[k] === null)) return { error: 'weights must be numbers' };
  const weights = raw as ScoreWeights;
  try {
    assertWeightsValid(weights);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const before = await getConfig(user.orgId, 'scoreWeights');
  await setConfig(user.orgId, 'scoreWeights', weights);
  await writeAudit(user, 'config', 'scoreWeights', 'update', before, weights);
  revalidatePath('/settings');
  return { ok: true as const };
}

export async function saveThresholds(_prev: unknown, formData: FormData) {
  const user = await requireUser();
  assertCan(user, 'config.edit');
  const n = numField(formData, 'hotLeadProbabilityThreshold');
  if (n === null || !Number.isInteger(n) || n < 0 || n > 100) return { error: 'threshold must be 0–100' };
  const before = await getConfig(user.orgId, 'hotLeadProbabilityThreshold');
  await setConfig(user.orgId, 'hotLeadProbabilityThreshold', n);
  await writeAudit(user, 'config', 'hotLeadProbabilityThreshold', 'update', before, n);
  revalidatePath('/settings');
  return { ok: true as const };
}

export async function savePricingBands(_prev: unknown, formData: FormData) {
  const user = await requireUser();
  assertCan(user, 'config.edit');
  const raw = Object.fromEntries(
    BAND_KEYS.map((k) => [k, numField(formData, k)] as [string, number | null]),
  );
  if (BAND_KEYS.some((k) => raw[k] === null)) return { error: 'bands must be 0–100' };
  const bands = raw as Record<(typeof BAND_KEYS)[number], number>;
  if (!BAND_KEYS.every((k) => bands[k] >= 0 && bands[k] <= 100)) {
    return { error: 'bands must be 0–100' };
  }
  const before = await getConfig(user.orgId, 'pricingBands');
  await setConfig(user.orgId, 'pricingBands', bands);
  await writeAudit(user, 'config', 'pricingBands', 'update', before, bands);
  revalidatePath('/settings');
  return { ok: true as const };
}

export async function purgeDemoAction() {
  const user = await requireUser();
  assertCan(user, 'config.edit');
  await purgeDemo(user.orgId);
  revalidatePath('/', 'layout');
}
