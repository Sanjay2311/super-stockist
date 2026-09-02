'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { updateLead, rescoreLead, setStage } from '@/server/services/lead';
import { addActivity } from '@/server/services/activity';
import { convertLead } from '@/server/services/distributor';
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

export async function convertToDistributor(id: string, formData: FormData) {
  const user = await requireUser();
  try {
    const d = await convertLead(user, id, {
      territoryId: (formData.get('territoryId') || null) as string | null,
      exclusive: formData.get('exclusive') === 'on',
      assignedEmployeeId: (formData.get('assignedEmployeeId') || null) as string | null,
      creditLimit: rupees(Number(formData.get('creditLimit') ?? 0)),
      creditDays: Number(formData.get('creditDays') ?? 0),
      paymentTerms: String(formData.get('paymentTerms') ?? ''),
      expectedMonthlyPurchase: rupees(Number(formData.get('expectedMonthlyPurchase') ?? 0)),
      overrideReason: String(formData.get('overrideReason') ?? ''),
    });
    redirect(`/distributors/${d.id}`);
  } catch (e) {
    if (e instanceof Error && e.message === 'EXCLUSIVITY_CONFLICT') return { error: 'EXCLUSIVITY_CONFLICT' as const };
    if (e instanceof Error && e.message === 'EXCLUSIVITY_OVERRIDE_REQUIRES_OWNER') return { error: 'OWNER_ONLY' as const };
    throw e;
  }
}
