import { and, eq } from 'drizzle-orm';
import { db } from './client';
import { orgs, brands } from './schema/identity';
import { territories } from './schema/territory';
import { distributorLeads, activities, tasks } from './schema/crm';
import { scoreDistributor, type ScoreInputs, type ScoreWeights } from '@/domain/scoring';
import { CONFIG_DEFAULTS } from '@/server/services/config';
import { stageRank, type LeadStage } from '@/domain/pipeline';
import { rupees } from '@/domain/money';
import { seedCatalogue } from './seed-catalogue';

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

// ── demo data ────────────────────────────────────────────────────────────────
// ponytail: a fixed, reviewable array of ~20 lead seeds — no faker dependency,
// no configurable seed size. Everything created here carries `isDemo: true` so
// `purgeDemo()` can remove it wholesale.

const AREAS = [
  'Whitefield', 'Mahadevapura', 'KR Puram', 'Marathahalli', 'Hoodi', 'Brookefield',
  'Varthur', 'Kadugodi', 'ITPL', 'Indiranagar', 'Domlur', 'Bellandur',
];

const day = 24 * 60 * 60 * 1000;
const daysFromNow = (n: number) => new Date(Date.now() + n * day);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

const tier = (v: number): ScoreInputs => ({
  retailerNetwork: v, categoryExperience: v, geoCoverage: v, salesmen: v,
  deliveryInfra: v, workingCapital: v, brandPortfolio: v, reputation: v, willingness: v,
});
const SI: Record<string, ScoreInputs> = {
  strong: tier(0.9), good: tier(0.72), mid: tier(0.55), weak: tier(0.34),
};

type LeadSeed = {
  businessName: string; contact: string; area: number;
  stage: LeadStage; si: keyof typeof SI; ffLakh: number; fu: number | null;
};

// area = index into AREAS; ffLakh = expected F&F monthly potential in ₹ lakh;
// fu = next-follow-up offset in days from now (null = none).
const LEADS: LeadSeed[] = [
  { businessName: 'Sri Balaji Distributors', contact: 'R. Kumar', area: 0, stage: 'IDENTIFIED', si: 'mid', ffLakh: 2.0, fu: null },
  { businessName: 'Green Valley Traders', contact: 'S. Reddy', area: 1, stage: 'IDENTIFIED', si: 'weak', ffLakh: 1.5, fu: -5 },
  { businessName: 'Annapurna Agencies', contact: 'M. Nair', area: 2, stage: 'IDENTIFIED', si: 'good', ffLakh: 3.0, fu: 3 },
  { businessName: 'Sri Venkateshwara Enterprises', contact: 'P. Rao', area: 3, stage: 'CONTACTED', si: 'mid', ffLakh: 2.5, fu: -2 },
  { businessName: 'Kaveri Marketing', contact: 'A. Shetty', area: 4, stage: 'CONTACTED', si: 'good', ffLakh: 3.5, fu: 1 },
  { businessName: 'Deccan Trading Co', contact: 'V. Gowda', area: 5, stage: 'QUALIFIED', si: 'good', ffLakh: 4.0, fu: 0 },
  { businessName: 'Lakshmi Sales Corporation', contact: 'K. Iyer', area: 6, stage: 'QUALIFIED', si: 'strong', ffLakh: 5.0, fu: 6 },
  { businessName: 'New Bharat Distributors', contact: 'H. Jain', area: 7, stage: 'MEETING_SCHEDULED', si: 'good', ffLakh: 3.5, fu: -1 },
  { businessName: 'Sunrise Wholesale', contact: 'T. Menon', area: 8, stage: 'MEETING_SCHEDULED', si: 'strong', ffLakh: 5.5, fu: 2 },
  { businessName: 'Krishna Agencies', contact: 'B. Hegde', area: 9, stage: 'PRESENTATION_DONE', si: 'good', ffLakh: 4.0, fu: 0 },
  { businessName: 'Metro Provisions Distributors', contact: 'D. Pai', area: 10, stage: 'PRESENTATION_DONE', si: 'strong', ffLakh: 6.0, fu: 4 },
  { businessName: 'Sai Ganesh Traders', contact: 'N. Bhat', area: 11, stage: 'COMMERCIAL_DISCUSSION', si: 'good', ffLakh: 4.5, fu: null },
  { businessName: 'Royal Foods Distribution', contact: 'G. Kamath', area: 0, stage: 'COMMERCIAL_DISCUSSION', si: 'strong', ffLakh: 5.5, fu: 5 },
  { businessName: 'Vijaya Marketing Agencies', contact: 'L. Prasad', area: 1, stage: 'NEGOTIATION', si: 'strong', ffLakh: 6.0, fu: -3 },
  { businessName: 'Nandi Enterprises', contact: 'C. Murthy', area: 2, stage: 'NEGOTIATION', si: 'good', ffLakh: 4.5, fu: 1 },
  { businessName: 'Prime Retail Distributors', contact: 'J. Acharya', area: 3, stage: 'APPROVED', si: 'strong', ffLakh: 5.5, fu: 2 },
  { businessName: 'Ashirwad Agencies', contact: 'F. Kulkarni', area: 4, stage: 'APPOINTED', si: 'strong', ffLakh: 6.0, fu: 0 },
  { businessName: 'Coastal Trading Company', contact: 'W. Salian', area: 5, stage: 'FIRST_ORDER', si: 'strong', ffLakh: 5.0, fu: 7 },
  { businessName: 'MG Road Distributors', contact: 'E. Rai', area: 6, stage: 'LOST', si: 'mid', ffLakh: 3.0, fu: null },
  { businessName: 'Bangalore Fresh Distributors', contact: 'O. Shenoy', area: 7, stage: 'ON_HOLD', si: 'good', ffLakh: 4.0, fu: null },
];

