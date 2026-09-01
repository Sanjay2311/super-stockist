import type { Paise } from './money';

export interface PricingInput {
  mrp: Paise | null;
  ssBillingPrice: Paise;
  sellingPrice: Paise;
  floorPrice: Paise;
  gstPct: number;
  gstInclusive: boolean;
  retailerPrice?: Paise | null;
  costInputs?: {
    freight?: Paise; loading?: Paise; salesIncentive?: Paise; samples?: Paise; other?: Paise; scheme?: Paise;
  };
}

export interface PricingResult {
  productCostPaise: Paise;
  grossMarginPaise: Paise;
  grossMarginPct: number;
  netContributionPaise: Paise;
  netContributionPct: number;
  maxPermissibleDiscountPaise: Paise;
  belowFloor: boolean;
  taxable: { sellingExGst: Paise; ssCostExGst: Paise };
  waterfall: { mrp: Paise | null; retailerPrice: Paise | null; distributorPrice: Paise; ssPrice: Paise; ssCost: Paise };
}

const pct = (part: number, whole: number) => (whole === 0 ? 0 : (part / whole) * 100);
const exGst = (amount: Paise, gstPct: number, inclusive: boolean) =>
  inclusive ? Math.round(amount / (1 + gstPct / 100)) : amount;

export function computePricing(input: PricingInput): PricingResult {
  const c = input.costInputs ?? {};
  const productCostPaise = input.ssBillingPrice;
  const grossMarginPaise = input.sellingPrice - productCostPaise;
  const variable =
    (c.freight ?? 0) + (c.scheme ?? 0) + (c.loading ?? 0) +
    (c.salesIncentive ?? 0) + (c.samples ?? 0) + (c.other ?? 0);
  const netContributionPaise = grossMarginPaise - variable;

  return {
    productCostPaise,
    grossMarginPaise,
    grossMarginPct: pct(grossMarginPaise, input.sellingPrice),
    netContributionPaise,
    netContributionPct: pct(netContributionPaise, input.sellingPrice),
    maxPermissibleDiscountPaise: Math.max(0, input.sellingPrice - input.floorPrice),
    belowFloor: input.sellingPrice < input.floorPrice,
    taxable: {
      sellingExGst: exGst(input.sellingPrice, input.gstPct, input.gstInclusive),
      ssCostExGst: exGst(input.ssBillingPrice, input.gstPct, input.gstInclusive),
    },
    waterfall: {
      mrp: input.mrp,
      retailerPrice: input.retailerPrice ?? null,
      distributorPrice: input.sellingPrice,
      ssPrice: input.ssBillingPrice,
      ssCost: productCostPaise,
    },
  };
}
