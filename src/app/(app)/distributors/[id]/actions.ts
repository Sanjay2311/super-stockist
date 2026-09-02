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
    // assignedEmployeeId is intentionally not sent: M2b has no editable control for
    // it, conversion (Task 5) sets it, and patchOnly would otherwise wipe it to null
    // on every master-form save.
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
