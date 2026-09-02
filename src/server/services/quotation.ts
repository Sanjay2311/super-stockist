import { and, asc, count, desc, eq, getTableColumns, isNull, like } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { quotations, quotationItems, priceApprovals } from '@/server/db/schema/quotation';
import { schemeApplications } from '@/server/db/schema/scheme';
import { products } from '@/server/db/schema/product';
import { quotationSchema, QUOTATION_STATUSES } from '@/lib/schemas';
import { assertCan, stripFinancial } from '@/server/auth/permissions';
import { classifyRate, computeQuoteLine, type RateClass } from '@/domain/quote';
import { isSchemeEligible, schemeBenefitPaise } from '@/domain/scheme';
import { getProduct } from './product';
import { getDistributor } from './distributor';
import { activeSchemesFor, toSchemeDef } from './scheme';
import { getConfig } from './config';
import { writeAudit } from './audit';
import type { Paise } from '@/domain/money';
import type { AppUser } from '@/server/auth/session';

export type QuotationRow = typeof quotations.$inferSelect;
export type QuotationItemRow = typeof quotationItems.$inferSelect;
export type PriceApprovalRow = typeof priceApprovals.$inferSelect;

// Cost columns SALES must never see on a quotation-item read. floor/target are the
// admin price ladder; listRate (distributor price) stays visible to SALES.
export const QUOTATION_ITEM_FINANCIAL_FIELDS: (keyof QuotationItemRow)[] = ['floorRate', 'targetRate'];

export function redactQuotationItem(user: AppUser, row: QuotationItemRow): QuotationItemRow {
  return stripFinancial(user, row, QUOTATION_ITEM_FINANCIAL_FIELDS);
}
export function redactQuotationItems(user: AppUser, rows: QuotationItemRow[]): QuotationItemRow[] {
  return rows.map((r) => redactQuotationItem(user, r));
}

