'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import {
  updatePrices,
  resetToRecommended,
  regenerateAllRecommended,
  updateProduct,
} from '@/server/services/product';
import { rupees } from '@/domain/money';

// Rupee inputs from the override form; the columns store integer paise.
const PRICE_FIELDS = ['ssBillingPrice', 'distributorPrice', 'floorPrice', 'targetPrice', 'retailerPrice'] as const;

export async function savePrices(productId: string, formData: FormData) {
  const user = await requireUser();
  const patch: Record<string, number> = {};
  for (const f of PRICE_FIELDS) {
    const v = formData.get(f);
    if (v !== null && v !== '') patch[f] = rupees(Number(v));
  }
  await updatePrices(user, productId, patch);
  revalidatePath(`/products/${productId}`);
}

export async function resetPrices(productId: string) {
  const user = await requireUser();
  await resetToRecommended(user, productId);
  revalidatePath(`/products/${productId}`);
}

export async function regenerateAll(formData: FormData) {
  const user = await requireUser();
  await regenerateAllRecommended(user, user.orgId, {
    onlyUnoverridden: formData.get('onlyUnoverridden') === 'on',
  });
  revalidatePath('/', 'layout');
}

export async function saveProduct(productId: string, formData: FormData) {
  const user = await requireUser();
  if (!can(user, 'product.edit')) throw new Error('forbidden');
  await updateProduct(user, productId, {
    name: String(formData.get('name') ?? ''),
    gstPct: Number(formData.get('gstPct') ?? 0),
    volatilePrice: formData.get('volatilePrice') === 'on',
    active: formData.get('active') === 'on',
  });
  revalidatePath(`/products/${productId}`);
}
