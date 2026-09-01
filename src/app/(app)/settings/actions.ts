'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { assertCan } from '@/server/auth/permissions';
import { setConfig } from '@/server/services/config';
import { purgeDemo } from '@/server/db/seed';
import { assertWeightsValid, type ScoreWeights } from '@/domain/scoring';

const WEIGHT_KEYS = [
  'retailerNetwork', 'categoryExperience', 'geoCoverage', 'salesmen', 'deliveryInfra',
  'workingCapital', 'brandPortfolio', 'reputation', 'willingness',
] as const;

export async function saveScoreWeights(_prev: unknown, formData: FormData) {
  const user = await requireUser();
  assertCan(user, 'config.edit');
  const weights = Object.fromEntries(
    WEIGHT_KEYS.map((k) => [k, Number(formData.get(k) ?? 0)]),
  ) as ScoreWeights;
  try {
    assertWeightsValid(weights);
  } catch (e) {
    return { error: (e as Error).message };
  }
  await setConfig(user.orgId, 'scoreWeights', weights);
  revalidatePath('/settings');
  return { ok: true as const };
}

export async function saveThresholds(_prev: unknown, formData: FormData) {
  const user = await requireUser();
  assertCan(user, 'config.edit');
  const n = Number(formData.get('hotLeadProbabilityThreshold') ?? 60);
  if (!Number.isInteger(n) || n < 0 || n > 100) return { error: 'threshold must be 0–100' };
  await setConfig(user.orgId, 'hotLeadProbabilityThreshold', n);
  revalidatePath('/settings');
  return { ok: true as const };
}

export async function purgeDemoAction() {
  const user = await requireUser();
  assertCan(user, 'config.edit');
  await purgeDemo();
  revalidatePath('/', 'layout');
}
