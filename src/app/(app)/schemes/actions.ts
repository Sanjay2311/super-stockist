'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { createScheme, updateScheme } from '@/server/services/scheme';
import { rupees } from '@/domain/money';
import type { SchemeFormInput } from '@/lib/schemas';

export type SchemeActionState = { error: string } | { ok: true } | null;

// A blank ('') or omitted numeric field → null (a real "not set"), never a silent 0.
function num(fd: FormData, k: string): number | null {
  const v = fd.get(k);
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Map the flat form fields to SchemeFormInput. The benefit/eligibility jsonb
// mapping happens inside the scheme service (toColumns) — here we only flatten.
function parseForm(fd: FormData): SchemeFormInput {
  const scopeType = String(fd.get('scopeType') ?? '') as SchemeFormInput['scopeType'];
  const benefitKind = String(fd.get('benefitKind') ?? '') as SchemeFormInput['benefitKind'];

  const rawBenefit = num(fd, 'benefitValue') ?? 0;
  const rawMinValue = num(fd, 'minValue');

  return {
    name: String(fd.get('name') ?? '').trim(),
    type: String(fd.get('type') ?? '') as SchemeFormInput['type'],
    scopeType,
    scopeId: scopeType === 'ALL' ? null : (String(fd.get('scopeId') ?? '') || null),
    startDate: String(fd.get('startDate') ?? ''),
    endDate: String(fd.get('endDate') ?? ''),
    minQty: num(fd, 'minQty'),
    // minValue is always a rupee input → integer paise.
    minValue: rawMinValue == null ? null : rupees(rawMinValue),
    benefitKind,
    // PCT: pass the percent through as-is. AMOUNT / PER_UNIT: a rupee input → paise.
    benefitValue: benefitKind === 'PCT' ? rawBenefit : rupees(rawBenefit),
    eligibleGrades: fd.getAll('eligibleGrades').map(String) as ('A' | 'B' | 'C')[],
    requiresApproval: fd.get('requiresApproval') === 'on',
    active: fd.get('active') === 'on',
  };
}

export async function createSchemeAction(
  _prev: SchemeActionState,
  formData: FormData,
): Promise<SchemeActionState> {
  const user = await requireUser();
  try {
    await createScheme(user, parseForm(formData));
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/schemes');
  return { ok: true };
}

export async function updateSchemeAction(
  id: string,
  _prev: SchemeActionState,
  formData: FormData,
): Promise<SchemeActionState> {
  const user = await requireUser();
  try {
    await updateScheme(user, id, parseForm(formData));
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/schemes');
  return { ok: true };
}
