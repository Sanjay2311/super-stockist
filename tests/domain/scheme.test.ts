import { describe, it, expect } from 'vitest';
import { isSchemeEligible, schemeBenefitPaise, type SchemeDef } from '@/domain/scheme';

const base: SchemeDef = {
  type: 'FLAT_DISCOUNT', scopeType: 'ALL', scopeId: null,
  startDate: '2026-09-01', endDate: '2026-09-30',
  minQty: null, minValue: null,
  benefit: { kind: 'PCT', value: 5 }, eligibility: {}, active: true,
};
const ctx = {
  onDate: '2026-09-15', productId: 'p1', categoryId: 'c1',
  qty: 10, lineValue: 112000, distributorGrade: 'B' as string | null,
};

describe('isSchemeEligible', () => {
  it('true for an active, in-window, all-scope scheme with no thresholds', () => {
    expect(isSchemeEligible(base, ctx)).toBe(true);
  });
  it('false when inactive or out of the date window', () => {
    expect(isSchemeEligible({ ...base, active: false }, ctx)).toBe(false);
    expect(isSchemeEligible(base, { ...ctx, onDate: '2026-10-01' })).toBe(false);
    expect(isSchemeEligible(base, { ...ctx, onDate: '2026-08-31' })).toBe(false);
  });
  it('respects PRODUCT and CATEGORY scope', () => {
    expect(isSchemeEligible({ ...base, scopeType: 'PRODUCT', scopeId: 'p1' }, ctx)).toBe(true);
    expect(isSchemeEligible({ ...base, scopeType: 'PRODUCT', scopeId: 'p2' }, ctx)).toBe(false);
    expect(isSchemeEligible({ ...base, scopeType: 'CATEGORY', scopeId: 'c1' }, ctx)).toBe(true);
    expect(isSchemeEligible({ ...base, scopeType: 'CATEGORY', scopeId: 'c9' }, ctx)).toBe(false);
  });
  it('respects minQty / minValue and distributor-grade eligibility', () => {
    expect(isSchemeEligible({ ...base, minQty: 20 }, ctx)).toBe(false);
    expect(isSchemeEligible({ ...base, minValue: 200000 }, ctx)).toBe(false);
    expect(isSchemeEligible({ ...base, eligibility: { distributorGrades: ['A'] } }, ctx)).toBe(false);
    expect(isSchemeEligible({ ...base, eligibility: { distributorGrades: ['A', 'B'] } }, ctx)).toBe(true);
    expect(isSchemeEligible({ ...base, eligibility: { distributorGrades: ['A'] } }, { ...ctx, distributorGrade: null })).toBe(false);
  });
});

describe('schemeBenefitPaise', () => {
  const line = { qty: 10, requestedRate: 11200 }; // gross 112000
  it('PCT of gross', () => {
    expect(schemeBenefitPaise({ ...base, benefit: { kind: 'PCT', value: 5 } }, line)).toBe(5600);
  });
  it('flat AMOUNT, capped at gross', () => {
    expect(schemeBenefitPaise({ ...base, benefit: { kind: 'AMOUNT', value: 2000 } }, line)).toBe(2000);
    expect(schemeBenefitPaise({ ...base, benefit: { kind: 'AMOUNT', value: 999999 } }, line)).toBe(112000);
  });
  it('PER_UNIT times qty', () => {
    expect(schemeBenefitPaise({ ...base, type: 'QTY_SCHEME', benefit: { kind: 'PER_UNIT', value: 500 } }, line)).toBe(5000);
  });
  it('DISTRIBUTOR_INCENTIVE yields 0 at quote time (accrual is Phase 2)', () => {
    expect(schemeBenefitPaise({ ...base, type: 'DISTRIBUTOR_INCENTIVE', benefit: { kind: 'PCT', value: 3 } }, line)).toBe(0);
  });
});