export interface NewQuoteItem {
  productId: string;
  qty: number;
  requestedRate: Paise;
  discount?: Paise;
}
export interface NewQuotation {
  leadId?: string | null;
  distributorId?: string | null;
  validUntil: string;
  notes?: string;
  items: NewQuoteItem[];
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

const APPROVAL_STATUS: Record<RateClass, 'AUTO' | 'PENDING' | 'BLOCKED'> = {
  AUTO: 'AUTO',
  NEEDS_APPROVAL: 'PENDING',
  BELOW_FLOOR: 'BLOCKED',
};

async function allocateQuoteNo(orgId: string, on: Date): Promise<string> {
  const ym = `${on.getFullYear()}${String(on.getMonth() + 1).padStart(2, '0')}`;
  const [{ n }] = await db.select({ n: count() }).from(quotations)
    .where(and(eq(quotations.orgId, orgId), like(quotations.quoteNo, `Q-${ym}-%`)));
  return `Q-${ym}-${String(n + 1).padStart(3, '0')}`;
}

export async function createQuotation(user: AppUser, input: NewQuotation): Promise<QuotationRow> {
  assertCan(user, 'quotation.create');
  const orgId = user.orgId;
  const f = quotationSchema.parse({
    leadId: input.leadId ?? undefined,
    distributorId: input.distributorId ?? undefined,
    validUntil: input.validUntil,
    notes: input.notes ?? '',
  });
  if (!input.items?.length) throw new Error('at least one item required');

  const today = new Date();
  const onDate = ymd(today);

  const distributorGrade = f.distributorId
    ? (await getDistributor(orgId, f.distributorId))?.grade ?? null
    : null;

  type Prepared = {
    productId: string; qty: number; requestedRate: Paise;
    listRate: Paise; floorRate: Paise; targetRate: Paise; gstPct: number;
    discount: Paise; schemeId: string | null; schemeBenefit: Paise; netAmount: Paise;
    approvalStatus: 'AUTO' | 'PENDING' | 'BLOCKED';
  };
  const prepared: Prepared[] = [];

  for (const item of input.items) {
    const full = await getProduct(orgId, item.productId);
    if (!full || !full.price) throw new Error('product not found');

    const listRate = full.price.distributorPrice;
    const floorRate = full.price.floorPrice;
    const targetRate = full.price.targetPrice;
    const gstPct = full.gstPct;
    const discount = item.discount ?? 0;
    const line = { qty: item.qty, requestedRate: item.requestedRate };

    const schemes = await activeSchemesFor(orgId, { onDate, productId: item.productId, categoryId: full.categoryId });
    const ctx = {
      onDate,
      productId: item.productId,
      categoryId: full.categoryId,
      qty: item.qty,
      lineValue: item.qty * item.requestedRate,
      distributorGrade,
    };
    const chosen = schemes.find((s) => {
      const def = toSchemeDef(s);
      return isSchemeEligible(def, ctx) && schemeBenefitPaise(def, line) > 0;
    });
    const schemeBenefit = chosen ? schemeBenefitPaise(toSchemeDef(chosen), line) : 0;

    const calc = computeQuoteLine({
      qty: item.qty,
      requestedRate: item.requestedRate,
      discount,
      schemeBenefit,
      gstPct,
    });

    const approvalStatus = APPROVAL_STATUS[classifyRate({ requestedRate: item.requestedRate, floorRate, targetRate })];

    prepared.push({
      productId: item.productId, qty: item.qty, requestedRate: item.requestedRate,
      listRate, floorRate, targetRate, gstPct,
      discount, schemeId: chosen?.id ?? null, schemeBenefit, netAmount: calc.netAmount,
      approvalStatus,
    });
  }

  const quoteNo = await allocateQuoteNo(orgId, today);
  const [quotation] = await db.insert(quotations).values({
    orgId,
    quoteNo,
    leadId: f.leadId ?? null,
    distributorId: f.distributorId ?? null,
    employeeId: user.employeeId,
    quoteDate: onDate,
    validUntil: ymd(f.validUntil),
    status: 'DRAFT',
    notes: f.notes ? f.notes : null,
  }).returning();

  const insertedItems = await db.insert(quotationItems).values(
    prepared.map((p) => ({
      orgId,
      quotationId: quotation.id,
      productId: p.productId,
      qty: p.qty,
      requestedRate: p.requestedRate,
      listRate: p.listRate,
      floorRate: p.floorRate,
      targetRate: p.targetRate,
      schemeId: p.schemeId,
      discount: p.discount,
      schemeBenefit: p.schemeBenefit,
      gstPct: p.gstPct,
      netAmount: p.netAmount,
      approvalStatus: p.approvalStatus,
    })),
  ).returning();

  const schemeRows = insertedItems
    .map((row, i) => ({ row, p: prepared[i] }))
    .filter(({ p }) => p.schemeId)
    .map(({ row, p }) => ({
      orgId,
      schemeId: p.schemeId!,
      quotationId: quotation.id,
      quotationItemId: row.id,
      distributorId: f.distributorId ?? null,
      actualBenefit: p.schemeBenefit,
    }));
  if (schemeRows.length) await db.insert(schemeApplications).values(schemeRows);

  await writeAudit(user, 'quotation', quotation.id, 'create', null, { quoteNo, itemCount: insertedItems.length });
  return quotation;
}

export async function getQuotation(
  orgId: string,
  id: string,
): Promise<{ quotation: QuotationRow; items: QuotationItemRow[] } | null> {
  const [quotation] = await db.select().from(quotations)
    .where(and(eq(quotations.id, id), eq(quotations.orgId, orgId), isNull(quotations.deletedAt)));
  if (!quotation) return null;
  const items = await db.select().from(quotationItems)
    .where(eq(quotationItems.quotationId, id))
    .orderBy(asc(quotationItems.createdAt));
  return { quotation, items };
}

export async function listQuotations(
  orgId: string,
  opts: { status?: string; distributorId?: string; leadId?: string } = {},
): Promise<QuotationRow[]> {
  const conds = [eq(quotations.orgId, orgId), isNull(quotations.deletedAt)];
  if (opts.status) conds.push(eq(quotations.status, opts.status));
  if (opts.distributorId) conds.push(eq(quotations.distributorId, opts.distributorId));
  if (opts.leadId) conds.push(eq(quotations.leadId, opts.leadId));
  return db.select().from(quotations).where(and(...conds)).orderBy(desc(quotations.createdAt));
}

export async function submitQuotation(user: AppUser, id: string): Promise<QuotationRow> {
  assertCan(user, 'quotation.create');
  const orgId = user.orgId;
  const [quotation] = await db.select().from(quotations)
    .where(and(eq(quotations.id, id), eq(quotations.orgId, orgId), isNull(quotations.deletedAt)));
  if (!quotation) throw new Error('not found');
  if (quotation.status !== 'DRAFT') throw new Error('not a draft');

  const approvalOn = await getConfig(orgId, 'priceApprovalRequired');
  const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, id));

  for (const item of items) {
    if (item.approvalStatus === 'PENDING') {
      const [appr] = await db.insert(priceApprovals).values({
        orgId,
        quotationItemId: item.id,
        requestedRate: item.requestedRate,
        originalRate: item.listRate,
        reason: '[floor,target) rate',
        requestedBy: user.id,
      }).returning();
      if (user.role === 'OWNER' || !approvalOn) {
        await db.update(priceApprovals).set({
          decision: 'APPROVED', approverId: user.id, decidedAt: new Date(),
        }).where(eq(priceApprovals.id, appr.id));
        await db.update(quotationItems).set({ approvalStatus: 'APPROVED', updatedAt: new Date() })
          .where(eq(quotationItems.id, item.id));
      }
    } else if (item.approvalStatus === 'BLOCKED') {
      await db.insert(priceApprovals).values({
        orgId,
        quotationItemId: item.id,
        requestedRate: item.requestedRate,
        originalRate: item.listRate,
        reason: 'below floor',
        requestedBy: user.id,
      });
    }
  }

  const [row] = await db.update(quotations).set({ status: 'SENT', updatedAt: new Date() })
    .where(eq(quotations.id, id)).returning();
  await writeAudit(user, 'quotation', id, 'submit', { status: 'DRAFT' }, { status: 'SENT' });
  return row;
}

