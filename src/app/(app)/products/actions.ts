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
import { productSchema } from '@/lib/schemas';

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

const productFieldsSchema = productSchema
  .pick({ name: true, gstPct: true, volatilePrice: true, active: true })
  .partial();

export async function saveProduct(productId: string, formData: FormData) {
  const user = await requireUser();
  if (!can(user, 'product.edit')) throw new Error('forbidden');
  // Blank text/number inputs → omit the key (don't send '' / 0); checkboxes are
  // always a real boolean. Zod validates name length / gstPct range here, not just
  // the HTML attrs (a crafted POST bypasses those).
  const text = (k: string) => {
    const v = formData.get(k);
    return v === null || v === '' ? undefined : String(v);
  };
  const patch = productFieldsSchema.parse({
    name: text('name'),
    gstPct: text('gstPct'),
    volatilePrice: formData.get('volatilePrice') === 'on',
    active: formData.get('active') === 'on',
  });
  await updateProduct(user, productId, patch);
  revalidatePath(`/products/${productId}`);
}
