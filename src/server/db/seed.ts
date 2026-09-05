import { and, eq, inArray } from 'drizzle-orm';
import { db } from './client';
import { orgs, brands } from './schema/identity';
import { territories } from './schema/territory';
import { distributorLeads, activities, tasks } from './schema/crm';
import { distributors } from './schema/distributor';
import { schemes, schemeApplications } from './schema/scheme';
import { quotations, quotationItems, priceApprovals } from './schema/quotation';
import { categories, products, productPrices } from './schema/product';
import { notifications } from './schema/notification';
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

  // ── M2b demo: distributors, schemes, one quotation ──────────────────────────
  // Requires the catalogue (categories / products / product_prices) to already
  // be seeded — the CLI runs seedCatalogue() ahead of seedDemo(). Every row here
  // carries `isDemo: true` so purgeDemo() removes it. Rows are inserted directly
  // with the Drizzle client (no service calls — there is no AppUser here).

  // two distributors converted from the appointed / first-order demo leads
  const ashirwad = leadRows[16]; // APPOINTED
  const coastal = leadRows[17];  // FIRST_ORDER
  const distRows = await db.insert(distributors).values([
    {
      orgId, businessName: ashirwad.businessName, contactPerson: ashirwad.contactPerson,
      phone: ashirwad.phone, address: ashirwad.address, territoryId: ashirwad.territoryId,
      exclusive: true, assignedEmployeeId: ashirwad.assignedEmployeeId, appointmentDate: ymd(daysFromNow(-20)),
      status: 'ACTIVE', grade: ashirwad.grade, creditLimit: rupees(2_00_000), creditDays: 21,
      paymentTerms: '50% advance, balance on delivery', expectedMonthlyPurchase: rupees(6_00_000),
      sourceLeadId: ashirwad.id, isDemo: true,
    },
    {
      orgId, businessName: coastal.businessName, contactPerson: coastal.contactPerson,
      phone: coastal.phone, address: coastal.address, territoryId: coastal.territoryId,
      exclusive: false, assignedEmployeeId: coastal.assignedEmployeeId, appointmentDate: ymd(daysFromNow(-10)),
      status: 'ACTIVE', grade: coastal.grade, creditLimit: rupees(1_50_000), creditDays: 15,
      paymentTerms: 'Net 15', expectedMonthlyPurchase: rupees(5_00_000),
      sourceLeadId: coastal.id, isDemo: true,
    },
  ]).returning();
  await db.update(distributorLeads).set({ convertedDistributorId: distRows[0].id }).where(eq(distributorLeads.id, ashirwad.id));
  await db.update(distributorLeads).set({ convertedDistributorId: distRows[1].id }).where(eq(distributorLeads.id, coastal.id));

  // two schemes: a CATEGORY-scoped flat 3% on Dry Fruits, an ALL-scoped qty scheme
  let schemeCount = 0;
  const [dryFruits] = await db.select().from(categories)
    .where(and(eq(categories.orgId, orgId), eq(categories.name, 'Dry Fruits')));
  if (dryFruits) {
    await db.insert(schemes).values([
      {
        orgId, name: 'September Dry Fruits 3%', type: 'FLAT_DISCOUNT', scopeType: 'CATEGORY', scopeId: dryFruits.id,
        startDate: ymd(daysFromNow(-10)), endDate: ymd(daysFromNow(30)),
        benefit: { kind: 'PCT', value: 3 }, eligibility: {}, active: true, isDemo: true,
      },
      {
        orgId, name: 'Bulk 50+ units ₹5/unit', type: 'QTY_SCHEME', scopeType: 'ALL', scopeId: null,
        startDate: ymd(daysFromNow(-30)), endDate: ymd(daysFromNow(60)), minQty: 50,
        benefit: { kind: 'PER_UNIT', value: rupees(5) }, eligibility: {}, active: true, isDemo: true,
      },
    ]);
    schemeCount = 2;
  }

  // one DRAFT quotation for the Coastal distributor: one AUTO line, one below-target line
  let quotationCount = 0;
  const priced = await db.select({ p: products, pr: productPrices }).from(products)
    .innerJoin(productPrices, eq(productPrices.productId, products.id))
    .where(eq(products.orgId, orgId)).limit(2);
  if (priced.length === 2) {
    const now = new Date();
    const [qd] = await db.insert(quotations).values({
      orgId, quoteNo: `Q-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-001`,
      distributorId: distRows[1].id, quoteDate: ymd(now), validUntil: ymd(daysFromNow(7)),
      status: 'DRAFT', isDemo: true,
    }).returning();
    await db.insert(quotationItems).values([
      {
        orgId, quotationId: qd.id, productId: priced[0].p.id, qty: 20,
        requestedRate: priced[0].pr.targetPrice, listRate: priced[0].pr.distributorPrice,
        floorRate: priced[0].pr.floorPrice, targetRate: priced[0].pr.targetPrice,
        gstPct: priced[0].p.gstPct, netAmount: 20 * priced[0].pr.targetPrice, approvalStatus: 'AUTO',
      },
      {
        orgId, quotationId: qd.id, productId: priced[1].p.id, qty: 10,
        requestedRate: priced[1].pr.floorPrice + 1, listRate: priced[1].pr.distributorPrice,
        floorRate: priced[1].pr.floorPrice, targetRate: priced[1].pr.targetPrice,
        gstPct: priced[1].p.gstPct, netAmount: 10 * (priced[1].pr.floorPrice + 1), approvalStatus: 'PENDING',
      },
    ]);
    quotationCount = 1;
  }

  console.log(
    `seedDemo: ${1 + areaRows.length} territories, ${leadRows.length} leads, ` +
    `${activityRows.length} activities, ${TASKS.length} tasks, ` +
    `${distRows.length} distributors, ${schemeCount} schemes, ${quotationCount} quotation`,
  );
}