type TaskSeed = { leadIdx: number; title: string; type: string; priority: string; due: number };
const TASKS: TaskSeed[] = [
  { leadIdx: 3, title: 'Chase intro call — no response yet', type: 'CALL', priority: 'CRITICAL', due: -3 },
  { leadIdx: 5, title: 'Send category turnover questionnaire', type: 'FOLLOW_UP', priority: 'HIGH', due: -1 },
  { leadIdx: 7, title: 'Confirm meeting slot for warehouse visit', type: 'MEETING', priority: 'HIGH', due: 0 },
  { leadIdx: 9, title: 'Share margin structure deck', type: 'QUOTATION_CHASE', priority: 'NORMAL', due: 0 },
  { leadIdx: 11, title: 'Follow up on credit terms counter', type: 'FOLLOW_UP', priority: 'NORMAL', due: 1 },
  { leadIdx: 13, title: 'Negotiation round 2 — MOQ', type: 'MEETING', priority: 'HIGH', due: 2 },
  { leadIdx: 16, title: 'Collect appointment paperwork', type: 'FOLLOW_UP', priority: 'LOW', due: 5 },
  { leadIdx: 17, title: 'First-order fulfilment check-in', type: 'CALL', priority: 'LOW', due: 7 },
];

const WEIGHTS = CONFIG_DEFAULTS.scoreWeights as ScoreWeights;

/** Has this org any demo data loaded? */
export async function hasDemoData(orgId: string): Promise<boolean> {
  const [row] = await db.select({ id: distributorLeads.id }).from(distributorLeads)
    .where(and(eq(distributorLeads.orgId, orgId), eq(distributorLeads.isDemo, true))).limit(1);
  return !!row;
}

/**
 * Seed a realistic demo dataset (territories, ~20 leads, activities, tasks) for
 * the first org. Idempotent-ish: skips if demo leads are already present.
 */
