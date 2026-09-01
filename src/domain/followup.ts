import { OPEN_STAGES, type LeadStage } from './pipeline';

export type FollowUpBucket = 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'NONE';

const IST_OFFSET_MIN = 330;

function istParts(d: Date) {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

export function classifyFollowUp(nextFollowUpAt: Date | null, now: Date): FollowUpBucket {
  if (!nextFollowUpAt) return 'NONE';
  const a = istParts(nextFollowUpAt);
  const b = istParts(now);
  const aKey = a.y * 10000 + a.m * 100 + a.day;
  const bKey = b.y * 10000 + b.m * 100 + b.day;
  if (aKey < bKey) return 'OVERDUE';
  if (aKey === bKey) return 'TODAY';
  return 'UPCOMING';
}

export function isHotLead(a: {
  grade: string;
  probability: number;
  stage: LeadStage;
  hotThreshold: number;
}): boolean {
  if (!OPEN_STAGES.includes(a.stage)) return false;
  return a.grade === 'A' || a.probability >= a.hotThreshold;
}

export function needsNextAction(a: { stage: LeadStage; nextFollowUpAt: Date | null }): boolean {
  return OPEN_STAGES.includes(a.stage) && a.nextFollowUpAt == null;
}
