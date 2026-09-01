import { pgTable, uuid, text, jsonb, timestamp, primaryKey } from 'drizzle-orm/pg-core';

export const appConfig = pgTable('app_config', {
  orgId: uuid('org_id').notNull(),
  key: text('key').notNull(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.orgId, t.key] }) }));
