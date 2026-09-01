'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { updateLead, rescoreLead, setStage } from '@/server/services/lead';
import { rupees } from '@/domain/money';
import type { LeadStage } from '@/domain/pipeline';

const SCORE_KEYS = [
  'retailerNetwork', 'categoryExperience', 'geoCoverage', 'salesmen', 'deliveryInfra',
  'workingCapital', 'brandPortfolio', 'reputation', 'willingness',
] as const;

export async function saveLeadFields(id: string, formData: FormData) {
  const user = await requireUser();
  await updateLead(user, id, {
    businessName: String(formData.get('businessName') ?? ''),
    contactPerson: String(formData.get('contactPerson') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    email: String(formData.get('email') ?? ''),
    address: String(formData.get('address') ?? ''),
    // form collects a rupee amount; the column stores integer paise.
    expectedFfMonthlyPotential: rupees(Number(formData.get('expectedFfMonthlyPotential') ?? 0)),
  });
  revalidatePath(`/leads/${id}`);
}

export async function saveScore(id: string, formData: FormData) {
  const user = await requireUser();
  const inputs = Object.fromEntries(
    SCORE_KEYS.map((k) => [k, Number(formData.get(k) ?? 0)]),
  );
  await rescoreLead(user, id, inputs);
  revalidatePath(`/leads/${id}`);
}

export async function changeStage(id: string, formData: FormData) {
  const user = await requireUser();
  await setStage(user, id, String(formData.get('stage')) as LeadStage, {
    lostReason: (formData.get('lostReason') || undefined) as string | undefined,
    lostNotes: (formData.get('lostNotes') || undefined) as string | undefined,
  });
  revalidatePath(`/leads/${id}`);
}
