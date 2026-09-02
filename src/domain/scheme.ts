import type { Paise } from './money';

export type SchemeType = 'FLAT_DISCOUNT' | 'QTY_SCHEME' | 'DISTRIBUTOR_INCENTIVE';
export type SchemeScope = 'PRODUCT' | 'CATEGORY' | 'ALL';

export interface SchemeBenefit {
  kind: 'PCT' | 'AMOUNT' | 'PER_UNIT';
  value: number; // PCT: percent 0-100; AMOUNT / PER_UNIT: paise
}

export interface SchemeDef {
  type: SchemeType;
  scopeType: SchemeScope;
  scopeId: string | null;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
  minQty: number | null;
  minValue: Paise | null;
  benefit: SchemeBenefit;
  eligibility: { distributorGrades?: string[] };
  active: boolean;
}

export interface SchemeContext {
  onDate: string; // 'YYYY-MM-DD'
  productId: string;
  categoryId: string | null;
  qty: number;
  lineValue: Paise; // qty * requestedRate, pre-discount
  distributorGrade: string | null;
}

export function isSchemeEligible(s: SchemeDef, ctx: SchemeContext): boolean {
  if (!s.active) return false;
  if (ctx.onDate < s.startDate || ctx.onDate > s.endDate) return false;
  if (s.scopeType === 'PRODUCT' && s.scopeId !== ctx.productId) return false;
  if (s.scopeType === 'CATEGORY' && s.scopeId !== ctx.categoryId) return false;
  if (s.minQty != null && ctx.qty < s.minQty) return false;
  if (s.minValue != null && ctx.lineValue < s.minValue) return false;
  const grades = s.eligibility.distributorGrades;
  if (grades && grades.length > 0) {
    if (!ctx.distributorGrade || !grades.includes(ctx.distributorGrade)) return false;
  }
  return true;
}

export function schemeBenefitPaise(s: SchemeDef, line: { qty: number; requestedRate: Paise }): Paise {
  if (s.type === 'DISTRIBUTOR_INCENTIVE') return 0; // payout accrual needs Orders (Phase 2)
  const gross = line.qty * line.requestedRate;
  let raw: number;
  switch (s.benefit.kind) {
    case 'PCT': raw = Math.round(gross * s.benefit.value / 100); break;
    case 'AMOUNT': raw = s.benefit.value; break;
    case 'PER_UNIT': raw = s.benefit.value * line.qty; break;
    default: raw = 0; break;
  }
  return Math.max(0, Math.min(gross, raw));
}
