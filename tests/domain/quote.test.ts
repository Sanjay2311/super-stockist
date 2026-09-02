import { describe, it, expect } from 'vitest';
import { classifyRate, computeQuoteLine, quoteTotals } from '@/domain/quote';

describe('classifyRate (spec §16 ladder)', () => {
  const bands = { floorRate: 11556, targetRate: 12626 };
  it('AUTO at or above target', () => {
    expect(classifyRate({ requestedRate: 12626, ...bands })).toBe('AUTO');
    expect(classifyRate({ requestedRate: 13000, ...bands })).toBe('AUTO');
  });
  it('NEEDS_APPROVAL between floor (inclusive) and target (exclusive)', () => {
    expect(classifyRate({ requestedRate: 11556, ...bands })).toBe('NEEDS_APPROVAL');
    expect(classifyRate({ requestedRate: 12000, ...bands })).toBe('NEEDS_APPROVAL');
  });
  it('BELOW_FLOOR under the floor', () => {
    expect(classifyRate({ requestedRate: 11555, ...bands })).toBe('BELOW_FLOOR');
  });
});

describe('computeQuoteLine (GST-inclusive)', () => {
  it('nets discount + scheme off the gross and backs GST out of the net', () => {
    const r = computeQuoteLine({ qty: 10, requestedRate: 11200, discount: 2000, schemeBenefit: 3360, gstPct: 12 });
    expect(r.gross).toBe(112000);
    expect(r.netAmount).toBe(106640);           // 112000 - 2000 - 3360
    expect(r.taxableValue).toBe(Math.round(106640 / 1.12)); // 95214
    expect(r.gstAmount).toBe(106640 - Math.round(106640 / 1.12));
  });
  it('never goes negative', () => {
    const r = computeQuoteLine({ qty: 1, requestedRate: 1000, discount: 5000, schemeBenefit: 0, gstPct: 5 });
    expect(r.netAmount).toBe(0);
  });
});

describe('quoteTotals', () => {
  it('sums each column across lines', () => {
    const mk = (i: Parameters<typeof computeQuoteLine>[0]) => ({ ...i, ...computeQuoteLine(i) });
    const lines = [
      mk({ qty: 10, requestedRate: 11200, discount: 0, schemeBenefit: 0, gstPct: 12 }),
      mk({ qty: 5, requestedRate: 20000, discount: 1000, schemeBenefit: 0, gstPct: 5 }),
    ];
    const t = quoteTotals(lines);
    expect(t.gross).toBe(112000 + 100000);
    expect(t.discountTotal).toBe(1000);
    expect(t.netTotal).toBe(lines[0].netAmount + lines[1].netAmount);
    expect(t.taxableTotal).toBe(lines[0].taxableValue + lines[1].taxableValue);
    expect(t.gstTotal).toBe(lines[0].gstAmount + lines[1].gstAmount);
  });
});
