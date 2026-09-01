import { pgTable, uuid, text, integer, bigint, boolean, jsonb, timestamp, date, index } from 'drizzle-orm/pg-core';

const ts = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

// spec §4.4. status: PROSPECT | APPROVED | ACTIVE | TEMP_INACTIVE | SUSPENDED | CLOSED
// (conversion from a lead creates APPROVED — ACTIVE is driven by Orders in Phase 2).
// grade copied from the source lead's grade at conversion. Territory / lead links are
// plain uuids (loose refs), matching distributor_leads.territory_id in this codebase.
export const distributors = pgTable('distributors', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  businessName: text('business_name').notNull(),
  contactPerson: text('contact_person').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  address: text('address'),
  territoryId: uuid('territory_id'),
  exclusive: boolean('exclusive').notNull().default(false),
  exclusivityNote: text('exclusivity_note'), // reason captured when the OWNER overrides a §13 clash
  assignedEmployeeId: uuid('assigned_employee_id'),
  appointmentDate: date('appointment_date'),
  status: text('status').notNull().default('APPROVED'),
  grade: text('grade'), // 'A' | 'B' | 'C' | null
  creditLimit: bigint('credit_limit', { mode: 'number' }).notNull().default(0),   // paise
  creditDays: integer('credit_days').notNull().default(0),
  paymentTerms: text('payment_terms'),
  expectedMonthlyPurchase: bigint('expected_monthly_purchase', { mode: 'number' }).notNull().default(0), // paise
  productCategories: jsonb('product_categories').notNull().default([]),
  reviewDate: date('review_date'),
  agreementStatus: text('agreement_status'),
  sourceLeadId: uuid('source_lead_id'),
  isDemo: boolean('is_demo').notNull().default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...ts,
}, (t) => ({
  orgStatusIdx: index('distributors_org_status_idx').on(t.orgId, t.status),
  orgTerritoryIdx: index('distributors_org_territory_idx').on(t.orgId, t.territoryId),
  orgDeletedIdx: index('distributors_org_deleted_idx').on(t.orgId, t.deletedAt),
}));
