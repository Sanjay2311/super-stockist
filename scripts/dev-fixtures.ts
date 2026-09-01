import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { users, employees } from '@/server/db/schema/identity';
import { seedBase } from '@/server/db/seed';
import { seedCatalogue } from '@/server/db/seed-catalogue';
import { createTerritory } from '@/server/services/territory';
import { createLead, rescoreLead } from '@/server/services/lead';
import { addActivity } from '@/server/services/activity';
import { distributorLeads } from '@/server/db/schema/crm';
import { CONFIG_DEFAULTS } from '@/server/services/config';
import { rupees } from '@/domain/money';
import type { AppUser } from '@/server/auth/session';
import type { LeadStage } from '@/domain/pipeline';

// Local-only convenience seed so `npm run dev` (with DEV_LOGIN_EMAIL=dev@local) shows a
// populated app before Supabase is connected. Idempotent-ish: skips if dev@local exists.
async function main() {
  const { orgId } = await seedBase();

  const [existing] = await db.select().from(users).where(eq(users.email, 'dev@local'));
  if (existing) {
    console.log('dev-seed: dev@local already present — nothing to do');
    process.exit(0);
  }

  const [emp] = await db.insert(employees)
    .values({ orgId, name: 'Dev Owner', phone: '9000000000' }).returning();
  const [owner] = await db.insert(users).values({
    id: randomUUID(), orgId, email: 'dev@local', name: 'Dev Owner',
    role: 'OWNER', status: 'active', employeeId: emp.id,
  }).returning();

  const u: AppUser = {
    id: owner.id, email: owner.email, name: owner.name,
    role: 'OWNER', employeeId: emp.id, orgId,
  };

  const east = await createTerritory(u, { name: 'Bangalore East', type: 'ZONE', parentId: null });
  for (const name of ['Whitefield', 'Marathahalli', 'KR Puram', 'Hoodi', 'Bellandur']) {
    await createTerritory(u, { name, type: 'AREA', parentId: east.id });
  }

  const leads: Array<{ name: string; contact: string; phone: string; potential: number; stage: LeadStage; score: number }> = [
    { name: 'Sri Balaji Distributors', contact: 'Ramesh', phone: '9811111111', potential: 450000, stage: 'NEGOTIATION', score: 0.85 },
    { name: 'Green Valley Traders', contact: 'Anil', phone: '9822222222', potential: 300000, stage: 'MEETING_SCHEDULED', score: 0.7 },
    { name: 'Metro Foods Agency', contact: 'Sunil', phone: '9833333333', potential: 600000, stage: 'PRESENTATION_DONE', score: 0.78 },
    { name: 'Nandini Provisions', contact: 'Kavya', phone: '9844444444', potential: 180000, stage: 'CONTACTED', score: 0.55 },
    { name: 'City Wholesale Mart', contact: 'Imran', phone: '9855555555', potential: 250000, stage: 'QUALIFIED', score: 0.62 },
    { name: 'Sunrise Enterprises', contact: 'Deepak', phone: '9866666666', potential: 120000, stage: 'IDENTIFIED', score: 0.4 },
  ];

  const SCORE_KEYS = ['retailerNetwork', 'categoryExperience', 'geoCoverage', 'salesmen', 'deliveryInfra', 'workingCapital', 'brandPortfolio', 'reputation', 'willingness'] as const;

  const DAY = 86_400_000;
  let idx = 0;
  for (const l of leads) {
    const lead = await createLead(u, {
      businessName: l.name, contactPerson: l.contact, phone: l.phone,
      expectedFfMonthlyPotential: rupees(l.potential), territoryId: east.id,
      assignedEmployeeId: emp.id,
    });
    await rescoreLead(u, lead.id, Object.fromEntries(SCORE_KEYS.map((k) => [k, l.score])));
    if (l.stage !== 'IDENTIFIED') {
      // setStage() lands in Task 13; until then set stage + probability directly.
      await db.update(distributorLeads)
        .set({ stage: l.stage, probability: CONFIG_DEFAULTS.stageProbability[l.stage] })
        .where(eq(distributorLeads.id, lead.id));
    }
    // Spread follow-ups across overdue / today / next-7 so the Today screen has content.
    const offsets = [-2, -1, 0, 3, 6];
    if (idx < offsets.length) {
      await addActivity(u, {
        leadId: lead.id, type: 'CALL', outcome: 'Discussed terms',
        nextFollowUpAt: new Date(Date.now() + offsets[idx] * DAY),
      });
    }
    idx += 1;
  }

  // Real F&F catalogue (184 SKUs) so `npm run dev` shows a populated Products screen.
  // Idempotent: bails to {0,0} once the org already has the catalogue.
  const cat = await seedCatalogue(orgId);

  console.log(`dev-seed: created dev@local (OWNER), 6 territories, 6 leads (5 with follow-ups), catalogue ${JSON.stringify(cat)}. Set DEV_LOGIN_EMAIL=dev@local and run \`npm run dev\`.`);
  process.exit(0);
}

main();
