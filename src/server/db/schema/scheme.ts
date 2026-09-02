import { pgTable, uuid, text, integer, bigint, boolean, jsonb, timestamp, date, index } from 'drizzle-orm/pg-core';

const ts = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

// spec §4.6 / §30. M2b ships FLAT_DISCOUNT | QTY_SCHEME | DISTRIBUTOR_INCENTIVE.
// benefit jsonb: { kind: 'PCT' | 'AMOUNT' | 'PER_UNIT', value: number }
// eligibility jsonb: { distributorGrades?: ('A'|'B'|'C')[] }
export const schemes = pgTable('schemes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  scopeType: text('scope_type').notNull(), // PRODUCT | CATEGORY | ALL
  scopeId: uuid('scope_id'),               // productId or categoryId; null for ALL
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  minQty: integer('min_qty'),
  minValue: bigint('min_value', { mode: 'number' }), // paise
  benefit: jsonb('benefit').notNull(),
  eligibility: jsonb('eligibility').notNull().default({}),
  requiresApproval: boolean('requires_approval').notNull().default(false),
  active: boolean('active').notNull().default(true),
  isDemo: boolean('is_demo').notNull().default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...ts,
}, (t) => ({
  orgActiveIdx: index('schemes_org_active_idx').on(t.orgId, t.active),
}));

export const schemeApplications = pgTable('scheme_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  schemeId: uuid('scheme_id').notNull().references(() => schemes.id),
  quotationId: uuid('quotation_id'),      // plain uuid (loose ref); orderId lands in Phase 2
  quotationItemId: uuid('quotation_item_id'),
  distributorId: uuid('distributor_id'),
  actualBenefit: bigint('actual_benefit', { mode: 'number' }).notNull(), // paise
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgSchemeIdx: index('scheme_applications_org_scheme_idx').on(t.orgId, t.schemeId),
}));
