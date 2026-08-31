import { pgTable, uuid, text, integer, bigint, boolean, jsonb, timestamp, date, uniqueIndex } from 'drizzle-orm/pg-core';

const ts = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};
const deletedAt = timestamp('deleted_at', { withTimezone: true });

export const distributorLeads = pgTable('distributor_leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  businessName: text('business_name').notNull(),
  contactPerson: text('contact_person').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  address: text('address'),
  territoryId: uuid('territory_id'),
  pincode: text('pincode'),
  location: text('location'),
  existingBusinessType: text('existing_business_type'),
  yearsInBusiness: integer('years_in_business'),
  currentCategories: jsonb('current_categories'),
  approxMonthlyTurnover: bigint('approx_monthly_turnover', { mode: 'number' }),
  estimatedCategoryTurnover: bigint('estimated_category_turnover', { mode: 'number' }),
  expectedFfMonthlyPotential: bigint('expected_ff_monthly_potential', { mode: 'number' }).notNull().default(0),
  workingCapitalCapability: text('working_capital_capability'),
  expectedCreditRequirement: bigint('expected_credit_requirement', { mode: 'number' }),
  warehouse: text('warehouse'),
  deliveryVehicles: integer('delivery_vehicles').notNull().default(0),
  salesmen: integer('salesmen').notNull().default(0),
  retailerNetwork: integer('retailer_network').notNull().default(0),
  geographicCoverage: text('geographic_coverage'),
  scoreInputs: jsonb('score_inputs').notNull().default({}),
  score: integer('score').notNull().default(0),
  grade: text('grade').notNull().default('REJECT'),
  stage: text('stage').notNull().default('IDENTIFIED'),
  probability: integer('probability').notNull().default(5),
  assignedEmployeeId: uuid('assigned_employee_id'),
  nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
  convertedDistributorId: uuid('converted_distributor_id'),
  lostReason: text('lost_reason'),
  lostNotes: text('lost_notes'),
  onHoldReason: text('on_hold_reason'),
  isDemo: boolean('is_demo').notNull().default(false),
  deletedAt,
  ...ts,
});

// ponytail: the `lead_id IS NOT NULL OR distributor_id IS NOT NULL` CHECK on
// `activities` is hand-appended to drizzle/0003_*.sql — ceiling: `db:generate`
// won't reproduce it, so a regenerate/squash drops it. Upgrade path: move to a
// Drizzle `check()` in this table def once on a drizzle-kit that emits it cleanly.
export const activities = pgTable('activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  leadId: uuid('lead_id'),
  distributorId: uuid('distributor_id'),
  employeeId: uuid('employee_id'),
  type: text('type').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  notes: text('notes'),
  outcome: text('outcome'),
  nextAction: text('next_action'),
  nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt,
});

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  title: text('title').notNull(),
  type: text('type').notNull(),
  leadId: uuid('lead_id'),
  distributorId: uuid('distributor_id'),
  priority: text('priority').notNull().default('NORMAL'),
  dueDate: date('due_date').notNull(),
  assignedEmployeeId: uuid('assigned_employee_id'),
  status: text('status').notNull().default('PENDING'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  source: text('source').notNull().default('MANUAL'),
  createdBy: uuid('created_by'),
  isDemo: boolean('is_demo').notNull().default(false),
  deletedAt,
  ...ts,
});

export const employeeDailyReports = pgTable('employee_daily_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  employeeId: uuid('employee_id').notNull(),
  reportDate: date('report_date').notNull(),
  areasVisited: jsonb('areas_visited').notNull().default([]),
  notes: text('notes'),
  blockers: text('blockers'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uk: uniqueIndex('emp_daily_report_uk').on(t.orgId, t.employeeId, t.reportDate),
}));
