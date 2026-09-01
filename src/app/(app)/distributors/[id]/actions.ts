'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { updateDistributor } from '@/server/services/distributor';
import { rupees } from '@/domain/money';
import { DISTRIBUTOR_STATUSES } from '@/lib/schemas';

export async function saveDistributor(id: string, formData: FormData) {
  const user = await requireUser();
  const text = (k: string) => {
    const v = formData.get(k);
    return v === null || v === '' ? undefined : String(v);
  };
  const status = text('status');
  await updateDistributor(user, id, {
    businessName: text('businessName'),
    contactPerson: text('contactPerson'),
    phone: text('phone'),
    email: text('email') ?? '',
    address: text('address') ?? '',
    territoryId: (formData.get('territoryId') || null) as string | null,
    exclusive: formData.get('exclusive') === 'on',
    assignedEmployeeId: (formData.get('assignedEmployeeId') || null) as string | null,
    status: status && (DISTRIBUTOR_STATUSES as readonly string[]).includes(status)
      ? (status as (typeof DISTRIBUTOR_STATUSES)[number]) : undefined,
    creditLimit: text('creditLimit') ? rupees(Number(text('creditLimit'))) : undefined,
    creditDays: text('creditDays') ? Number(text('creditDays')) : undefined,
    paymentTerms: text('paymentTerms') ?? '',
    expectedMonthlyPurchase: text('expectedMonthlyPurchase')
      ? rupees(Number(text('expectedMonthlyPurchase'))) : undefined,
    agreementStatus: text('agreementStatus') ?? '',
    overrideReason: text('overrideReason') ?? '',
  });
  revalidatePath(`/distributors/${id}`);
}
