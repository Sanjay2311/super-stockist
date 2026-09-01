import { pgTable, uuid, text, boolean, integer, bigint, timestamp, date } from 'drizzle-orm/pg-core';

const ts = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const territories = pgTable('territories', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(), // ZONE | AREA | NEIGHBORHOOD | PINCODE
  parentId: uuid('parent_id'),
  estimatedMarketPotential: bigint('estimated_market_potential', { mode: 'number' }).notNull().default(0),
  estimatedDistributorCount: integer('estimated_distributor_count').notNull().default(0),
  active: boolean('active').notNull().default(true),
  isDemo: boolean('is_demo').notNull().default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...ts,
});

export const territoryAssignments = pgTable('territory_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  territoryId: uuid('territory_id').notNull().references(() => territories.id),
  employeeId: uuid('employee_id').notNull(),
  fromDate: date('from_date').notNull(),
  toDate: date('to_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
