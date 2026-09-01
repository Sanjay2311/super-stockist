'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { updateLead, rescoreLead, setStage } from '@/server/services/lead';
import { addActivity } from '@/server/services/activity';
import { rupees } from '@/domain/money';
import { STAGES, type LeadStage } from '@/domain/pipeline';
import { ACTIVITY_TYPES, LOST_REASONS } from '@/lib/schemas';

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
  const stage = String(formData.get('stage'));
  const lostReason = (formData.get('lostReason') || undefined) as string | undefined;
  if (!STAGES.includes(stage as LeadStage)) throw new Error('invalid stage');
  if (lostReason && !(LOST_REASONS as readonly string[]).includes(lostReason)) {
    throw new Error('invalid lostReason');
  }
  await setStage(user, id, stage as LeadStage, {
    lostReason,
    lostNotes: (formData.get('lostNotes') || undefined) as string | undefined,
  });
  revalidatePath(`/leads/${id}`);
}

export async function logActivity(id: string, formData: FormData) {
  const user = await requireUser();
  const next = formData.get('nextFollowUpAt');
  await addActivity(user, {
    leadId: id,
    type: String(formData.get('type') ?? 'CALL') as (typeof ACTIVITY_TYPES)[number],
    notes: String(formData.get('notes') ?? ''),
    outcome: String(formData.get('outcome') ?? ''),
    nextAction: String(formData.get('nextAction') ?? ''),
    nextFollowUpAt: next ? new Date(String(next)) : null,
  });
  revalidatePath(`/leads/${id}`);
}
