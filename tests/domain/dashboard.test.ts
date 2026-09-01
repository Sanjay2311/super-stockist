import { describe, it, expect } from 'vitest';
import { dashboardSummary } from '@/domain/dashboard';
import { funnelConversion, weightedPipelineValue, type LeadStage } from '@/domain/pipeline';

describe('dashboardSummary', () => {
  it('empty list → all-zero funnel and zero weighted pipeline', () => {
    const { funnel, weightedPipeline } = dashboardSummary([]);
    expect(weightedPipeline).toBe(0);
    expect(funnel.every((r) => r.count === 0)).toBe(true);
  });

  it('small fixture → funnel matches funnelConversion, weightedPipeline is the hand-summed value', () => {
    const leads = [
      { stage: 'IDENTIFIED' as LeadStage, expectedFfMonthlyPotential: 1_000_000, probability: 10 },
      { stage: 'QUALIFIED' as LeadStage, expectedFfMonthlyPotential: 2_000_000, probability: 25 },
      { stage: 'NEGOTIATION' as LeadStage, expectedFfMonthlyPotential: 4_000_000, probability: 60 },
    ];
    const { funnel, weightedPipeline } = dashboardSummary(leads);

    expect(funnel).toEqual(funnelConversion(leads.map((l) => ({ stage: l.stage }))));

    const handSummed =
      weightedPipelineValue(1_000_000, 10) +
      weightedPipelineValue(2_000_000, 25) +
      weightedPipelineValue(4_000_000, 60);
    expect(handSummed).toBe(100_000 + 500_000 + 2_400_000);
    expect(weightedPipeline).toBe(handSummed);
  });
});
