'use server';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { createLead } from '@/server/services/lead';

export async function createLeadAction(formData: FormData) {
  const user = await requireUser();
  const lead = await createLead(user, {
    businessName: String(formData.get('businessName') ?? ''),
    contactPerson: String(formData.get('contactPerson') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    expectedFfMonthlyPotential: Number(formData.get('expectedFfMonthlyPotential') ?? 0),
  });
  redirect(`/leads/${lead.id}`);
}
