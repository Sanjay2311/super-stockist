'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { setStage } from '@/server/services/lead';
import type { LeadStage } from '@/domain/pipeline';

export async function moveLeadAction(leadId: string, stage: LeadStage) {
  const user = await requireUser();
  // The board has no LOST/ON_HOLD column — those moves need a reason, so route the
  // user to the lead detail page instead of dropping the card there.
  if (stage === 'LOST' || stage === 'ON_HOLD') return { error: 'open-detail' as const };
  try {
    await setStage(user, leadId, stage);
    revalidatePath('/pipeline');
    return { ok: true as const };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
