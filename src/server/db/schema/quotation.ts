import { pgTable, uuid, text, integer, bigint, boolean, timestamp, date, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { products } from './product';

const ts = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

// ponytail: the `(lead_id IS NOT NULL) <> (distributor_id IS NOT NULL)` CHECK on
// `quotations` is hand-appended to drizzle/0010_*.sql — ceiling: `db:generate`
// won't reproduce it, so a regenerate/squash drops it. Upgrade path: move to a
// Drizzle `check()` in this table def once on a drizzle-kit that emits it cleanly.
// Mirrors the note in src/server/db/schema/crm.ts (activities_target_ck).

// spec §4.6. lead XOR distributor (hand-appended CHECK below). quote_no is a
// per-org human key: Q-YYYYMM-NNN. status: DRAFT|SENT|ACCEPTED|REJECTED|EXPIRED.
export const quotations = pgTable('quotations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  quoteNo: text('quote_no').notNull(),
  leadId: uuid('lead_id'),
  distributorId: uuid('distributor_id'),
  employeeId: uuid('employee_id'),
  quoteDate: date('quote_date').notNull(),
  validUntil: date('valid_until').notNull(),
  status: text('status').notNull().default('DRAFT'),
  notes: text('notes'),
  isDemo: boolean('is_demo').notNull().default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...ts,
}, (t) => ({
  orgStatusIdx: index('quotations_org_status_idx').on(t.orgId, t.status),
  orgQuoteNoIdx: uniqueIndex('quotations_org_quote_no_idx').on(t.orgId, t.quoteNo),
}));

// list/floor/target rates are snapshots of product_prices at quote time (spec §4.6).
// approval_status: AUTO | PENDING | APPROVED | REJECTED | BLOCKED.
export const quotationItems = pgTable('quotation_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  quotationId: uuid('quotation_id').notNull().references(() => quotations.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  qty: integer('qty').notNull(),
  requestedRate: bigint('requested_rate', { mode: 'number' }).notNull(), // GST-inclusive, per unit, paise
  listRate: bigint('list_rate', { mode: 'number' }).notNull(),
  floorRate: bigint('floor_rate', { mode: 'number' }).notNull(),
  targetRate: bigint('target_rate', { mode: 'number' }).notNull(),
  schemeId: uuid('scheme_id'),
  discount: bigint('discount', { mode: 'number' }).notNull().default(0),
  schemeBenefit: bigint('scheme_benefit', { mode: 'number' }).notNull().default(0),
  gstPct: integer('gst_pct').notNull(),
  netAmount: bigint('net_amount', { mode: 'number' }).notNull(),
  approvalStatus: text('approval_status').notNull().default('AUTO'),
  ...ts,
}, (t) => ({
  quotationIdx: index('quotation_items_quotation_idx').on(t.quotationId),
}));

export const priceApprovals = pgTable('price_approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  quotationItemId: uuid('quotation_item_id').notNull().references(() => quotationItems.id),
  requestedRate: bigint('requested_rate', { mode: 'number' }).notNull(),
  originalRate: bigint('original_rate', { mode: 'number' }).notNull(), // = listRate snapshot
  reason: text('reason'),
  requestedBy: text('requested_by').notNull(), // AppUser.id (text; system/test actors need not be uuids)
  approverId: text('approver_id'),
  decision: text('decision').notNull().default('PENDING'), // PENDING | APPROVED | REJECTED
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  ...ts,
}, (t) => ({
  orgDecisionIdx: index('price_approvals_org_decision_idx').on(t.orgId, t.decision),
}));
