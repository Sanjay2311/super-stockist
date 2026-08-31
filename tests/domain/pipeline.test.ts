import { describe, it, expect } from 'vitest';
import { STAGES, OPEN_STAGES, stageRank, weightedPipelineValue, funnelConversion } from '@/domain/pipeline';

describe('pipeline domain', () => {
  it('has 14 canonical stages in order', () => {
    expect(STAGES).toHaveLength(14);
    expect(STAGES[0]).toBe('IDENTIFIED');
    expect(STAGES[STAGES.length - 1]).toBe('ON_HOLD');
    expect(stageRank('NEGOTIATION')).toBe(STAGES.indexOf('NEGOTIATION'));
  });
  it('excludes terminal/paused stages from OPEN_STAGES', () => {
    expect(OPEN_STAGES).not.toContain('LOST');
    expect(OPEN_STAGES).not.toContain('REPEAT_ORDER');
    expect(OPEN_STAGES).not.toContain('ON_HOLD');
  });
  it('weights pipeline value by probability', () => {
    expect(weightedPipelineValue(30000000, 50)).toBe(15000000);
    expect(weightedPipelineValue(10000, 33)).toBe(3300);
  });
  it('computes funnel counts and stage-to-stage conversion', () => {
    const leads = [
      { stage: 'IDENTIFIED' as const }, { stage: 'CONTACTED' as const },
      { stage: 'QUALIFIED' as const }, { stage: 'APPOINTED' as const },
      { stage: 'LOST' as const },
    ];
    const rows = funnelConversion(leads);
    const identified = rows.find((r) => r.key === 'identified')!;
    const contacted = rows.find((r) => r.key === 'contacted')!;
    const qualified = rows.find((r) => r.key === 'qualified')!;
    const meeting = rows.find((r) => r.key === 'meeting')!;
    const negotiation = rows.find((r) => r.key === 'negotiation')!;
    const appointed = rows.find((r) => r.key === 'appointed')!;

    // LOST is excluded; active leads: IDENTIFIED, CONTACTED, QUALIFIED, APPOINTED = 4
    expect(identified.count).toBe(4);
    expect(contacted.count).toBe(3);
    expect(qualified.count).toBe(2);
    expect(meeting.count).toBe(1);
    expect(negotiation.count).toBe(1);
    expect(appointed.count).toBe(1);

    // Conversion percentages (from previous funnel step)
    expect(identified.convFromPrev).toBeNull();
    expect(contacted.convFromPrev).toBeCloseTo((3 / 4) * 100);
    expect(qualified.convFromPrev).toBeCloseTo((2 / 3) * 100);
    expect(meeting.convFromPrev).toBeCloseTo((1 / 2) * 100);
    expect(negotiation.convFromPrev).toBeCloseTo((1 / 1) * 100);
    expect(appointed.convFromPrev).toBeCloseTo((1 / 1) * 100);
  });
});
