import { describe, it, expect } from 'vitest';
import { recommendPricing, type PricingBands } from '@/domain/pricing-recommend';

const bands: PricingBands = {
  ssMinMarginPct: 8, ssNormalMarginPct: 12, ssTargetMarginPct: 18,
  distributorMarginPct: 15, retailerMarginPct: 25, volatileFloorBufferPct: 12,
};

describe('recommendPricing', () => {
  it('matches the spec §5.3 worked example (Almond 100g, non-volatile bands)', () => {
    const r = recommendPricing({ ssBillingPrice: 10700, mrp: 19300, gstPct: 12, volatile: false, bands });
    expect(r.floorPrice).toBe(11556);          // 10700 * 1.08
    expect(r.distributorPrice).toBe(11984);    // 10700 * 1.12
    expect(r.targetPrice).toBe(12626);         // 10700 * 1.18
    expect(r.retailerPrice).toBe(Math.round(11984 * 1.15));   // 13782
    expect(r.mrpSuggestion).toBeNull();        // MRP present
    expect(r.marginAtEach.floorPct).toBeCloseTo(8, 5);
    expect(r.marginAtEach.distributorPct).toBeCloseTo(12, 5);
    expect(r.marginAtEach.targetPct).toBeCloseTo(18, 5);
    expect(r.rationale.map((x) => x.field)).toEqual(
      expect.arrayContaining(['floorPrice', 'distributorPrice', 'targetPrice', 'retailerPrice']),
    );
    // MRP 19300 vs retailer 13782 → ~40% headroom, well above the 25% target → no mrpCheck flag
    expect(r.rationale.find((x) => x.field === 'mrpCheck')).toBeUndefined();
  });

  it('uses the wider volatile buffer for the floor', () => {
    const r = recommendPricing({ ssBillingPrice: 10000, mrp: null, gstPct: 12, volatile: true, bands });
    expect(r.floorPrice).toBe(11200);          // 10000 * 1.12 (buffer), not * 1.08
    expect(r.rationale.find((x) => x.field === 'floorPrice')!.why).toMatch(/volatile/i);
  });

  it('suggests an MRP when none is given', () => {
    const r = recommendPricing({ ssBillingPrice: 10000, mrp: null, gstPct: 5, volatile: false, bands });
    const expectedRetailer = Math.round(Math.round(10000 * 1.12) * 1.15);
    expect(r.retailerPrice).toBe(expectedRetailer);
    expect(r.mrpSuggestion).toBe(Math.round(expectedRetailer * 1.25));
  });

  it('flags an MRP that is too low to support the retailer margin', () => {
    // cost 10000 → distributor 11200 → retailer 12880; an MRP of 13000 gives only ~0.9% headroom
    const r = recommendPricing({ ssBillingPrice: 10000, mrp: 13000, gstPct: 5, volatile: false, bands });
    const flag = r.rationale.find((x) => x.field === 'mrpCheck');
    expect(flag).toBeDefined();
    expect(flag!.why).toMatch(/only supports/i);
  });
});
