'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { createTerritory } from '@/server/services/territory';
import { TERRITORY_TYPES } from '@/lib/schemas';

export async function addTerritory(formData: FormData) {
  const user = await requireUser();
  await createTerritory(user, {
    name: String(formData.get('name') ?? ''),
    type: String(formData.get('type') ?? 'AREA') as (typeof TERRITORY_TYPES)[number],
    parentId: (formData.get('parentId') || null) as string | null,
  });
  revalidatePath('/territories');
}
