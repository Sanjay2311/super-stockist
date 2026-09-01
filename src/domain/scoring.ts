export type ScoreKey =
  | 'retailerNetwork' | 'categoryExperience' | 'geoCoverage' | 'salesmen'
  | 'deliveryInfra' | 'workingCapital' | 'brandPortfolio' | 'reputation' | 'willingness';

export type ScoreInputs = Record<ScoreKey, number>;
export type ScoreWeights = Record<ScoreKey, number>;
export type Grade = 'A' | 'B' | 'C' | 'REJECT';

const KEYS: ScoreKey[] = [
  'retailerNetwork', 'categoryExperience', 'geoCoverage', 'salesmen',
  'deliveryInfra', 'workingCapital', 'brandPortfolio', 'reputation', 'willingness',
];

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export function assertWeightsValid(weights: ScoreWeights): void {
  const sum = KEYS.reduce((a, k) => a + (weights[k] ?? 0), 0);
  if (Math.abs(sum - 100) > 0.001) throw new Error(`score weights must sum to 100, got ${sum}`);
}

function grade(score: number): Grade {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  return 'REJECT';
}

export function scoreDistributor(inputs: Partial<ScoreInputs>, weights: ScoreWeights): { score: number; grade: Grade } {
  const score = Math.round(KEYS.reduce((a, k) => a + clamp01(inputs[k] ?? 0) * (weights[k] ?? 0), 0));
  return { score, grade: grade(score) };
}