export async function decideApproval(
  user: AppUser,
  approvalId: string,
  decision: 'APPROVED' | 'REJECTED',
  note?: string,
): Promise<PriceApprovalRow> {
  assertCan(user, 'quotation.approve');
  const [approval] = await db.select().from(priceApprovals)
    .where(and(eq(priceApprovals.id, approvalId), eq(priceApprovals.orgId, user.orgId)));
  if (!approval) throw new Error('not found');
  if (approval.decision !== 'PENDING') throw new Error('already decided');

  const reason = note ? `${approval.reason ?? ''} | ${note}`.trim() : approval.reason;
  const [row] = await db.update(priceApprovals).set({
    decision, approverId: user.id, decidedAt: new Date(), reason,
  }).where(eq(priceApprovals.id, approvalId)).returning();

  await db.update(quotationItems).set({
    approvalStatus: decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
    updatedAt: new Date(),
  }).where(eq(quotationItems.id, approval.quotationItemId));

  await writeAudit(user, 'price_approval', approvalId, 'decide', { decision: 'PENDING' }, { decision, note });
  return row;
}

export async function listPendingApprovals(
  orgId: string,
): Promise<(PriceApprovalRow & { quoteNo: string; quotationId: string; productName: string; qty: number })[]> {
  const rows = await db.select({
    ...getTableColumns(priceApprovals),
    quoteNo: quotations.quoteNo,
    quotationId: quotations.id,
    productName: products.name,
    qty: quotationItems.qty,
  }).from(priceApprovals)
    .innerJoin(quotationItems, eq(quotationItems.id, priceApprovals.quotationItemId))
    .innerJoin(quotations, eq(quotations.id, quotationItems.quotationId))
    .leftJoin(products, eq(products.id, quotationItems.productId))
    .where(and(eq(priceApprovals.decision, 'PENDING'), eq(quotations.orgId, orgId)))
    .orderBy(asc(priceApprovals.createdAt));
  return rows.map((r) => ({ ...r, productName: r.productName ?? '' }));
}

export async function setQuotationStatus(user: AppUser, id: string, status: string): Promise<QuotationRow> {
  assertCan(user, 'quotation.setStatus');
  if (!(QUOTATION_STATUSES as readonly string[]).includes(status)) throw new Error('invalid status');
  const [before] = await db.select().from(quotations)
    .where(and(eq(quotations.id, id), eq(quotations.orgId, user.orgId), isNull(quotations.deletedAt)));
  if (!before) throw new Error('not found');
  const [row] = await db.update(quotations).set({ status, updatedAt: new Date() })
    .where(eq(quotations.id, id)).returning();
  await writeAudit(user, 'quotation', id, 'status', { status: before.status }, { status });
  return row;
}
