import { funnelConversion, weightedPipelineValue, type LeadStage } from './pipeline';

type OpenLead = { stage: LeadStage; expectedFfMonthlyPotential: number; probability: number };

/** Pure summary for the M1 dashboard: the funnel rows plus the total weighted
 *  pipeline value (Σ potential × win-probability) across the open leads. */
export function dashboardSummary(openLeads: OpenLead[]): {
  funnel: ReturnType<typeof funnelConversion>;
  weightedPipeline: number;
} {
  return {
    funnel: funnelConversion(openLeads.map((l) => ({ stage: l.stage }))),
    weightedPipeline: openLeads.reduce(
      (sum, l) => sum + weightedPipelineValue(l.expectedFfMonthlyPotential, l.probability),
      0,
    ),
  };
}
