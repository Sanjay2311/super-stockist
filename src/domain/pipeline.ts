import type { Paise } from './money';

export type LeadStage =
  | 'IDENTIFIED' | 'CONTACTED' | 'QUALIFIED' | 'MEETING_SCHEDULED'
  | 'PRESENTATION_DONE' | 'COMMERCIAL_DISCUSSION' | 'NEGOTIATION' | 'APPROVED'
  | 'APPOINTED' | 'FIRST_ORDER' | 'ACTIVATED' | 'REPEAT_ORDER' | 'LOST' | 'ON_HOLD';

export const STAGES: LeadStage[] = [
  'IDENTIFIED', 'CONTACTED', 'QUALIFIED', 'MEETING_SCHEDULED', 'PRESENTATION_DONE',
  'COMMERCIAL_DISCUSSION', 'NEGOTIATION', 'APPROVED', 'APPOINTED', 'FIRST_ORDER',
  'ACTIVATED', 'REPEAT_ORDER', 'LOST', 'ON_HOLD',
];

const PAUSED_OR_LOST: LeadStage[] = ['LOST', 'ON_HOLD'];
export const OPEN_STAGES: LeadStage[] = STAGES.filter(
  (s) => !PAUSED_OR_LOST.includes(s) && s !== 'REPEAT_ORDER',
);

export function stageRank(stage: LeadStage): number {
  return STAGES.indexOf(stage);
}

export function weightedPipelineValue(potential: Paise, probabilityPct: number): Paise {
  return Math.round((potential * probabilityPct) / 100);
}

export const FUNNEL_STEPS = [
  { key: 'identified', label: 'Identified', reaches: 'IDENTIFIED' as LeadStage },
  { key: 'contacted', label: 'Contacted', reaches: 'CONTACTED' as LeadStage },
  { key: 'qualified', label: 'Qualified', reaches: 'QUALIFIED' as LeadStage },
  { key: 'meeting', label: 'Meeting', reaches: 'MEETING_SCHEDULED' as LeadStage },
  { key: 'commercial', label: 'Commercial Discussion', reaches: 'COMMERCIAL_DISCUSSION' as LeadStage },
  { key: 'negotiation', label: 'Negotiation', reaches: 'NEGOTIATION' as LeadStage },
  { key: 'appointed', label: 'Appointed', reaches: 'APPOINTED' as LeadStage },
  { key: 'firstOrder', label: 'First Order', reaches: 'FIRST_ORDER' as LeadStage },
  { key: 'activated', label: 'Activated', reaches: 'ACTIVATED' as LeadStage },
  { key: 'repeatOrder', label: 'Repeat Order', reaches: 'REPEAT_ORDER' as LeadStage },
];

export function funnelConversion(leads: { stage: LeadStage }[]) {
  const active = leads.filter((l) => !PAUSED_OR_LOST.includes(l.stage));
  const rows = FUNNEL_STEPS.map((step) => {
    const r = stageRank(step.reaches);
    const count = active.filter((l) => stageRank(l.stage) >= r).length;
    return { key: step.key, label: step.label, count, convFromPrev: null as number | null };
  });
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].count;
    rows[i].convFromPrev = prev === 0 ? 0 : (rows[i].count / prev) * 100;
  }
  return rows;
}
