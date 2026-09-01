import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  userId: text('user_id').notNull(), // AppUser.id (Supabase auth uid); text so tests/system actors need not be uuids
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityIdx: index('audit_entity_idx').on(t.entityType, t.entityId),
}));
