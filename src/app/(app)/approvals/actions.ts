'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { decideApproval } from '@/server/services/quotation';

export async function decideApprovalAction(
  approvalId: string,
  decision: 'APPROVED' | 'REJECTED',
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const note = String(formData.get('note') ?? '').trim();
  await decideApproval(user, approvalId, decision, note || undefined);
  revalidatePath('/approvals');
}
