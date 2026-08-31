import { describe, it, expect } from 'vitest';
import { scoreDistributor, assertWeightsValid, type ScoreWeights } from '@/domain/scoring';

const W: ScoreWeights = {
  retailerNetwork: 20, categoryExperience: 15, geoCoverage: 15, salesmen: 10,
  deliveryInfra: 10, workingCapital: 10, brandPortfolio: 10, reputation: 5, willingness: 5,
};

describe('scoreDistributor', () => {
  it('scores a perfect distributor as 100 / grade A', () => {
    const all1 = Object.fromEntries(Object.keys(W).map((k) => [k, 1]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(scoreDistributor(all1 as any, W)).toEqual({ score: 100, grade: 'A' });
  });
  it('treats missing inputs as 0 and clamps out-of-range', () => {
    expect(scoreDistributor({ retailerNetwork: 5, categoryExperience: 1 }, W))
      .toEqual({ score: 35, grade: 'REJECT' });   // 20 + 15
  });
  it('applies grade thresholds', () => {
    const half = Object.fromEntries(Object.keys(W).map((k) => [k, 0.7]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = scoreDistributor(half as any, W);   // 70 → B
    expect(r).toEqual({ score: 70, grade: 'B' });
  });
  it('rejects weights that do not sum to 100', () => {
    expect(() => assertWeightsValid({ ...W, willingness: 10 })).toThrow();
    expect(() => assertWeightsValid(W)).not.toThrow();
  });
});