/**
 * Delete this org's `is_demo` rows (M2b quotations/schemes/distributors, then
 * activities → tasks → leads → territories).
 */
export async function purgeDemo(orgId: string): Promise<void> {
  await db.delete(activities).where(and(eq(activities.orgId, orgId), eq(activities.isDemo, true)));
  await db.delete(tasks).where(and(eq(tasks.orgId, orgId), eq(tasks.isDemo, true)));
  await db.delete(distributorLeads).where(and(eq(distributorLeads.orgId, orgId), eq(distributorLeads.isDemo, true)));

  // M2b demo rows. price_approvals / quotation_items FK their parents, so child-first.
  const demoQuotes = await db.select({ id: quotations.id }).from(quotations)
    .where(and(eq(quotations.orgId, orgId), eq(quotations.isDemo, true)));
  const demoQuoteIds = demoQuotes.map((q) => q.id);
  if (demoQuoteIds.length) {
    const demoItems = await db.select({ id: quotationItems.id }).from(quotationItems)
      .where(inArray(quotationItems.quotationId, demoQuoteIds));
    const itemIds = demoItems.map((i) => i.id);
    if (itemIds.length) {
      await db.delete(priceApprovals).where(inArray(priceApprovals.quotationItemId, itemIds));
      await db.delete(schemeApplications).where(inArray(schemeApplications.quotationItemId, itemIds));
      await db.delete(quotationItems).where(inArray(quotationItems.quotationId, demoQuoteIds));
    }
    await db.delete(quotations).where(inArray(quotations.id, demoQuoteIds));
  }
  // Only scheme_applications on DEMO schemes — a blanket org-wide delete would
  // also strip applications on genuine non-demo quotations that still carry
  // schemeId/schemeBenefit, diverging §4.6's scheme-cost feed (#7).
  const demoSchemeIds = (await db.select({ id: schemes.id }).from(schemes)
    .where(and(eq(schemes.orgId, orgId), eq(schemes.isDemo, true)))).map((s) => s.id);
  if (demoSchemeIds.length) {
    await db.delete(schemeApplications).where(inArray(schemeApplications.schemeId, demoSchemeIds));
  }
  await db.delete(schemes).where(and(eq(schemes.orgId, orgId), eq(schemes.isDemo, true)));
  await db.delete(distributors).where(and(eq(distributors.orgId, orgId), eq(distributors.isDemo, true)));

  await db.delete(territories).where(and(eq(territories.orgId, orgId), eq(territories.isDemo, true)));

  // Notifications carry no `isDemo` flag — they're a derived/regenerable read model
  // rebuilt by `runAlertScan`, not source-of-truth data, so wiping every row for this
  // org is safe and matches how purge already resets other derived state. Without
  // this, the bell could still show alerts deep-linking to now-deleted demo rows.
  await db.delete(notifications).where(eq(notifications.orgId, orgId));

  console.log('purgeDemo: demo rows removed');
}

if (process.argv[1]?.endsWith('seed.ts')) {
  const purge = process.argv.includes('--purge');
  const run = purge
    ? seedBase().then(({ orgId }) => purgeDemo(orgId))
    : seedBase().then(async ({ orgId }) => { await seedCatalogue(orgId); await seedDemo(); });
  run
    .then(() => { console.log(purge ? 'purge done' : 'seed done'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
