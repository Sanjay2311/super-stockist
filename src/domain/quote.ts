import type { Paise } from './money';

export type RateClass = 'AUTO' | 'NEEDS_APPROVAL' | 'BELOW_FLOOR';

/** spec §16: >= target auto-approves; [floor, target) needs admin approval; < floor is blocked. */
export function classifyRate(i: { requestedRate: Paise; floorRate: Paise; targetRate: Paise }): RateClass {
  if (i.requestedRate >= i.targetRate) return 'AUTO';
  if (i.requestedRate >= i.floorRate) return 'NEEDS_APPROVAL';
  return 'BELOW_FLOOR';
}

export interface QuoteLineInput {
  qty: number;
  requestedRate: Paise; // GST-inclusive, per unit
  discount: Paise;       // absolute, line-level
  schemeBenefit: Paise;  // absolute, line-level
  gstPct: number;
}

export interface QuoteLineResult {
  gross: Paise;        // qty * requestedRate
  netAmount: Paise;    // max(0, gross - discount - schemeBenefit)
  taxableValue: Paise; // netAmount backed out of GST (prices_gst_inclusive = true)
  gstAmount: Paise;    // netAmount - taxableValue
}

export function computeQuoteLine(i: QuoteLineInput): QuoteLineResult {
  const gross = i.qty * i.requestedRate;
  const netAmount = Math.max(0, gross - i.discount - i.schemeBenefit);
  const taxableValue = Math.round(netAmount / (1 + i.gstPct / 100));
  return { gross, netAmount, taxableValue, gstAmount: netAmount - taxableValue };
}

export interface QuoteTotals {
  gross: Paise; discountTotal: Paise; schemeTotal: Paise;
  netTotal: Paise; taxableTotal: Paise; gstTotal: Paise;
}

export function quoteTotals(lines: (QuoteLineInput & QuoteLineResult)[]): QuoteTotals {
  const sum = (f: (l: QuoteLineInput & QuoteLineResult) => number) => lines.reduce((a, l) => a + f(l), 0);
  return {
    gross: sum((l) => l.gross),
    discountTotal: sum((l) => l.discount),
    schemeTotal: sum((l) => l.schemeBenefit),
    netTotal: sum((l) => l.netAmount),
    taxableTotal: sum((l) => l.taxableValue),
    gstTotal: sum((l) => l.gstAmount),
  };
}
