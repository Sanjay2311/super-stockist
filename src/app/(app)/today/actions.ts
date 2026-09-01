'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { createTask, completeTask } from '@/server/services/task';
import { TASK_TYPES } from '@/lib/schemas';

export async function addTask(formData: FormData) {
  const user = await requireUser();
  await createTask(user, {
    title: String(formData.get('title') ?? ''),
    type: String(formData.get('type') ?? 'OTHER') as (typeof TASK_TYPES)[number],
    dueDate: new Date(String(formData.get('dueDate') ?? new Date().toISOString().slice(0, 10))),
  });
  revalidatePath('/today');
}

export async function finishTask(id: string) {
  const user = await requireUser();
  await completeTask(user, id);
  revalidatePath('/today');
}
