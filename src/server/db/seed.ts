import 'dotenv/config';
import { db } from './client';
import { orgs, brands } from './schema/identity';

const ORG_NAME = 'Bangalore East Super Stockist';
const BRAND_NAME = 'Farm & Farmers';

/** Idempotent base seed: one org + one brand. Safe to re-run. */
export async function seedBase(): Promise<{ orgId: string; brandId: string }> {
  let [org] = await db.select().from(orgs);
  if (!org) [org] = await db.insert(orgs).values({ name: ORG_NAME }).returning();

  let [brand] = await db.select().from(brands);
  if (!brand) {
    [brand] = await db.insert(brands)
      .values({ orgId: org.id, name: BRAND_NAME, billingState: 'Rajasthan' })
      .returning();
  }
  return { orgId: org.id, brandId: brand.id };
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seedBase().then((r) => { console.log('base seed done', r); process.exit(0); });
}
