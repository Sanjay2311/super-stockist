import { pgTable, uuid, text, timestamp, date, uniqueIndex } from 'drizzle-orm/pg-core';

const ts = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ...ts,
});

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  name: text('name').notNull(),
  gstin: text('gstin'),
  billingState: text('billing_state'),
  ...ts,
});

// employees before users: users.employeeId FKs employees.id.
export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  joiningDate: date('joining_date'),
  status: text('status').notNull().default('active'),
  userId: uuid('user_id'),
  ...ts,
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey(), // Supabase auth uid — no default, mirrors the auth row.
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(), // 'OWNER' | 'SALES'
  status: text('status').notNull().default('active'), // 'active' | 'disabled'
  employeeId: uuid('employee_id').references(() => employees.id),
  ...ts,
}, (t) => ({ emailIdx: uniqueIndex('users_email_idx').on(t.email) }));
