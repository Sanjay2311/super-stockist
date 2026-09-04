'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { markRead } from '@/server/services/notification';

export async function markReadAction(id: string) {
  const user = await requireUser();
  await markRead(user, id);
  revalidatePath('/', 'layout');
}
