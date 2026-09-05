import { pgTable, uuid, text, date, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

const ts = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
};

// spec §4.2 / §7. severity: 'critical' | 'attention' | 'positive'. target_user_id
// null = visible org-wide (subject to role scoping in the service layer).
// dedupeDate is the IST calendar day this alert was raised for — the alert scan
// upserts with onConflictDoNothing on the unique index below so re-running the
// scan the same day never duplicates a row.
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  severity: text('severity').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  targetUserId: text('target_user_id'),
  dedupeDate: date('dedupe_date').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  ...ts,
}, (t) => ({
  dedupeUk: uniqueIndex('notifications_dedupe_uk')
    .on(t.orgId, t.entityType, t.entityId, t.category, t.dedupeDate),
  orgReadIdx: index('notifications_org_read_idx').on(t.orgId, t.readAt),
}));
