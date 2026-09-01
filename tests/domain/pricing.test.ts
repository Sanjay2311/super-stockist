import { describe, it, expect } from 'vitest';
import { computePricing } from '@/domain/pricing';

// Almond 100g from the F&F sheet: cost ₹107 (10700p), MRP ₹193 (19300p), 12% GST inclusive.
const base = {
  mrp: 19300, ssBillingPrice: 10700, sellingPrice: 11984, floorPrice: 11556,
  gstPct: 12, gstInclusive: true as const,
};

describe('computePricing', () => {
  it('computes gross margin and net contribution with no variable costs', () => {
    const r = computePricing(base);
    expect(r.productCostPaise).toBe(10700);
    expect(r.grossMarginPaise).toBe(1284);
    expect(r.grossMarginPct).toBeCloseTo(10.714, 2);
    expect(r.netContributionPaise).toBe(1284);          // nothing to subtract
    expect(r.netContributionPct).toBeCloseTo(10.714, 2);
    expect(r.maxPermissibleDiscountPaise).toBe(428);    // 11984 - 11556
    expect(r.belowFloor).toBe(false);
  });

  it('subtracts variable costs for net contribution only (gross unchanged)', () => {
    const r = computePricing({ ...base, costInputs: { freight: 200, scheme: 100, samples: 50 } });
    expect(r.grossMarginPaise).toBe(1284);
    expect(r.netContributionPaise).toBe(1284 - 200 - 100 - 50);   // 934
    expect(r.netContributionPct).toBeCloseTo((934 / 11984) * 100, 3);
  });

  it('backs out ex-GST taxable values when prices are GST-inclusive', () => {
    const r = computePricing(base);
    expect(r.taxable.sellingExGst).toBe(Math.round(11984 / 1.12));   // 10700
    expect(r.taxable.ssCostExGst).toBe(Math.round(10700 / 1.12));    // 9554
  });

  it('flags a below-floor selling price and clamps max discount at 0', () => {
    const r = computePricing({ ...base, sellingPrice: 11000 });
    expect(r.belowFloor).toBe(true);
    expect(r.maxPermissibleDiscountPaise).toBe(0);
    expect(r.grossMarginPaise).toBe(300);
  });

  it('builds the display waterfall, including retailer price when supplied', () => {
    const r = computePricing({ ...base, retailerPrice: 13782 });
    expect(r.waterfall).toEqual({
      mrp: 19300, retailerPrice: 13782, distributorPrice: 11984, ssPrice: 10700, ssCost: 10700,
    });
  });

  it('treats gstInclusive:false as taxable === inclusive value', () => {
    const r = computePricing({ ...base, gstInclusive: false });
    expect(r.taxable.sellingExGst).toBe(11984);
    expect(r.taxable.ssCostExGst).toBe(10700);
  });
});
