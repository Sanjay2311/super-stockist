'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { createQuotation, submitQuotation, setQuotationStatus } from '@/server/services/quotation';
import { rupees } from '@/domain/money';

// The party <select> in quote-builder.tsx carries a `d:<id>` / `l:<id>` prefix so a
// single control can pick either a distributor or a lead; the action splits it back.
export async function createQuotationAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const [kind, partyId] = String(formData.get('party') ?? '').split(':');
  const distributorId = kind === 'd' ? partyId : undefined;
  const leadId = kind === 'l' ? partyId : undefined;

  const validUntil = String(formData.get('validUntil') ?? '');
  const notes = String(formData.get('notes') ?? '').trim();

  const productIds = formData.getAll('itemProductId').map(String);
  const qtys = formData.getAll('itemQty').map((v) => Number(v));
  const rates = formData.getAll('itemRate').map((v) => Number(v));

  const items = productIds
    .map((productId, i) => ({
      productId,
      qty: qtys[i] ?? 0,
      // the form collects a rupee amount; the column stores integer paise.
      requestedRate: rupees(rates[i] ?? 0),
    }))
    .filter((it) => it.productId && it.qty > 0);

  const q = await createQuotation(user, {
    distributorId,
    leadId,
    validUntil,
    notes: notes || undefined,
    items,
  });
  // redirect() throws internally — keep it after the await and outside any try.
  redirect(`/quotations/${q.id}`);
}

export async function submitQuotationAction(id: string): Promise<void> {
  const user = await requireUser();
  await submitQuotation(user, id);
  revalidatePath(`/quotations/${id}`);
}

export async function setStatusAction(id: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  await setQuotationStatus(user, id, String(formData.get('status') ?? ''));
  revalidatePath(`/quotations/${id}`);
}
