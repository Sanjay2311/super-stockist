import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { appConfig } from '@/server/db/schema/config';
import type { LeadStage } from '@/domain/pipeline';
import type { PricingBands } from '@/domain/pricing-recommend';

export const CONFIG_DEFAULTS = {
  scoreWeights: {
    retailerNetwork: 20, categoryExperience: 15, geoCoverage: 15, salesmen: 10,
    deliveryInfra: 10, workingCapital: 10, brandPortfolio: 10, reputation: 5, willingness: 5,
  },
  stageProbability: {
    IDENTIFIED: 5, CONTACTED: 10, QUALIFIED: 20, MEETING_SCHEDULED: 30,
    PRESENTATION_DONE: 40, COMMERCIAL_DISCUSSION: 50, NEGOTIATION: 60, APPROVED: 80,
    APPOINTED: 90, FIRST_ORDER: 95, ACTIVATED: 98, REPEAT_ORDER: 100, LOST: 0, ON_HOLD: 10,
  },
  hotLeadProbabilityThreshold: 60,
  staleQuotationDays: 5,
  reorderCadenceDays: 21,
  pricingBands: {
    ssMinMarginPct: 8, ssNormalMarginPct: 12, ssTargetMarginPct: 18,
    // ponytail: spec §5.3 parenthetical said "e.g. 12%" but 12 == ssNormalMarginPct
    // collapses the volatile floor onto the distributor price (no headroom below it).
    distributorMarginPct: 15, retailerMarginPct: 25, volatileFloorBufferPct: 10,
  },
  pricingBandsByCategory: {} as Record<string, Partial<PricingBands>>,
  pricesGstInclusive: true,
  priceApprovalRequired: true,
} satisfies {
  scoreWeights: Record<string, number>;
  stageProbability: Record<LeadStage, number>;
  hotLeadProbabilityThreshold: number;
  staleQuotationDays: number;
  reorderCadenceDays: number;
  pricingBands: PricingBands;
  pricingBandsByCategory: Record<string, Partial<PricingBands>>;
  pricesGstInclusive: boolean;
  priceApprovalRequired: boolean;
};

export type ConfigShape = typeof CONFIG_DEFAULTS;
export type ConfigKey = keyof ConfigShape;

export async function getConfig<K extends ConfigKey>(orgId: string, key: K): Promise<ConfigShape[K]> {
  const [row] = await db.select().from(appConfig)
    .where(and(eq(appConfig.orgId, orgId), eq(appConfig.key, key)));
  return (row?.value as ConfigShape[K]) ?? CONFIG_DEFAULTS[key];
}

export async function setConfig<K extends ConfigKey>(orgId: string, key: K, value: ConfigShape[K]): Promise<void> {
  await db.insert(appConfig).values({ orgId, key, value })
    .onConflictDoUpdate({ target: [appConfig.orgId, appConfig.key], set: { value, updatedAt: new Date() } });
}

export async function bandsForCategory(orgId: string, categoryName: string | null): Promise<PricingBands> {
  const base = await getConfig(orgId, 'pricingBands');
  if (!categoryName) return base;
  const overrides = await getConfig(orgId, 'pricingBandsByCategory');
  return { ...base, ...(overrides[categoryName] ?? {}) };
}
