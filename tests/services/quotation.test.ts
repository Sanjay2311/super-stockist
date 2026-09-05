import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { categories, products, productPrices } from '@/server/db/schema/product';
import { distributors } from '@/server/db/schema/distributor';
import { priceApprovals, quotationItems } from '@/server/db/schema/quotation';
import { schemeApplications } from '@/server/db/schema/scheme';
import { auditLog } from '@/server/db/schema/audit';
import { users } from '@/server/db/schema/identity';
import {
  createQuotation, getQuotation, submitQuotation, decideApproval, listPendingApprovals,
  setQuotationStatus, redactQuotationItem, getQuotationHistory,
} from '@/server/services/quotation';
import { createScheme } from '@/server/services/scheme';
import type { AppUser } from '@/server/auth/session';

// users.id is a real `uuid` column (Supabase auth uid in production), so the synthetic
// owner id must be a valid uuid too -- only that lets getQuotationHistory's users join
// (and a `tests/services/quotation.test.ts`-local users-row insert) resolve correctly.
const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const owner = (orgId: string): AppUser => ({ id: OWNER_ID, email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });
const sales = (orgId: string): AppUser => ({ id: 'u-sales', email: 's', name: 'S', role: 'SALES', employeeId: null, orgId });

beforeAll(migrateTestDb);
beforeEach(resetDb);