export async function seedDemo(): Promise<void> {
  const [org] = await db.select().from(orgs);
  if (!org) throw new Error('seedDemo: no org — run seedBase() first');
  if (await hasDemoData(org.id)) {
    console.log('seedDemo: demo data already present — skipping');
    return;
  }
  const orgId = org.id;

  const [zone] = await db.insert(territories)
    .values({ orgId, name: 'Bangalore East', type: 'ZONE', parentId: null, isDemo: true })
    .returning();
  const areaRows = await db.insert(territories).values(
    AREAS.map((name) => ({ orgId, name, type: 'AREA', parentId: zone.id, isDemo: true })),
  ).returning();

  const leadRows = await db.insert(distributorLeads).values(
    LEADS.map((l, i) => {
      const inputs = SI[l.si];
      const { score, grade } = scoreDistributor(inputs, WEIGHTS);
      return {
        orgId,
        businessName: l.businessName,
        contactPerson: l.contact,
        phone: `9845${String(10000 + i).padStart(6, '0')}`, // valid 10-digit /^[6-9]\d{9}$/ → 9845010000…
        email: null,
        address: `${AREAS[l.area]}, Bangalore East`,
        territoryId: areaRows[l.area].id,
        location: AREAS[l.area],
        expectedFfMonthlyPotential: rupees(l.ffLakh * 100_000),
        scoreInputs: inputs,
        score,
        grade,
        stage: l.stage,
        probability: CONFIG_DEFAULTS.stageProbability[l.stage],
        nextFollowUpAt: l.fu === null ? null : daysFromNow(l.fu),
        lostReason: l.stage === 'LOST' ? 'EXISTING_COMPETITOR' : null,
        lostNotes: l.stage === 'LOST' ? 'Already carries two competing edible-oil brands; no shelf space.' : null,
        onHoldReason: l.stage === 'ON_HOLD' ? 'Awaiting new godown lease before appointment.' : null,
        isDemo: true,
      };
    }),
  ).returning();

  const activityRows: (typeof activities.$inferInsert)[] = [];
  leadRows.forEach((lead, i) => {
    const rank = stageRank(LEADS[i].stage);
    activityRows.push({
      orgId, leadId: lead.id, type: 'CALL', occurredAt: daysFromNow(-12),
      notes: 'Intro call — confirmed interest, gathered basic profile.', outcome: 'Positive', isDemo: true,
    });
    if (rank >= stageRank('QUALIFIED')) {
      activityRows.push({
        orgId, leadId: lead.id, type: 'MEETING', occurredAt: daysFromNow(-8),
        notes: 'Warehouse + retail-network walkthrough.', outcome: 'Qualified', isDemo: true,
      });
    }
    if (rank >= stageRank('PRESENTATION_DONE')) {
      activityRows.push({
        orgId, leadId: lead.id, type: 'PRESENTATION', occurredAt: daysFromNow(-5),
        notes: 'Presented F&F range, margins and launch plan.', outcome: 'Interested', isDemo: true,
      });
    }
    if (rank >= stageRank('NEGOTIATION')) {
      activityRows.push({
        orgId, leadId: lead.id, type: 'NEGOTIATION', occurredAt: daysFromNow(-2),
        notes: 'Discussed MOQ, credit period and primary target.', outcome: 'In progress', isDemo: true,
      });
    }
  });
  await db.insert(activities).values(activityRows);

  await db.insert(tasks).values(
    TASKS.map((t) => ({
      orgId,
      title: t.title,
      type: t.type,
      leadId: leadRows[t.leadIdx].id,
      priority: t.priority,
      dueDate: ymd(daysFromNow(t.due)),
      source: 'MANUAL',
      isDemo: true,
    })),
  );

  console.log(
    `seedDemo: ${1 + areaRows.length} territories, ${leadRows.length} leads, ` +
    `${activityRows.length} activities, ${TASKS.length} tasks`,
  );
}

/** Delete this org's `is_demo` rows (activities → tasks → leads → territories). */
export async function purgeDemo(orgId: string): Promise<void> {
  await db.delete(activities).where(and(eq(activities.orgId, orgId), eq(activities.isDemo, true)));
  await db.delete(tasks).where(and(eq(tasks.orgId, orgId), eq(tasks.isDemo, true)));
  await db.delete(distributorLeads).where(and(eq(distributorLeads.orgId, orgId), eq(distributorLeads.isDemo, true)));
  await db.delete(territories).where(and(eq(territories.orgId, orgId), eq(territories.isDemo, true)));
  console.log('purgeDemo: demo rows removed');
}

if (process.argv[1]?.endsWith('seed.ts')) {
  const purge = process.argv.includes('--purge');
  const run = purge
    ? seedBase().then(({ orgId }) => purgeDemo(orgId))
    : seedBase().then(async ({ orgId }) => { await seedDemo(); await seedCatalogue(orgId); });
  run
    .then(() => { console.log(purge ? 'purge done' : 'seed done'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
