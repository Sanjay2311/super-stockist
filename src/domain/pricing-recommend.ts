import type { Paise } from './money';

export interface PricingBands {
  ssMinMarginPct: number;
  ssNormalMarginPct: number;
  ssTargetMarginPct: number;
  distributorMarginPct: number;
  retailerMarginPct: number;
  volatileFloorBufferPct: number;
}

export interface RecommendInput {
  ssBillingPrice: Paise;
  mrp: Paise | null;
  gstPct: number;
  volatile: boolean;
  bands: PricingBands;
}

export interface RecommendResult {
  floorPrice: Paise;
  distributorPrice: Paise;
  targetPrice: Paise;
  retailerPrice: Paise;
  mrpSuggestion: Paise | null;
  rationale: { field: string; valuePaise: Paise | null; why: string }[];
  marginAtEach: { floorPct: number; distributorPct: number; targetPct: number };
}

const markup = (base: Paise, pct: number): Paise => Math.round(base * (1 + pct / 100));
const rupees = (p: Paise) => `₹${(p / 100).toFixed(2)}`;
const marginPct = (price: Paise, cost: Paise) => (cost === 0 ? 0 : ((price - cost) / cost) * 100);

export function recommendPricing(input: RecommendInput): RecommendResult {
  const { ssBillingPrice: cost, mrp, volatile, bands } = input;
  const floorPct = volatile ? bands.volatileFloorBufferPct : bands.ssMinMarginPct;

  const floorPrice = markup(cost, floorPct);
  const distributorPrice = markup(cost, bands.ssNormalMarginPct);
  const targetPrice = markup(cost, bands.ssTargetMarginPct);
  const retailerPrice = markup(distributorPrice, bands.distributorMarginPct);
  const mrpSuggestion = mrp == null ? markup(retailerPrice, bands.retailerMarginPct) : null;

  const distGrossPaise = distributorPrice - cost;
  const rationale: RecommendResult['rationale'] = [
    {
      field: 'floorPrice',
      valuePaise: floorPrice,
      why: volatile
        ? `cost + ${floorPct}% volatile-commodity buffer; below this needs admin override`
        : `cost + ${floorPct}% minimum super-stockist margin; below this needs admin override`,
    },
    {
      field: 'distributorPrice',
      valuePaise: distributorPrice,
      why: `cost + ${bands.ssNormalMarginPct}%; your gross ${rupees(distGrossPaise)}/unit (${marginPct(distributorPrice, cost).toFixed(1)}%)`,
    },
    {
      field: 'targetPrice',
      valuePaise: targetPrice,
      why: `cost + ${bands.ssTargetMarginPct}%, your standard margin goal`,
    },
    {
      field: 'retailerPrice',
      valuePaise: retailerPrice,
      why:
        mrp != null
          ? `distributor + ${bands.distributorMarginPct}% distributor margin; retailer then earns ${(((mrp - retailerPrice) / retailerPrice) * 100).toFixed(0)}% to MRP ${rupees(mrp)}`
          : `distributor + ${bands.distributorMarginPct}% distributor margin; MRP suggested at ${rupees(mrpSuggestion as Paise)}`,
    },
  ];

  if (mrp != null) {
    const retailerToMrpPct = ((mrp - retailerPrice) / retailerPrice) * 100;
    if (retailerToMrpPct < bands.retailerMarginPct) {
      rationale.push({
        field: 'mrpCheck',
        valuePaise: mrp,
        why: `MRP ${rupees(mrp)} only supports ${retailerToMrpPct.toFixed(0)}% retailer margin at this distributor price — below the ${bands.retailerMarginPct}% target`,
      });
    }
  }

  return {
    floorPrice,
    distributorPrice,
    targetPrice,
    retailerPrice,
    mrpSuggestion,
    rationale,
    marginAtEach: {
      floorPct: marginPct(floorPrice, cost),
      distributorPct: marginPct(distributorPrice, cost),
      targetPct: marginPct(targetPrice, cost),
    },
  };
}