async function seedProduct(orgId: string, over: Partial<typeof productPrices.$inferInsert> = {}) {
  const [cat] = await testDb.insert(categories).values({ orgId, name: 'Dry Fruits' }).returning();
  const [p] = await testDb.insert(products).values({
    orgId, categoryId: cat.id, skuCode: `DF-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Almond 100g', packLabel: '100g', gstPct: 12, mrp: 19300,
  }).returning();
  await testDb.insert(productPrices).values({
    orgId, productId: p.id, ssBillingPrice: 10700, distributorPrice: 11984,
    floorPrice: 11556, targetPrice: 12626, retailerPrice: 13782, mrp: 19300, ...over,
  });
  return { catId: cat.id, product: p };
}

async function seedDist(orgId: string) {
  const [d] = await testDb.insert(distributors).values({
    orgId, businessName: 'Coastal', contactPerson: 'W', phone: '9845000001', status: 'ACTIVE', grade: 'A',
  }).returning();
  return d;
}

describe('quotation service', () => {
  it('createQuotation snapshots rates, computes the line, and allocates a Q-YYYYMM-NNN number', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedProduct(orgId);
    const d = await seedDist(orgId);
    const q = await createQuotation(owner(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 10, requestedRate: 12800 }], // >= target -> AUTO
    });
    expect(q.quoteNo).toMatch(/^Q-\d{6}-\d{3}$/);
    const got = await getQuotation(orgId, q.id);
    expect(got!.items[0].listRate).toBe(11984);
    expect(got!.items[0].floorRate).toBe(11556);
    expect(got!.items[0].targetRate).toBe(12626);
    expect(got!.items[0].netAmount).toBe(128000);
    expect(got!.items[0].approvalStatus).toBe('AUTO');
  });

  it('OWNER submitting a [floor,target) rate self-approves; SALES submitting queues it PENDING', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedProduct(orgId);
    const d = await seedDist(orgId);

    const q1 = await createQuotation(owner(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 5, requestedRate: 12000 }],
    });
    await submitQuotation(owner(orgId), q1.id);
    const g1 = await getQuotation(orgId, q1.id);
    expect(g1!.quotation.status).toBe('SENT');
    expect(g1!.items[0].approvalStatus).toBe('APPROVED');
    const [a1] = await testDb.select().from(priceApprovals).where(eq(priceApprovals.quotationItemId, g1!.items[0].id));
    expect(a1.decision).toBe('APPROVED');
    // #5: the self-approve path must write a price_approval audit row
    const selfApproveAudit = await testDb.select().from(auditLog)
      .where(and(eq(auditLog.entityType, 'price_approval'), eq(auditLog.action, 'auto_approve')));
    expect(selfApproveAudit.length).toBe(1);

    const q2 = await createQuotation(sales(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 5, requestedRate: 12000 }],
    });
    await submitQuotation(sales(orgId), q2.id);
    const g2 = await getQuotation(orgId, q2.id);
    expect(g2!.items[0].approvalStatus).toBe('PENDING');
    expect((await listPendingApprovals(orgId)).length).toBe(1);
  });

  it('a below-floor rate is BLOCKED on submit; OWNER decideApproval APPROVE clears it', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedProduct(orgId);
    const d = await seedDist(orgId);
    const q = await createQuotation(sales(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 4, requestedRate: 11000 }], // < floor 11556
    });
    expect((await getQuotation(orgId, q.id))!.items[0].approvalStatus).toBe('BLOCKED');
    // #1: submit queues the approval row but refuses the SENT transition while BLOCKED
    await expect(submitQuotation(sales(orgId), q.id)).rejects.toThrow('PRICE_APPROVAL_REQUIRED');
    expect((await getQuotation(orgId, q.id))!.quotation.status).toBe('DRAFT');
    const pend = await listPendingApprovals(orgId);
    expect(pend.length).toBe(1);
    await expect(decideApproval(sales(orgId), pend[0].id, 'APPROVED')).rejects.toThrow('forbidden');
    await decideApproval(owner(orgId), pend[0].id, 'APPROVED', 'one-off to land the account');
    const [it] = await testDb.select().from(quotationItems).where(eq(quotationItems.id, pend[0].quotationItemId));
    expect(it.approvalStatus).toBe('APPROVED');
  });

  it('auto-applies an eligible FLAT_DISCOUNT scheme to the line and records a scheme_application', async () => {
    const { orgId } = await seedBase();
    const { catId, product } = await seedProduct(orgId);
    const d = await seedDist(orgId);
    await createScheme(owner(orgId), {
      name: 'DF 5%', type: 'FLAT_DISCOUNT', scopeType: 'CATEGORY', scopeId: catId,
      startDate: '2026-01-01', endDate: '2026-12-31', benefitKind: 'PCT', benefitValue: 5, eligibleGrades: [],
    });
    const q = await createQuotation(owner(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 10, requestedRate: 12800 }],
    });
    const got = await getQuotation(orgId, q.id);
    expect(got!.items[0].schemeBenefit).toBe(6400);                       // 5% of 128000
    expect(got!.items[0].netAmount).toBe(128000 - 6400);
  });

  it('redactQuotationItem strips floor/target for SALES, keeps them for OWNER', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedProduct(orgId);
    const d = await seedDist(orgId);
    const q = await createQuotation(owner(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 1, requestedRate: 12800 }],
    });
    const [item] = (await getQuotation(orgId, q.id))!.items;
    const s = redactQuotationItem(sales(orgId), item);
    expect(s).not.toHaveProperty('floorRate');
    expect(s).not.toHaveProperty('targetRate');
    expect(s).toHaveProperty('listRate');
    expect(redactQuotationItem(owner(orgId), item).floorRate).toBe(11556);
  });

  it('setQuotationStatus validates the enum and audits', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedProduct(orgId);
    const d = await seedDist(orgId);
    const q = await createQuotation(owner(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 1, requestedRate: 12800 }],
    });
    await expect(setQuotationStatus(owner(orgId), q.id, 'BOGUS')).rejects.toThrow();
    await setQuotationStatus(owner(orgId), q.id, 'ACCEPTED');
    const rows = await testDb.select().from(auditLog).where(and(eq(auditLog.entityType, 'quotation'), eq(auditLog.action, 'status')));
    expect(rows.length).toBe(1);
  });

  it('#1: SALES submitQuotation with a below-floor line is refused and the quote stays DRAFT', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedProduct(orgId);
    const d = await seedDist(orgId);
    const q = await createQuotation(sales(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 4, requestedRate: 11000 }], // < floor 11556 -> BLOCKED
    });
    await expect(submitQuotation(sales(orgId), q.id)).rejects.toThrow('PRICE_APPROVAL_REQUIRED');
    expect((await getQuotation(orgId, q.id))!.quotation.status).toBe('DRAFT');
  });

  it('#1: after OWNER approves the BLOCKED line, submitQuotation succeeds and the quote is SENT', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedProduct(orgId);
    const d = await seedDist(orgId);
    const q = await createQuotation(sales(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 4, requestedRate: 11000 }],
    });
    await expect(submitQuotation(sales(orgId), q.id)).rejects.toThrow('PRICE_APPROVAL_REQUIRED');
    const pend = await listPendingApprovals(orgId);
    await decideApproval(owner(orgId), pend[0].id, 'APPROVED', 'one-off');
    const row = await submitQuotation(sales(orgId), q.id);
    expect(row.status).toBe('SENT');
    expect((await getQuotation(orgId, q.id))!.quotation.status).toBe('SENT');
  });

  it('#1: setQuotationStatus ACCEPTED is refused while a line is still PENDING', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedProduct(orgId);
    const d = await seedDist(orgId);
    const q = await createQuotation(sales(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 5, requestedRate: 12000 }], // [floor,target) -> PENDING for SALES
    });
    expect((await getQuotation(orgId, q.id))!.items[0].approvalStatus).toBe('PENDING');
    await expect(setQuotationStatus(sales(orgId), q.id, 'ACCEPTED')).rejects.toThrow('UNAPPROVED_LINES');
  });

  it('#6: createQuotation with a non-existent distributorId is rejected as "party not found"', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedProduct(orgId);
    await expect(
      createQuotation(owner(orgId), {
        distributorId: '00000000-0000-4000-8000-000000000000', validUntil: '2026-12-31',
        items: [{ productId: product.id, qty: 1, requestedRate: 12800 }],
      }),
    ).rejects.toThrow('party not found');
  });

  it('#8: a two-item quote where only the 2nd line has an eligible scheme maps the scheme_application to that line', async () => {
    const { orgId } = await seedBase();
    const a = await seedProduct(orgId);
    const b = await seedProduct(orgId);
    const d = await seedDist(orgId);
    await createScheme(owner(orgId), {
      name: 'P2 5%', type: 'FLAT_DISCOUNT', scopeType: 'PRODUCT', scopeId: b.product.id,
      startDate: '2026-01-01', endDate: '2026-12-31', benefitKind: 'PCT', benefitValue: 5, eligibleGrades: [],
    });
    const q = await createQuotation(owner(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [
        { productId: a.product.id, qty: 10, requestedRate: 12800 },
        { productId: b.product.id, qty: 10, requestedRate: 12800 },
      ],
    });
    const got = await getQuotation(orgId, q.id);
    expect(got!.items.length).toBe(2);
    const itemA = got!.items.find((i) => i.productId === a.product.id)!;
    const itemB = got!.items.find((i) => i.productId === b.product.id)!;
    expect(itemA.schemeId).toBeNull();
    expect(itemA.schemeBenefit).toBe(0);
    expect(itemB.schemeId).not.toBeNull();
    expect(itemB.schemeBenefit).toBeGreaterThan(0);
    const apps = await testDb.select().from(schemeApplications).where(eq(schemeApplications.quotationId, q.id));
    expect(apps.length).toBe(1);
    expect(apps[0].quotationItemId).toBe(itemB.id);
  });

  it('getQuotationHistory returns the quotation + its approvals audit trail in order, with resolved names', async () => {
    const { orgId } = await seedBase();
    await testDb.insert(users).values({
      id: OWNER_ID, orgId, email: 'owner@example.com', name: 'O', role: 'OWNER', status: 'active',
    });
    const { product } = await seedProduct(orgId);
    const d = await seedDist(orgId);
    const q = await createQuotation(owner(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 5, requestedRate: 12000 }], // PENDING band
    });
    await submitQuotation(owner(orgId), q.id); // self-approves
    await setQuotationStatus(owner(orgId), q.id, 'ACCEPTED');

    const history = await getQuotationHistory(orgId, q.id);
    // submitQuotation writes the price_approval 'auto_approve' audit row INSIDE its
    // per-item loop, then the quotation 'submit' row AFTER the loop -- so chronological
    // order (ORDER BY createdAt ASC) is auto_approve before submit, not the reverse.
    expect(history.map((h) => h.action)).toEqual(['create', 'auto_approve', 'submit', 'status']);
    expect(history[0].userName).toBe('O'); // seeded owner() AppUser.name
  });
});
