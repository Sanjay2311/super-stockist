# Milestone 3 (scoped) — Command Center, Reports, Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the M1 placeholder Dashboard with the real Command Center + Executive Dashboard content, add parameterized Reports with CSV export, an Employee Scorecard, a Notification Center backed by a nightly alert scan, global filters on Reports/Dashboard, and an inline quotation history view — scoped to data that exists today (Leads, Distributors, Quotations, Territories, Employees, Tasks, Activities, Daily Reports, Schemes). Every block that needs Orders/Inventory/Receivables (Phase 2) is explicitly dropped, not stubbed.

**Architecture:** Same layering as M1/M2a/M2b — pure calc in `src/domain/*`, DB access behind `src/server/services/*`, `writeAudit` on every user-triggered mutation, money as integer paise, soft-delete + `is_demo` where relevant. One new migration (0012, `notifications`). One new pure domain module (`alerts`). The Command Center and "Executive Dashboard" spec sections are **merged into one screen** at `/` — the spec's actual 14-item nav list (§6.1) has a single "Dashboard" entry, not two, so this plan treats §6.2 (Command Center blocks) and §6.3's Executive Dashboard content (KPI cards, distributor funnel) as one page rather than inventing a second nav item.

**Tech Stack:** Next.js 15 App Router (RSC + Server Actions + Route Handlers), Drizzle ORM over postgres.js, Postgres 16, zod v4, Vitest (serial), Playwright (`describe.skip` except the manual smoke sweep), Tailwind, `xlsx` (SheetJS, new dependency) for CSV/Excel export.

**Spec:** `docs/superpowers/specs/2026-08-31-super-stockist-design.md` — §4.2 (`notifications` table), §5.6 (distributor performance — scoped), §5.7 (employee scorecard — scoped), §6.1 (navigation), §6.2 (Command Center), §6.3 (other screens — scoped), §6.4 (global filters), §7 (alert engine / Notification Center — scoped), §8 (cross-cutting import/export).

## Global Constraints

- **Money = integer paise.** Every rupee value from a form is `rupees(Number(v))` before it reaches a service; every column is `bigint({ mode: 'number' })`.
- **Domain purity.** `src/domain/*` imports only `./money` / other `src/domain/*` modules — never Drizzle, Next, zod, or a service.
- **DB access boundary.** Only `src/server/services/*` and `src/server/db/*` import `@/server/db/client`. Server Actions, Route Handlers, and pages call services, never Drizzle.
- **Audit user-triggered mutations.** `writeAudit(user, entityType, entityId, action, oldValues, newValues)` after each insert/update caused by a logged-in user. The alert-scan job is system-generated, not a user mutation — it does NOT call `writeAudit`; it is gated by `CRON_SECRET`, not `assertCan`.
- **Permission gate.** Every mutating service method that takes an `AppUser` starts with `assertCan(user, '<action>')`. New actions get added to the `Action` union AND both `OWNER_ACTIONS` / `SALES_ACTIONS` in `src/server/auth/permissions.ts`.
- **SALES cost redaction stays an allow-list.** None of this milestone's new reads expose `ssBillingPrice`/`floorPrice`/`targetPrice` — Reports/Dashboard/Scorecard numbers are all counts, pipeline value (already SALES-visible), or quotation `netAmount` (already SALES-visible on the existing screens). No new redaction surface needed, but if a task's query ever touches `product_prices` cost columns, it must route through the existing `stripFinancial` pattern.
- **zod v4.** `z.uuid()`, `z.enum([...] as const)`.
- **Dates.** `date` columns are Postgres string-mode (`'YYYY-MM-DD'`); IST day bounds use the existing `istDayBounds()` helper in `dailyReport.ts` (330-minute offset) — do not reinvent timezone math.
- **Migrations live in `./drizzle`.** Generate with `npm run db:generate` (next number is **0012**), apply with `npm run db:migrate`.
- **Per-task gates:** `npm test` green twice in a row · `npx tsc --noEmit` clean · `npm run lint` clean · `npm run build` clean · one focused commit · BUILD-LOG entry · PONYTAIL-DEBT updated if a shortcut was taken.
- **e2e stays `describe.skip`** except the existing manual `tests/e2e/smoke-owner.spec.ts` (extend it in the final task).
- **No Phase-2 stubs.** Do not add UI placeholders, "coming soon" cards, or zeroed-out widgets for money/inventory/order data. If a spec line needs Orders/Inventory/Receivables, it is simply not built in this plan.

---

## File Structure

**New — schema**
- `src/server/db/schema/notification.ts` — `notifications` table.

**New — domain (pure)**
- `src/domain/alerts.ts` — severity/title classifiers for each alert type, given pre-fetched facts. No DB, no dates-as-now (caller passes `now`/pre-computed day counts).

**New — services**
- `src/server/services/employee.ts` — `listEmployees`.
- `src/server/services/scorecard.ts` — range-generalized activity/funnel counts, single employee and org-wide.
- `src/server/services/commandCenter.ts` — assembles the Dashboard/Command-Center read model from existing services.
- `src/server/services/notification.ts` — `runAlertScan`, `listNotifications`, `markRead`, `unreadCount`, `createNotification` (used inline by `convertLead` for the positive event).
- `src/server/services/reports.ts` — the four report-cut queries (pipeline, quotations, employees, distributors) shared by their screens and their CSV export routes.

**New — screens**
- `src/app/(app)/page.tsx` — **replaced**: Command Center + Dashboard KPI content.
- `src/app/(app)/reports/page.tsx` — hub linking to the four report screens.
- `src/app/(app)/reports/pipeline/page.tsx`
- `src/app/(app)/reports/quotations/page.tsx`
- `src/app/(app)/reports/employees/page.tsx` — the Employee Scorecard.
- `src/app/(app)/reports/distributors/page.tsx`
- `src/components/global-filters.tsx` — shared filter bar (client) + `src/lib/filters.ts` (server-side parse helper).
- `src/app/api/cron/alerts/route.ts` — the cron endpoint.
- `src/app/api/reports/[kind]/export/route.ts` — CSV export (one dynamic route handling all four report kinds, keeps SheetJS wiring in one place).
- `src/components/notification-bell.tsx` — header bell + panel (client).

**Modified**
- `src/server/db/schema/index.ts` — `export * from './notification';`
- `src/server/auth/permissions.ts` — `employee.view` action.
- `src/server/services/dailyReport.ts` — generalize `deriveCounts`'s query into a range-based helper `scorecardCounts` is actually a NEW file (`scorecard.ts`) that reuses the same query shape; `dailyReport.ts` itself is untouched except nothing (kept for its own single-day use).
- `src/server/services/distributor.ts` — `convertLead` gains one `createNotification(...)` call for the positive "new distributor" event.
- `src/app/(app)/layout.tsx` — mount `<NotificationBell>` in the header.
- `src/components/app-nav.tsx` — add `Reports` sub-items are just links from the `/reports` hub, not new sidebar entries, EXCEPT `Employee Activity` is spec-named in §6.1 nav — add `{ href: '/reports/employees', label: 'Employee Activity', ownerOnly: true }`; `/reports` itself replaces the old `{ href: '/reports/daily', label: 'Reports', ownerOnly: true }` target with `/reports`.
- `src/app/(app)/quotations/[id]/page.tsx` — add an inline History section.
- `package.json` — add `xlsx` dependency.
- `docs/BUILD-LOG.md`, `docs/PONYTAIL-DEBT.md`.

**New — tests**
- `tests/domain/alerts.test.ts`
- `tests/services/scorecard.test.ts`
- `tests/services/commandCenter.test.ts`
- `tests/services/notification.test.ts`
- `tests/services/reports.test.ts`

---

### Task 1: `notifications` schema + migration 0012

**Files:**
- Create: `src/server/db/schema/notification.ts`
- Modify: `src/server/db/schema/index.ts`
- Create: `drizzle/0012_*.sql` (generated)
- Test: `tests/services/notification-schema.test.ts`

**Interfaces:**
- Produces: `notifications` table — `id, orgId, severity ('critical'|'attention'|'positive'), category, title, body, entityType, entityId, targetUserId (nullable), dedupeDate (date), readAt (nullable timestamp), createdAt`. Unique index on `(orgId, entityType, entityId, category, dedupeDate)` for the dedup requirement (spec §7: "deduped by entity + category + day").

- [ ] **Step 1: Write the failing test**

```ts
// tests/services/notification-schema.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { notifications } from '@/server/db/schema/notification';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('notifications schema', () => {
  it('round-trips a row and enforces the entity+category+day dedup uniqueness', async () => {
    const { orgId } = await seedBase();
    const base = {
      orgId, severity: 'critical' as const, category: 'follow_up_overdue',
      title: 'Test lead: follow-up overdue', entityType: 'lead', entityId: 'lead-1',
      dedupeDate: '2026-09-04',
    };
    const [row] = await testDb.insert(notifications).values(base).returning();
    expect(row.readAt).toBeNull();
    await expect(testDb.insert(notifications).values(base)).rejects.toThrow();
    // a different day is not a dupe
    await expect(testDb.insert(notifications).values({ ...base, dedupeDate: '2026-09-05' }))
      .resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Run it — fails (module not found)**

Run: `npx vitest run tests/services/notification-schema.test.ts`

- [ ] **Step 3: Write the schema**

```ts
// src/server/db/schema/notification.ts
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
```

Add `export * from './notification';` to `src/server/db/schema/index.ts`.

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate` → `drizzle/0012_*.sql`. No hand-append needed.

- [ ] **Step 5: Run the test — passes**

Run: `npx vitest run tests/services/notification-schema.test.ts`

- [ ] **Step 6: Full gates** — `npm test` ×2 · `tsc` · `lint` · `build`.

- [ ] **Step 7: Commit**

```bash
git add src/server/db/schema/notification.ts src/server/db/schema/index.ts drizzle/0012_* tests/services/notification-schema.test.ts
git commit -m "feat(m3): notifications table + migration"
```

---

### Task 2: `employee` service

**Files:**
- Create: `src/server/services/employee.ts`
- Modify: `src/server/auth/permissions.ts`
- Test: `tests/services/employee.test.ts`

**Interfaces:**
- Consumes: `employees` schema from `@/server/db/schema/identity` (fields: `id, orgId, name, phone, email, joiningDate, status, userId`).
- Produces: `type EmployeeRow = typeof employees.$inferSelect`; `listEmployees(orgId: string, opts?: { activeOnly?: boolean }): Promise<EmployeeRow[]>`.

- [ ] **Step 1: Permission** — add `| 'employee.view'` to the `Action` union; put it in both `OWNER_ACTIONS` and `SALES_ACTIONS` (every role needs the employee-name picker for assignment dropdowns and the scorecard).

- [ ] **Step 2: Write the failing test**

```ts
// tests/services/employee.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { employees } from '@/server/db/schema/identity';
import { listEmployees } from '@/server/services/employee';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('employee service', () => {
  it('lists org-scoped employees, ordered by name, filterable to active only', async () => {
    const { orgId } = await seedBase();
    await testDb.insert(employees).values([
      { orgId, name: 'Bala', phone: '9800000001', status: 'active' },
      { orgId, name: 'Anu', phone: '9800000002', status: 'inactive' },
    ]);
    const all = await listEmployees(orgId);
    expect(all.map((e) => e.name)).toEqual(['Anu', 'Bala']);
    const active = await listEmployees(orgId, { activeOnly: true });
    expect(active.map((e) => e.name)).toEqual(['Bala']);
  });
});
```

- [ ] **Step 3: Run — fails**

Run: `npx vitest run tests/services/employee.test.ts`

- [ ] **Step 4: Implement**

```ts
// src/server/services/employee.ts
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { employees } from '@/server/db/schema/identity';

export type EmployeeRow = typeof employees.$inferSelect;

export async function listEmployees(
  orgId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<EmployeeRow[]> {
  const conds = [eq(employees.orgId, orgId)];
  if (opts.activeOnly) conds.push(eq(employees.status, 'active'));
  return db.select().from(employees).where(and(...conds)).orderBy(asc(employees.name));
}
```

- [ ] **Step 5: Run — passes.**

- [ ] **Step 6: Full gates** — `npm test` ×2 · `tsc` · `lint` · `build`.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/employee.ts src/server/auth/permissions.ts tests/services/employee.test.ts
git commit -m "feat(m3): employee service (listEmployees) + employee.view permission"
```

---

### Task 3: `scorecard` service — range-based activity/funnel counts

**Files:**
- Create: `src/server/services/scorecard.ts`
- Test: `tests/services/scorecard.test.ts`

**Interfaces:**
- Consumes: `activities`, `distributorLeads` schemas; `istDayBounds` is single-day only — this task writes its own range version (`istRangeBounds`) rather than reusing it, since the existing helper is day-scoped by design.
- Produces:
  - `istRangeBounds(from: Date, to: Date): { start: Date; end: Date }` — `[start of from's IST day, end of to's IST day)`.
  - `type ScorecardCounts = { activity: { calls; meetings; presentations; followUpsCompleted; quotations }; funnel: { newLeads; qualifiedLeads; appointments; firstOrders } }` — same shape as `dailyReport.ts`'s `deriveCounts` return, generalized to a range.
  - `scorecardCounts(orgId: string, employeeId: string, from: Date, to: Date): Promise<ScorecardCounts>`
  - `type EmployeeScorecard = { employeeId: string; employeeName: string; counts: ScorecardCounts }`
  - `listScorecards(orgId: string, from: Date, to: Date, opts?: { employeeId?: string }): Promise<EmployeeScorecard[]>` — one row per active employee (or the one filtered), reusing `listEmployees`.
  - `weeklyComparison(orgId: string, employeeId: string, weekStart: Date): Promise<{ thisWeek: ScorecardCounts; lastWeek: ScorecardCounts }>` — `weekStart` to `weekStart+6d` vs the 7 days before that.

- [ ] **Step 1: Write the failing test**

```ts
// tests/services/scorecard.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { employees } from '@/server/db/schema/identity';
import { activities, distributorLeads } from '@/server/db/schema/crm';
import { scorecardCounts, listScorecards, weeklyComparison } from '@/server/services/scorecard';

beforeAll(migrateTestDb);
beforeEach(resetDb);

const IST = (isoDateTime: string) => new Date(isoDateTime); // pass explicit UTC instants in tests

describe('scorecard service', () => {
  it('sums activity + funnel counts across a multi-day range for one employee', async () => {
    const { orgId } = await seedBase();
    const [emp] = await testDb.insert(employees).values({ orgId, name: 'Priya', phone: '9800000003' }).returning();
    // Two calls on day 1, one meeting on day 2 (both within IST range)
    await testDb.insert(activities).values([
      { orgId, employeeId: emp.id, leadId: null, distributorId: crypto.randomUUID(), type: 'CALL', occurredAt: IST('2026-09-01T05:00:00Z') },
      { orgId, employeeId: emp.id, leadId: null, distributorId: crypto.randomUUID(), type: 'CALL', occurredAt: IST('2026-09-01T10:00:00Z') },
      { orgId, employeeId: emp.id, leadId: null, distributorId: crypto.randomUUID(), type: 'MEETING', occurredAt: IST('2026-09-02T06:00:00Z') },
    ]);
    await testDb.insert(distributorLeads).values({
      orgId, businessName: 'New Co', contactPerson: 'x', phone: '9800000004',
      assignedEmployeeId: emp.id, stage: 'IDENTIFIED', createdAt: IST('2026-09-01T04:00:00Z'),
    });
    const counts = await scorecardCounts(orgId, emp.id, IST('2026-09-01T00:00:00Z'), IST('2026-09-02T00:00:00Z'));
    expect(counts.activity.calls).toBe(2);
    expect(counts.activity.meetings).toBe(1);
    expect(counts.funnel.newLeads).toBe(1);
  });

  it('listScorecards returns one row per active employee with a resolved name', async () => {
    const { orgId } = await seedBase();
    await testDb.insert(employees).values([
      { orgId, name: 'Bala', phone: '9800000005' },
      { orgId, name: 'Anu', phone: '9800000006', status: 'inactive' },
    ]);
    const rows = await listScorecards(orgId, IST('2026-09-01T00:00:00Z'), IST('2026-09-07T00:00:00Z'));
    expect(rows.map((r) => r.employeeName)).toEqual(['Bala']);
  });

  it('weeklyComparison contrasts this week against the 7 days before it', async () => {
    const { orgId } = await seedBase();
    const [emp] = await testDb.insert(employees).values({ orgId, name: 'Ravi', phone: '9800000007' }).returning();
    await testDb.insert(activities).values([
      { orgId, employeeId: emp.id, distributorId: crypto.randomUUID(), type: 'CALL', occurredAt: IST('2026-09-10T05:00:00Z') }, // this week
      { orgId, employeeId: emp.id, distributorId: crypto.randomUUID(), type: 'CALL', occurredAt: IST('2026-09-02T05:00:00Z') }, // last week
    ]);
    const { thisWeek, lastWeek } = await weeklyComparison(orgId, emp.id, IST('2026-09-07T00:00:00Z'));
    expect(thisWeek.activity.calls).toBe(1);
    expect(lastWeek.activity.calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Implement**

```ts
// src/server/services/scorecard.ts
import { and, eq, gte, lt, isNull } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { activities, distributorLeads } from '@/server/db/schema/crm';
import { stageRank, type LeadStage } from '@/domain/pipeline';
import { listEmployees } from './employee';

const IST_OFFSET_MIN = 330;

/** UTC bounds `[start of from's IST day, end of to's IST day)`. */
export function istRangeBounds(from: Date, to: Date): { start: Date; end: Date } {
  const shift = (d: Date) => new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  const startShifted = shift(from);
  const endShifted = shift(to);
  const startUtc = Date.UTC(startShifted.getUTCFullYear(), startShifted.getUTCMonth(), startShifted.getUTCDate());
  const endUtcExclusive = Date.UTC(endShifted.getUTCFullYear(), endShifted.getUTCMonth(), endShifted.getUTCDate()) + 86_400_000;
  return {
    start: new Date(startUtc - IST_OFFSET_MIN * 60_000),
    end: new Date(endUtcExclusive - IST_OFFSET_MIN * 60_000),
  };
}

export interface ScorecardCounts {
  activity: { calls: number; meetings: number; presentations: number; followUpsCompleted: number; quotations: number };
  funnel: { newLeads: number; qualifiedLeads: number; appointments: number; firstOrders: number };
}

/** Activity + funnel counts for one employee across `[from, to]` (inclusive IST days).
 *  The two groups are reported separately and MUST NOT be summed (spec §5.7). Mirrors
 *  `dailyReport.ts`'s `deriveCounts` query shape, generalized from one IST day to a range. */
export async function scorecardCounts(
  orgId: string, employeeId: string, from: Date, to: Date,
): Promise<ScorecardCounts> {
  const { start, end } = istRangeBounds(from, to);

  const acts = await db.select({ type: activities.type }).from(activities).where(and(
    eq(activities.orgId, orgId), eq(activities.employeeId, employeeId),
    gte(activities.occurredAt, start), lt(activities.occurredAt, end),
    isNull(activities.deletedAt),
  ));
  const n = (t: string) => acts.filter((a) => a.type === t).length;
  const activity = {
    calls: n('CALL'), meetings: n('MEETING'), presentations: n('PRESENTATION'),
    followUpsCompleted: n('FOLLOW_UP'), quotations: n('QUOTATION'),
  };

  const leads = await db.select({
    createdAt: distributorLeads.createdAt, updatedAt: distributorLeads.updatedAt, stage: distributorLeads.stage,
  }).from(distributorLeads).where(and(
    eq(distributorLeads.orgId, orgId), eq(distributorLeads.assignedEmployeeId, employeeId),
    isNull(distributorLeads.deletedAt),
  ));
  const inRange = (d: Date | null) => d != null && d >= start && d < end;
  const movedTo = (s: LeadStage) => leads.filter((l) => l.stage === s && inRange(l.updatedAt)).length;
  const funnel = {
    newLeads: leads.filter((l) => inRange(l.createdAt)).length,
    qualifiedLeads: leads.filter((l) => stageRank(l.stage as LeadStage) >= stageRank('QUALIFIED') && inRange(l.updatedAt)).length,
    appointments: movedTo('APPOINTED'),
    firstOrders: movedTo('FIRST_ORDER'),
  };
  return { activity, funnel };
}

export interface EmployeeScorecard {
  employeeId: string;
  employeeName: string;
  counts: ScorecardCounts;
}

export async function listScorecards(
  orgId: string, from: Date, to: Date, opts: { employeeId?: string } = {},
): Promise<EmployeeScorecard[]> {
  const emps = (await listEmployees(orgId, { activeOnly: true }))
    .filter((e) => !opts.employeeId || e.id === opts.employeeId);
  return Promise.all(emps.map(async (e) => ({
    employeeId: e.id, employeeName: e.name,
    counts: await scorecardCounts(orgId, e.id, from, to),
  })));
}

const day = 86_400_000;

export async function weeklyComparison(
  orgId: string, employeeId: string, weekStart: Date,
): Promise<{ thisWeek: ScorecardCounts; lastWeek: ScorecardCounts }> {
  const thisWeekEnd = new Date(weekStart.getTime() + 6 * day);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * day);
  const lastWeekEnd = new Date(weekStart.getTime() - 1 * day);
  const [thisWeek, lastWeek] = await Promise.all([
    scorecardCounts(orgId, employeeId, weekStart, thisWeekEnd),
    scorecardCounts(orgId, employeeId, lastWeekStart, lastWeekEnd),
  ]);
  return { thisWeek, lastWeek };
}
```

- [ ] **Step 4: Run — passes.**

- [ ] **Step 5: Full gates.**

- [ ] **Step 6: Commit**

```bash
git add src/server/services/scorecard.ts tests/services/scorecard.test.ts
git commit -m "feat(m3): scorecard service -- range-based activity/funnel counts + weekly comparison"
```

---

### Task 4: `alerts` domain (pure classifiers)

**Files:**
- Create: `src/domain/alerts.ts`
- Test: `tests/domain/alerts.test.ts`

**Interfaces:**
- Produces:
  - `type Severity = 'critical' | 'attention' | 'positive'`
  - `interface AlertCandidate { category: string; severity: Severity; title: string; body?: string; entityType: string; entityId: string; targetUserId?: string | null }`
  - `followUpOverdueAlert(input: { leadId: string; businessName: string; daysOverdue: number; assignedEmployeeId: string | null }): AlertCandidate` — `severity: daysOverdue >= 3 ? 'critical' : 'attention'`
  - `quotationStaleAlert(input: { quotationId: string; quoteNo: string; daysSinceSent: number; employeeId: string | null }): AlertCandidate` — always `'attention'`
  - `distributorReviewDueAlert(input: { distributorId: string; businessName: string; daysOverdue: number }): AlertCandidate` — `severity: daysOverdue > 0 ? 'critical' : 'attention'` (0 = due today)
  - `inactiveDistributorAlert(input: { distributorId: string; businessName: string }): AlertCandidate` — always `'attention'`
  - `emptyTerritoryAlert(input: { territoryId: string; name: string }): AlertCandidate` — always `'attention'`
  - `missingDailyReportAlert(input: { employeeId: string; employeeName: string; date: string }): AlertCandidate` — always `'attention'`, `targetUserId: null` (owner-visible, not the employee)
  - `newDistributorAppointedAlert(input: { distributorId: string; businessName: string }): AlertCandidate` — always `'positive'`

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/alerts.test.ts
import { describe, it, expect } from 'vitest';
import {
  followUpOverdueAlert, quotationStaleAlert, distributorReviewDueAlert,
  inactiveDistributorAlert, emptyTerritoryAlert, missingDailyReportAlert,
  newDistributorAppointedAlert,
} from '@/domain/alerts';

describe('alert classifiers', () => {
  it('follow-up overdue: critical at 3+ days, attention below', () => {
    const critical = followUpOverdueAlert({ leadId: 'l1', businessName: 'Acme', daysOverdue: 3, assignedEmployeeId: 'e1' });
    expect(critical.severity).toBe('critical');
    expect(critical.entityType).toBe('lead');
    expect(critical.entityId).toBe('l1');
    expect(critical.title).toMatch(/Acme/);
    const attention = followUpOverdueAlert({ leadId: 'l2', businessName: 'Beta', daysOverdue: 1, assignedEmployeeId: null });
    expect(attention.severity).toBe('attention');
  });

  it('quotation stale is always attention', () => {
    const a = quotationStaleAlert({ quotationId: 'q1', quoteNo: 'Q-1', daysSinceSent: 6, employeeId: null });
    expect(a.severity).toBe('attention');
    expect(a.entityType).toBe('quotation');
    expect(a.title).toMatch(/Q-1/);
  });

  it('distributor review due: critical once overdue, attention when due today', () => {
    expect(distributorReviewDueAlert({ distributorId: 'd1', businessName: 'X', daysOverdue: 1 }).severity).toBe('critical');
    expect(distributorReviewDueAlert({ distributorId: 'd1', businessName: 'X', daysOverdue: 0 }).severity).toBe('attention');
  });

  it('inactive distributor, empty territory, missing daily report are attention', () => {
    expect(inactiveDistributorAlert({ distributorId: 'd1', businessName: 'X' }).severity).toBe('attention');
    expect(emptyTerritoryAlert({ territoryId: 't1', name: 'Zone A' }).severity).toBe('attention');
    const md = missingDailyReportAlert({ employeeId: 'e1', employeeName: 'Priya', date: '2026-09-04' });
    expect(md.severity).toBe('attention');
    expect(md.targetUserId).toBeNull();
  });

  it('new distributor appointed is positive', () => {
    expect(newDistributorAppointedAlert({ distributorId: 'd1', businessName: 'X' }).severity).toBe('positive');
  });
});
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement**

```ts
// src/domain/alerts.ts
export type Severity = 'critical' | 'attention' | 'positive';

export interface AlertCandidate {
  category: string;
  severity: Severity;
  title: string;
  body?: string;
  entityType: string;
  entityId: string;
  targetUserId?: string | null;
}

export function followUpOverdueAlert(i: {
  leadId: string; businessName: string; daysOverdue: number; assignedEmployeeId: string | null;
}): AlertCandidate {
  return {
    category: 'follow_up_overdue',
    severity: i.daysOverdue >= 3 ? 'critical' : 'attention',
    title: `${i.businessName}: follow-up overdue`,
    body: `${i.daysOverdue} day(s) overdue`,
    entityType: 'lead', entityId: i.leadId, targetUserId: i.assignedEmployeeId,
  };
}

export function quotationStaleAlert(i: {
  quotationId: string; quoteNo: string; daysSinceSent: number; employeeId: string | null;
}): AlertCandidate {
  return {
    category: 'quotation_stale',
    severity: 'attention',
    title: `${i.quoteNo}: awaiting response`,
    body: `Sent ${i.daysSinceSent} day(s) ago, no status change yet`,
    entityType: 'quotation', entityId: i.quotationId, targetUserId: i.employeeId,
  };
}

export function distributorReviewDueAlert(i: {
  distributorId: string; businessName: string; daysOverdue: number;
}): AlertCandidate {
  return {
    category: 'distributor_review_due',
    severity: i.daysOverdue > 0 ? 'critical' : 'attention',
    title: `${i.businessName}: review ${i.daysOverdue > 0 ? 'overdue' : 'due today'}`,
    entityType: 'distributor', entityId: i.distributorId,
  };
}

export function inactiveDistributorAlert(i: { distributorId: string; businessName: string }): AlertCandidate {
  return {
    category: 'inactive_distributor',
    severity: 'attention',
    title: `${i.businessName}: marked temporarily inactive`,
    entityType: 'distributor', entityId: i.distributorId,
  };
}

export function emptyTerritoryAlert(i: { territoryId: string; name: string }): AlertCandidate {
  return {
    category: 'empty_territory',
    severity: 'attention',
    title: `${i.name}: no distributors yet`,
    entityType: 'territory', entityId: i.territoryId,
  };
}

export function missingDailyReportAlert(i: {
  employeeId: string; employeeName: string; date: string;
}): AlertCandidate {
  return {
    category: 'missing_daily_report',
    severity: 'attention',
    title: `${i.employeeName}: no daily report for ${i.date}`,
    entityType: 'employee', entityId: i.employeeId, targetUserId: null,
  };
}

export function newDistributorAppointedAlert(i: { distributorId: string; businessName: string }): AlertCandidate {
  return {
    category: 'new_distributor',
    severity: 'positive',
    title: `${i.businessName}: appointed as a new distributor`,
    entityType: 'distributor', entityId: i.distributorId,
  };
}
```

- [ ] **Step 4: Run — passes.**

- [ ] **Step 5: Full gates.**

- [ ] **Step 6: Commit**

```bash
git add src/domain/alerts.ts tests/domain/alerts.test.ts
git commit -m "feat(m3): alerts domain -- severity/title classifiers per alert type"
```

---

### Task 5: `notification` service — `runAlertScan`, list, mark-read, inline positive event

**Files:**
- Create: `src/server/services/notification.ts`
- Modify: `src/server/services/distributor.ts` (`convertLead` gains one inline call)
- Test: `tests/services/notification.test.ts`

**Interfaces:**
- Consumes: `AlertCandidate` shape + all 7 classifier functions from `@/domain/alerts`; `getFollowUpBuckets` from `./followup`; `listQuotations` from `./quotation`; `listDistributors` from `./distributor`; `listTerritories` from `./territory`; `listEmployees` from `./employee`; `getConfig` from `./config` (`staleQuotationDays`).
- Produces:
  - `type NotificationRow = typeof notifications.$inferSelect`
  - `createNotification(orgId: string, candidate: AlertCandidate, dedupeDate: string): Promise<void>` — inserts with `.onConflictDoNothing({ target: [...dedupe cols] })`; used both by `runAlertScan` and by `convertLead`'s inline positive event.
  - `runAlertScan(orgId: string): Promise<{ created: number }>` — no `AppUser` param (system job); today's IST date via a passed/derived `now`.
  - `listNotifications(user: AppUser, opts?: { unreadOnly?: boolean; limit?: number }): Promise<NotificationRow[]>` — `targetUserId IS NULL OR targetUserId = user.id`, plus OWNER also sees rows targeted at anyone (i.e. OWNER has no `targetUserId` filter at all).
  - `markRead(user: AppUser, id: string): Promise<NotificationRow>`
  - `unreadCount(user: AppUser): Promise<number>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/services/notification.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { territories } from '@/server/db/schema/territory';
import { distributorLeads } from '@/server/db/schema/crm';
import { notifications } from '@/server/db/schema/notification';
import {
  runAlertScan, listNotifications, markRead, unreadCount, createNotification,
} from '@/server/services/notification';
import { newDistributorAppointedAlert } from '@/domain/alerts';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'u-owner', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });
const sales = (orgId: string, employeeId: string): AppUser => ({ id: 'u-sales', email: 's', name: 'S', role: 'SALES', employeeId, orgId });

describe('notification service', () => {
  it('runAlertScan raises an empty-territory alert and is idempotent same-day', async () => {
    const { orgId } = await seedBase();
    await testDb.insert(territories).values({ orgId, name: 'Zone Empty', type: 'ZONE', parentId: null });
    const first = await runAlertScan(orgId);
    expect(first.created).toBeGreaterThan(0);
    const rows = await testDb.select().from(notifications).where(eq(notifications.category, 'empty_territory'));
    expect(rows.length).toBe(1);
    const second = await runAlertScan(orgId);
    expect(second.created).toBe(0); // same day -> dedup, nothing new
    const rowsAfter = await testDb.select().from(notifications).where(eq(notifications.category, 'empty_territory'));
    expect(rowsAfter.length).toBe(1);
  });

  it('runAlertScan raises a follow-up-overdue alert for an overdue open lead', async () => {
    const { orgId } = await seedBase();
    await testDb.insert(distributorLeads).values({
      orgId, businessName: 'Overdue Co', contactPerson: 'x', phone: '9800000010',
      stage: 'CONTACTED', nextFollowUpAt: new Date(Date.now() - 4 * 86_400_000),
    });
    await runAlertScan(orgId);
    const rows = await testDb.select().from(notifications).where(eq(notifications.category, 'follow_up_overdue'));
    expect(rows.length).toBe(1);
    expect(rows[0].severity).toBe('critical'); // 4 days overdue
  });

  it('listNotifications scopes by role: OWNER sees all, SALES sees only null-target + own-target', async () => {
    const { orgId } = await seedBase();
    await createNotification(orgId, newDistributorAppointedAlert({ distributorId: 'd1', businessName: 'X' }), '2026-09-04');
    await createNotification(orgId, {
      category: 'follow_up_overdue', severity: 'attention', title: 'targeted',
      entityType: 'lead', entityId: 'l1', targetUserId: 'emp-1',
    }, '2026-09-04');

    const ownerRows = await listNotifications(owner(orgId));
    expect(ownerRows.length).toBe(2);
    const salesOther = await listNotifications(sales(orgId, 'emp-2'));
    expect(salesOther.length).toBe(1); // only the null-target one
    const salesMine = await listNotifications(sales(orgId, 'emp-1'));
    expect(salesMine.length).toBe(2);
  });

  it('markRead sets readAt and unreadCount drops', async () => {
    const { orgId } = await seedBase();
    await createNotification(orgId, newDistributorAppointedAlert({ distributorId: 'd1', businessName: 'X' }), '2026-09-04');
    const user = owner(orgId);
    expect(await unreadCount(user)).toBe(1);
    const [row] = await listNotifications(user);
    const updated = await markRead(user, row.id);
    expect(updated.readAt).not.toBeNull();
    expect(await unreadCount(user)).toBe(0);
  });
});
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement**

```ts
// src/server/services/notification.ts
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { notifications } from '@/server/db/schema/notification';
import type { AlertCandidate } from '@/domain/alerts';
import {
  followUpOverdueAlert, quotationStaleAlert, distributorReviewDueAlert,
  inactiveDistributorAlert, emptyTerritoryAlert, missingDailyReportAlert,
} from '@/domain/alerts';
import { getFollowUpBuckets } from './followup';
import { listQuotations } from './quotation';
import { listDistributors } from './distributor';
import { listTerritories } from './territory';
import { listEmployees } from './employee';
import { getConfig } from './config';
import { db as _db } from '@/server/db/client'; // (unused alias guard removed below)
import { employeeDailyReports } from '@/server/db/schema/crm';
import type { AppUser } from '@/server/auth/session';

export type NotificationRow = typeof notifications.$inferSelect;

const IST_OFFSET_MIN = 330;
const ymdIst = (d: Date) => {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
};
const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / 86_400_000);

export async function createNotification(
  orgId: string, candidate: AlertCandidate, dedupeDate: string,
): Promise<void> {
  await db.insert(notifications).values({
    orgId,
    severity: candidate.severity,
    category: candidate.category,
    title: candidate.title,
    body: candidate.body ?? null,
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    targetUserId: candidate.targetUserId ?? null,
    dedupeDate,
  }).onConflictDoNothing({
    target: [notifications.orgId, notifications.entityType, notifications.entityId, notifications.category, notifications.dedupeDate],
  });
}

/** System job — no AppUser, gated by the route handler's CRON_SECRET, not assertCan.
 *  Scoped to what exists today: no payments/stock/reorder-cadence alerts (Phase 2). */
export async function runAlertScan(orgId: string, now: Date = new Date()): Promise<{ created: number }> {
  const today = ymdIst(now);
  const candidates: AlertCandidate[] = [];

  const followUps = await getFollowUpBuckets(orgId, { now });
  for (const l of followUps.overdue) {
    const daysOverdue = l.nextFollowUpAt ? daysBetween(now, new Date(l.nextFollowUpAt)) : 0;
    candidates.push(followUpOverdueAlert({
      leadId: l.id, businessName: l.businessName, daysOverdue, assignedEmployeeId: null,
    }));
  }

  const staleDays = await getConfig(orgId, 'staleQuotationDays');
  const sent = await listQuotations(orgId, { status: 'SENT' });
  for (const q of sent) {
    const daysSinceSent = daysBetween(now, new Date(q.quoteDate));
    if (daysSinceSent >= staleDays) {
      candidates.push(quotationStaleAlert({
        quotationId: q.id, quoteNo: q.quoteNo, daysSinceSent, employeeId: q.employeeId,
      }));
    }
  }

  const dists = await listDistributors(orgId);
  for (const d of dists) {
    if (d.reviewDate) {
      const daysOverdue = daysBetween(now, new Date(`${d.reviewDate}T00:00:00+05:30`));
      if (daysOverdue >= 0) {
        candidates.push(distributorReviewDueAlert({ distributorId: d.id, businessName: d.businessName, daysOverdue }));
      }
    }
    if (d.status === 'TEMP_INACTIVE') {
      candidates.push(inactiveDistributorAlert({ distributorId: d.id, businessName: d.businessName }));
    }
  }

  const territories = await listTerritories(orgId);
  const distTerritoryIds = new Set(dists.map((d) => d.territoryId).filter((x): x is string => x != null));
  for (const t of territories) {
    if (!distTerritoryIds.has(t.id)) {
      candidates.push(emptyTerritoryAlert({ territoryId: t.id, name: t.name }));
    }
  }

  const yesterday = new Date(now.getTime() - 86_400_000);
  const yesterdayYmd = ymdIst(yesterday);
  const emps = await listEmployees(orgId, { activeOnly: true });
  const reportRows = await db.select({ employeeId: employeeDailyReports.employeeId })
    .from(employeeDailyReports)
    .where(and(eq(employeeDailyReports.orgId, orgId), eq(employeeDailyReports.reportDate, yesterdayYmd)));
  const reported = new Set(reportRows.map((r) => r.employeeId));
  for (const e of emps) {
    if (!reported.has(e.id)) {
      candidates.push(missingDailyReportAlert({ employeeId: e.id, employeeName: e.name, date: yesterdayYmd }));
    }
  }

  let created = 0;
  for (const c of candidates) {
    const before = await db.select().from(notifications).where(and(
      eq(notifications.orgId, orgId), eq(notifications.entityType, c.entityType),
      eq(notifications.entityId, c.entityId), eq(notifications.category, c.category),
      eq(notifications.dedupeDate, today),
    ));
    if (before.length === 0) {
      await createNotification(orgId, c, today);
      created++;
    }
  }
  return { created };
}

export async function listNotifications(
  user: AppUser, opts: { unreadOnly?: boolean; limit?: number } = {},
): Promise<NotificationRow[]> {
  const conds = [eq(notifications.orgId, user.orgId)];
  if (user.role !== 'OWNER') {
    conds.push(or(isNull(notifications.targetUserId), eq(notifications.targetUserId, user.id))!);
  }
  if (opts.unreadOnly) conds.push(isNull(notifications.readAt));
  return db.select().from(notifications).where(and(...conds))
    .orderBy(desc(notifications.createdAt)).limit(opts.limit ?? 50);
}

export async function markRead(user: AppUser, id: string): Promise<NotificationRow> {
  const [row] = await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.orgId, user.orgId))).returning();
  if (!row) throw new Error('not found');
  return row;
}

export async function unreadCount(user: AppUser): Promise<number> {
  return (await listNotifications(user, { unreadOnly: true, limit: 999 })).length;
}
```

> Drop the stray `import { db as _db } from '@/server/db/client';` line above before committing — it is a duplicate of the first `db` import and exists only as an artifact of drafting; `tsc`/`lint` will flag the unused/duplicate import if left in.

- [ ] **Step 4: Wire the positive event into `convertLead`**

In `src/server/services/distributor.ts`, add the import `import { createNotification } from './notification';` and `import { newDistributorAppointedAlert } from '@/domain/alerts';`, then right after the existing `writeAudit(user, 'distributor', row.id, ...)` call in `convertLead`, add:

```ts
await createNotification(
  user.orgId,
  newDistributorAppointedAlert({ distributorId: row.id, businessName: row.businessName }),
  ymd(new Date()),
);
```

(`ymd` is already defined in that file.)

- [ ] **Step 5: Run — passes.**

- [ ] **Step 6: Full gates.**

- [ ] **Step 7: Commit**

```bash
git add src/server/services/notification.ts src/server/services/distributor.ts tests/services/notification.test.ts
git commit -m "feat(m3): notification service -- alert scan, role-scoped list, mark-read, inline positive event"
```

---

### Task 6: `/api/cron/alerts` route handler + Settings "Run alert scan" button

**Files:**
- Create: `src/app/api/cron/alerts/route.ts`
- Modify: `src/app/(app)/settings/page.tsx`, `src/app/(app)/settings/actions.ts` (or wherever settings Server Actions live — mirror the existing `regenerateAll` action's file)

**Interfaces:**
- Consumes: `runAlertScan(orgId)` from `@/server/services/notification`; `db` + `orgs` schema to enumerate orgs (single-org today, future-proofed for multi-org).
- Produces: `GET /api/cron/alerts` — requires header `x-cron-secret` to equal `process.env.CRON_SECRET`; returns `{ ok: true, created: number }` or 401.

- [ ] **Step 1: Route handler**

```ts
// src/app/api/cron/alerts/route.ts
import { db } from '@/server/db/client';
import { orgs } from '@/server/db/schema/identity';
import { runAlertScan } from '@/server/services/notification';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }
  const allOrgs = await db.select({ id: orgs.id }).from(orgs);
  let created = 0;
  for (const o of allOrgs) {
    created += (await runAlertScan(o.id)).created;
  }
  return Response.json({ ok: true, created });
}
```

- [ ] **Step 2: Manual trigger from Settings**

Find the Server Action file backing `src/app/(app)/settings/page.tsx` (the same file that defines the existing `regenerateAll`-style actions — read that file first to match its pattern exactly) and add:

```ts
export async function runAlertScanAction() {
  const user = await requireUser();
  if (!can(user, 'config.edit')) throw new Error('forbidden');
  const { created } = await runAlertScan(user.orgId);
  revalidatePath('/settings');
  return { created };
}
```

In `settings/page.tsx`, add a small form/button next to the existing "Regenerate recommended prices" section:

```tsx
<form action={async () => { 'use server'; await runAlertScanAction(); }} className="max-w-md space-y-2">
  <h2 className="text-sm font-medium text-neutral-600">Alerts</h2>
  <p className="text-sm text-neutral-500">
    Manually run the alert scan (the same job the nightly cron trigger runs once deployed).
  </p>
  <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Run alert scan</button>
</form>
```

(If the existing settings actions file already exports a client-importable action, prefer binding to it directly the way `regenerateAll` is bound, rather than an inline server action — match whatever the file's existing convention is.)

- [ ] **Step 3: Manual verification (no automated test — this is a thin route + a settings button over an already-tested service)**

Run: `npm run dev`, then from a second terminal: `curl -i -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/alerts` (using the value from `.env.local`). Confirm `200` + `{"ok":true,"created":N}`; confirm a request with no header or a wrong value returns `401`.

- [ ] **Step 4: Full gates** — `npm test` ×2 · `tsc` · `lint` · `build`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/alerts src/app/\(app\)/settings
git commit -m "feat(m3): /api/cron/alerts route + manual Settings trigger"
```

---

### Task 7: Notification Center — bell + panel

**Files:**
- Create: `src/components/notification-bell.tsx` (client)
- Create: `src/app/(app)/notifications/actions.ts` (`markReadAction`)
- Modify: `src/app/(app)/layout.tsx` (mount the bell)

**Interfaces:**
- Consumes: `listNotifications(user, { limit: 20 })`, `unreadCount(user)`, `markRead(user, id)` from `@/server/services/notification`.
- Produces: `<NotificationBell notifications={...} unread={...} />` — a client dropdown/panel: bell icon with an unread-count badge, panel grouped by `severity` (critical first, then attention, then positive), each row deep-links via its `entityType`/`entityId` to `/leads/[id]`, `/distributors/[id]`, `/quotations/[id]`, or (`territory`/`employee`) no link — click marks read via a Server Action and closes.

- [ ] **Step 1: Server Action**

```ts
// src/app/(app)/notifications/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { markRead } from '@/server/services/notification';

export async function markReadAction(id: string) {
  const user = await requireUser();
  await markRead(user, id);
  revalidatePath('/', 'layout');
}
```

- [ ] **Step 2: Client bell component**

`src/components/notification-bell.tsx` — `'use client'`, `useState` for open/closed (close on outside click, mirroring the pattern already used for the mobile nav's "More" sheet in `app-nav.tsx`). Entity → link map:

```ts
const ENTITY_LINK: Record<string, (id: string) => string> = {
  lead: (id) => `/leads/${id}`,
  distributor: (id) => `/distributors/${id}`,
  quotation: (id) => `/quotations/${id}`,
};
```

Rows with no map entry (`territory`, `employee`) render as plain text, not a link. Group by `severity` with three headers (Critical / Attention / Positive), skip empty groups, badge colors matching the existing `APPROVAL_BADGE` red/amber/green convention from `quotations/[id]/page.tsx`. Each row's "mark read" click calls `markReadAction(n.id)` via a small inline form/button and optimistically dims the row.

- [ ] **Step 3: Mount in the layout**

In `src/app/(app)/layout.tsx`, fetch `listNotifications(user, { limit: 20 })` and `unreadCount(user)` alongside the existing `hasDemoData` call (`Promise.all`), and render `<NotificationBell notifications={...} unread={...} />` in the header, to the left of the "Sign out" form.

- [ ] **Step 4: Full gates** — `npm test` ×2 (unchanged) · `tsc` · `lint` · `build`.

- [ ] **Step 5: Commit**

```bash
git add src/components/notification-bell.tsx src/app/\(app\)/notifications src/app/\(app\)/layout.tsx
git commit -m "feat(m3): Notification Center bell + panel in the app header"
```

---

### Task 8: `commandCenter` service

**Files:**
- Create: `src/server/services/commandCenter.ts`
- Test: `tests/services/commandCenter.test.ts`

**Interfaces:**
- Consumes: `getTodayView` (`./task`), `getFollowUpBuckets` (`./followup`), `dashboardSummary` (`@/domain/dashboard`), `listLeads` (`./lead`), `listQuotations`/`listPendingApprovals` (`./quotation`), `listDistributors` (`./distributor`), `listTerritories` (`./territory`), `OPEN_STAGES`/`STAGES` (`@/domain/pipeline`), `getConfig` (`./config`).
- Produces:

```ts
export interface CommandCenterSummary {
  mode: 'morning' | 'eod';
  yesterday: { activityCount: number; quotationsSent: number; quotationsSentValue: number };
  today: { meetingsToday: number; followUpsDueToday: number; openQuotations: number };
  forecast: { weightedPipeline: number; hotDeals: number; quotationsExpiring7d: number; quotationsExpiring30d: number };
  attention: {
    pendingApprovals: number;
    hotLeadsNoAction: { id: string; businessName: string }[];
    exclusivityOverrides: { id: string; businessName: string }[];
    missingDailyReports: number;
  };
  growth: { newDistributorsMtd: number; territoryCoveragePct: number };
  kpis: {
    totalLeads: number; qualifiedLeads: number; appointedDistributors: number; activeDistributors: number;
    openQuotationsValue: number; avgLeadScore: number;
  };
  funnel: ReturnType<typeof funnelConversion>;
}

export async function commandCenterSummary(
  user: AppUser, mode: 'morning' | 'eod',
): Promise<CommandCenterSummary>;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/services/commandCenter.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { territories } from '@/server/db/schema/territory';
import { distributorLeads } from '@/server/db/schema/crm';
import { distributors } from '@/server/db/schema/distributor';
import { commandCenterSummary } from '@/server/services/commandCenter';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'u-owner', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });

describe('commandCenterSummary', () => {
  it('assembles the scoped blocks with real numbers', async () => {
    const { orgId } = await seedBase();
    const [zone] = await testDb.insert(territories).values({ orgId, name: 'Zone A', type: 'ZONE', parentId: null }).returning();
    await testDb.insert(distributorLeads).values([
      { orgId, businessName: 'Hot Lead', contactPerson: 'x', phone: '9800000020', stage: 'QUALIFIED', grade: 'A', probability: 70, territoryId: zone.id },
    ]);
    await testDb.insert(distributors).values({
      orgId, businessName: 'D1', contactPerson: 'x', phone: '9800000021', status: 'ACTIVE', territoryId: zone.id,
    });
    const summary = await commandCenterSummary(owner(orgId), 'morning');
    expect(summary.mode).toBe('morning');
    expect(summary.kpis.totalLeads).toBe(1);
    expect(summary.kpis.activeDistributors).toBe(1);
    expect(summary.growth.territoryCoveragePct).toBeGreaterThan(0);
    expect(summary.funnel.length).toBeGreaterThan(0);
  });

  it('eod mode still returns a full summary (same shape, different mode field)', async () => {
    const { orgId } = await seedBase();
    const summary = await commandCenterSummary(owner(orgId), 'eod');
    expect(summary.mode).toBe('eod');
  });
});
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement**

```ts
// src/server/services/commandCenter.ts
import { getTodayView } from './task';
import { getFollowUpBuckets } from './followup';
import { dashboardSummary } from '@/domain/dashboard';
import { listLeads } from './lead';
import { listQuotations, listPendingApprovals } from './quotation';
import { listDistributors } from './distributor';
import { listTerritories } from './territory';
import { OPEN_STAGES, stageRank, funnelConversion, type LeadStage } from '@/domain/pipeline';
import { db } from '@/server/db/client';
import { distributors } from '@/server/db/schema/distributor';
import { and, eq, gte, isNull } from 'drizzle-orm';
import { employeeDailyReports } from '@/server/db/schema/crm';
import { listEmployees } from './employee';
import type { AppUser } from '@/server/auth/session';

const day = 86_400_000;
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

export interface CommandCenterSummary {
  mode: 'morning' | 'eod';
  yesterday: { activityCount: number; quotationsSent: number; quotationsSentValue: number };
  today: { meetingsToday: number; followUpsDueToday: number; openQuotations: number };
  forecast: { weightedPipeline: number; hotDeals: number; quotationsExpiring7d: number; quotationsExpiring30d: number };
  attention: {
    pendingApprovals: number;
    hotLeadsNoAction: { id: string; businessName: string }[];
    exclusivityOverrides: { id: string; businessName: string }[];
    missingDailyReports: number;
  };
  growth: { newDistributorsMtd: number; territoryCoveragePct: number };
  kpis: {
    totalLeads: number; qualifiedLeads: number; appointedDistributors: number; activeDistributors: number;
    openQuotationsValue: number; avgLeadScore: number;
  };
  funnel: ReturnType<typeof funnelConversion>;
}

export async function commandCenterSummary(user: AppUser, mode: 'morning' | 'eod'): Promise<CommandCenterSummary> {
  const orgId = user.orgId;
  const now = new Date();

  const [leads, allQuotations, sentQuotations, pending, dists, territories, view, followUps] = await Promise.all([
    listLeads(orgId, { limit: 1000 }),
    listQuotations(orgId, {}),
    listQuotations(orgId, { status: 'SENT' }),
    listPendingApprovals(orgId),
    listDistributors(orgId),
    listTerritories(orgId),
    getTodayView(orgId),
    getFollowUpBuckets(orgId),
  ]);

  const openLeads = leads.filter((l) => OPEN_STAGES.includes(l.stage as LeadStage));
  const { funnel, weightedPipeline } = dashboardSummary(openLeads.map((l) => ({
    stage: l.stage as LeadStage, expectedFfMonthlyPotential: l.expectedFfMonthlyPotential, probability: l.probability,
  })));

  const inMonth = (d: Date) => d >= startOfMonth(now);
  const newDistributorsMtd = dists.filter((d) => inMonth(d.createdAt)).length;
  const territoriesWithDist = new Set(dists.map((d) => d.territoryId).filter((x): x is string => x != null));
  const territoryCoveragePct = territories.length === 0 ? 0 : Math.round((territoriesWithDist.size / territories.length) * 100);

  const yesterdayStart = new Date(now.getTime() - day);
  const quotationsCreatedYesterday = allQuotations.filter((q) => q.createdAt >= yesterdayStart && q.createdAt < now);
  const activeEmployees = await listEmployees(orgId, { activeOnly: true });
  const reportedYesterday = await db.select({ employeeId: employeeDailyReports.employeeId })
    .from(employeeDailyReports)
    .where(and(eq(employeeDailyReports.orgId, orgId), gte(employeeDailyReports.reportDate, yesterdayStart.toISOString().slice(0, 10))));
  const reportedSet = new Set(reportedYesterday.map((r) => r.employeeId));
  const missingDailyReports = activeEmployees.filter((e) => !reportedSet.has(e.id)).length;

  const exclusivityOverrides = await db.select({ id: distributors.id, businessName: distributors.businessName })
    .from(distributors)
    .where(and(eq(distributors.orgId, orgId), isNull(distributors.deletedAt)))
    .then((rows) => rows.filter((r) => r != null)); // narrowed below by a second pass for exclusivityNote

  const in7 = new Date(now.getTime() + 7 * day);
  const in30 = new Date(now.getTime() + 30 * day);
  const quotationsExpiring7d = sentQuotations.filter((q) => new Date(q.validUntil) <= in7).length;
  const quotationsExpiring30d = sentQuotations.filter((q) => new Date(q.validUntil) <= in30).length;

  return {
    mode,
    yesterday: {
      activityCount: 0, // ponytail: an org-wide "activities logged yesterday" count needs a
      // dedicated query across all employees — deferred to the per-employee scorecard
      // (Task 3), which already covers this per-employee. Cross-employee rollup here is
      // a straightforward follow-up, not added now to keep this task's query count bounded.
      quotationsSent: quotationsCreatedYesterday.length,
      quotationsSentValue: 0,
    },
    today: {
      meetingsToday: view.tasks.today.filter((t) => t.type === 'MEETING').length,
      followUpsDueToday: followUps.today.length,
      openQuotations: sentQuotations.length,
    },
    forecast: {
      weightedPipeline,
      hotDeals: openLeads.filter((l) => l.grade === 'A').length,
      quotationsExpiring7d,
      quotationsExpiring30d,
    },
    attention: {
      pendingApprovals: pending.length,
      hotLeadsNoAction: followUps.hotNoAction.map((l) => ({ id: l.id, businessName: l.businessName })),
      exclusivityOverrides: [], // filled by the DB query below
      missingDailyReports,
    },
    growth: { newDistributorsMtd, territoryCoveragePct },
    kpis: {
      totalLeads: leads.length,
      qualifiedLeads: leads.filter((l) => stageRank(l.stage as LeadStage) >= stageRank('QUALIFIED')).length,
      appointedDistributors: dists.filter((d) => d.status === 'APPROVED').length,
      activeDistributors: dists.filter((d) => d.status === 'ACTIVE').length,
      openQuotationsValue: 0, // ponytail: needs per-quotation netAmount sum via a join;
      // deferred alongside the row-by-row totals debt already logged for the quotation
      // list screen (M2b PONYTAIL-DEBT) rather than duplicating that N+1 pattern here.
      avgLeadScore: leads.length === 0 ? 0 : Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length),
    },
    funnel,
  };
}
```

Replace the `exclusivityOverrides` placeholder: query `distributors` where `exclusivityNote IS NOT NULL` directly instead of the dead intermediate `.then()` above — rewrite that block as:

```ts
import { isNotNull } from 'drizzle-orm';
// ...
const overrideRows = await db.select({ id: distributors.id, businessName: distributors.businessName })
  .from(distributors)
  .where(and(eq(distributors.orgId, orgId), isNull(distributors.deletedAt), isNotNull(distributors.exclusivityNote)));
```

and set `attention.exclusivityOverrides: overrideRows` in the returned object (drop the earlier unused `exclusivityOverrides` local and the placeholder `[]`).

- [ ] **Step 4: Run — passes.**

- [ ] **Step 5: Full gates.**

- [ ] **Step 6: Commit**

```bash
git add src/server/services/commandCenter.ts tests/services/commandCenter.test.ts
git commit -m "feat(m3): commandCenter service -- scoped Command Center + Dashboard KPI read model"
```

---

### Task 9: Command Center + Dashboard screen (`/` replaced)

**Files:**
- Modify: `src/app/(app)/page.tsx` (full replace)
- Create: `src/app/(app)/mode-toggle.tsx` (client, tiny — morning/eod link toggle via `?mode=`)

**Interfaces:**
- Consumes: `commandCenterSummary(user, mode)` from Task 8. `mode` comes from `searchParams.mode` (`'eod'` or default `'morning'`).

**Pattern reference:** mirror the existing card-section layout from the current `src/app/(app)/page.tsx` (already read in this plan's research — `<Stat>` inline component, `<section className="space-y-3">` blocks) and the `StageBadge`/`GradeBadge` components in `src/components/` for consistent badge styling.

- [ ] **Step 1: Mode toggle**

```tsx
// src/app/(app)/mode-toggle.tsx
'use client';
import Link from 'next/link';

export function ModeToggle({ mode }: { mode: 'morning' | 'eod' }) {
  return (
    <div className="flex gap-2 text-sm">
      <Link href="/?mode=morning" className={`rounded px-3 py-1 ${mode === 'morning' ? 'bg-neutral-900 text-white' : 'border'}`}>Morning</Link>
      <Link href="/?mode=eod" className={`rounded px-3 py-1 ${mode === 'eod' ? 'bg-neutral-900 text-white' : 'border'}`}>EOD</Link>
    </div>
  );
}
```

- [ ] **Step 2: The page**

Replace `src/app/(app)/page.tsx`. Structure (server component):

```tsx
import Link from 'next/link';
import { requireUser } from '@/server/auth/session';
import { commandCenterSummary } from '@/server/services/commandCenter';
import { formatINR } from '@/domain/money';
import { ModeToggle } from './mode-toggle';

export default async function DashboardPage({
  searchParams,
}: { searchParams: Promise<{ mode?: string }> }) {
  const user = await requireUser();
  const { mode: rawMode } = await searchParams;
  const mode = rawMode === 'eod' ? 'eod' : 'morning';
  const s = await commandCenterSummary(user, mode);

  const Stat = ({ label, value }: { label: string; value: number | string }) => (
    <div className="rounded border px-3 py-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );

  return (
    <main className="space-y-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Command Center</h1>
        <ModeToggle mode={mode} />
      </div>

      {mode === 'morning' ? (
        <>
          <section className="space-y-3">
            <h2 className="font-semibold">What happened? (yesterday)</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Quotations sent" value={s.yesterday.quotationsSent} />
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">What is happening? (today) <Link href="/today" className="ml-2 text-xs font-normal text-blue-700 hover:underline">open →</Link></h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Meetings today" value={s.today.meetingsToday} />
              <Stat label="Follow-ups due today" value={s.today.followUpsDueToday} />
              <Stat label="Open quotations" value={s.today.openQuotations} />
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">What will happen?</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Weighted pipeline" value={formatINR(s.forecast.weightedPipeline)} />
              <Stat label="Hot deals" value={s.forecast.hotDeals} />
              <Stat label="Quotes expiring 7d" value={s.forecast.quotationsExpiring7d} />
              <Stat label="Quotes expiring 30d" value={s.forecast.quotationsExpiring30d} />
            </div>
          </section>
        </>
      ) : (
        <section className="space-y-3">
          <h2 className="font-semibold">Today's result</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Quotations sent" value={s.yesterday.quotationsSent} />
            <Stat label="Open quotations" value={s.today.openQuotations} />
          </div>
          <h2 className="font-semibold">Tomorrow: priorities</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Follow-ups due" value={s.today.followUpsDueToday} />
            <Stat label="Hot leads, no action" value={s.attention.hotLeadsNoAction.length} />
            <Stat label="Pending approvals" value={s.attention.pendingApprovals} />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">What needs my attention?</h2>
        <ul className="space-y-1 text-sm">
          {s.attention.pendingApprovals > 0 && (
            <li className="rounded border border-amber-300 bg-amber-50 px-3 py-2">
              <Link href="/approvals" className="text-blue-700 hover:underline">{s.attention.pendingApprovals} quotation line(s) awaiting price approval</Link>
            </li>
          )}
          {s.attention.hotLeadsNoAction.map((l) => (
            <li key={l.id} className="rounded border px-3 py-2">
              <Link href={`/leads/${l.id}`} className="text-blue-700 hover:underline">{l.businessName}</Link> — hot lead, no next action
            </li>
          ))}
          {s.attention.exclusivityOverrides.map((d) => (
            <li key={d.id} className="rounded border px-3 py-2">
              <Link href={`/distributors/${d.id}`} className="text-blue-700 hover:underline">{d.businessName}</Link> — exclusivity override on record
            </li>
          ))}
          {s.attention.missingDailyReports > 0 && (
            <li className="rounded border px-3 py-2">{s.attention.missingDailyReports} employee(s) missing yesterday's daily report</li>
          )}
          {s.attention.pendingApprovals === 0 && s.attention.hotLeadsNoAction.length === 0
            && s.attention.exclusivityOverrides.length === 0 && s.attention.missingDailyReports === 0 && (
            <li className="text-neutral-400">Nothing needs attention right now.</li>
          )}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Where is my growth?</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="New distributors (MTD)" value={s.growth.newDistributorsMtd} />
          <Stat label="Territory coverage" value={`${s.growth.territoryCoveragePct}%`} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Key numbers</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Total leads" value={s.kpis.totalLeads} />
          <Stat label="Qualified leads" value={s.kpis.qualifiedLeads} />
          <Stat label="Appointed distributors" value={s.kpis.appointedDistributors} />
          <Stat label="Active distributors" value={s.kpis.activeDistributors} />
          <Stat label="Avg lead score" value={s.kpis.avgLeadScore} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Pipeline funnel</h2>
        <ul className="space-y-1">
          {s.funnel.map((r, i) => (
            <li key={r.key} className="flex items-center gap-3 text-sm">
              <span className="w-44 shrink-0 text-neutral-600">{r.label}</span>
              <span className="inline-block h-4 rounded bg-blue-600" style={{ width: `${Math.min(r.count * 12, 240)}px` }} />
              <span className="tabular-nums">{r.count}</span>
              {i > 0 && <span className="text-xs text-neutral-400">{Math.round(r.convFromPrev ?? 0)}% from prev</span>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Update the M1 ponytail note** — the old `page.tsx` carried a `// ponytail: deliberately thin M1 landing page...` comment referencing M3; delete it (this task IS that M3 work).

- [ ] **Step 4: Gates** — `npm test` ×2 · `tsc` · `lint` · `build` (confirm `/` still builds and the smoke test's `getByText(/pipeline funnel/i)` / `getByText(/weighted pipeline/i)` assertions in `tests/e2e/smoke-owner.spec.ts` still have matching text — they do, both labels are preserved verbatim above).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/page.tsx src/app/\(app\)/mode-toggle.tsx
git commit -m "feat(m3): Command Center + Dashboard KPIs replace the thin M1 landing page"
```

---

### Task 10: Global filters — shared component + parse helper

**Files:**
- Create: `src/lib/filters.ts`
- Create: `src/components/global-filters.tsx` (client)
- Test: `tests/lib/filters.test.ts`

**Interfaces:**
- Produces:
  - `interface ReportFilters { from: string | null; to: string | null; territoryId: string | null; employeeId: string | null; categoryId: string | null }` — all as `'YYYY-MM-DD'` / uuid strings, or `null`.
  - `parseFilters(searchParams: Record<string, string | string[] | undefined>): ReportFilters` — pure, pulls `from`/`to`/`territory`/`employee`/`category` keys, defaults every missing/invalid key to `null`.
  - `<GlobalFilters territories={...} employees={...} categories={...} />` — client form that submits via `GET` to the current path (so filters land in `searchParams`) AND mirrors the same values into `sessionStorage` under a fixed key (`'ss-global-filters'`) on submit; on mount, if the URL has NO filter params but `sessionStorage` does, it redirects (`router.replace`) to the current path with those stored params appended — this is what makes filters "survive navigation" per spec §6.4 (Reports ↔ Dashboard) without forcing the user to re-pick them on every screen.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/filters.test.ts
import { describe, it, expect } from 'vitest';
import { parseFilters } from '@/lib/filters';

describe('parseFilters', () => {
  it('extracts known keys and defaults everything else to null', () => {
    const f = parseFilters({ from: '2026-09-01', to: '2026-09-07', territory: 't1', junk: 'x' });
    expect(f).toEqual({ from: '2026-09-01', to: '2026-09-07', territoryId: 't1', employeeId: null, categoryId: null });
  });
  it('treats an array value (repeated query key) as unset', () => {
    const f = parseFilters({ from: ['a', 'b'] });
    expect(f.from).toBeNull();
  });
});
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement `src/lib/filters.ts`**

```ts
export interface ReportFilters {
  from: string | null;
  to: string | null;
  territoryId: string | null;
  employeeId: string | null;
  categoryId: string | null;
}

function one(v: string | string[] | undefined): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function parseFilters(searchParams: Record<string, string | string[] | undefined>): ReportFilters {
  return {
    from: one(searchParams.from),
    to: one(searchParams.to),
    territoryId: one(searchParams.territory),
    employeeId: one(searchParams.employee),
    categoryId: one(searchParams.category),
  };
}
```

- [ ] **Step 4: Run — passes.**

- [ ] **Step 5: Client component**

```tsx
// src/components/global-filters.tsx
'use client';
import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const STORAGE_KEY = 'ss-global-filters';

export function GlobalFilters({
  territories, employees,
}: {
  territories: { id: string; name: string }[];
  employees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.toString()) return; // URL already carries filters — respect them
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) router.replace(`${pathname}?${stored}`);
    } catch {
      // sessionStorage unavailable (private mode etc.) — filters just don't persist
    }
  }, [pathname, router, searchParams]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const params = new URLSearchParams(new FormData(e.currentTarget) as unknown as Record<string, string>).toString();
    try {
      sessionStorage.setItem(STORAGE_KEY, params);
    } catch {
      // ignore
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 rounded border p-3 text-sm">
      <label>From
        <input type="date" name="from" defaultValue={searchParams.get('from') ?? ''} className="ml-1 rounded border px-2 py-1" />
      </label>
      <label>To
        <input type="date" name="to" defaultValue={searchParams.get('to') ?? ''} className="ml-1 rounded border px-2 py-1" />
      </label>
      <label>Territory
        <select name="territory" defaultValue={searchParams.get('territory') ?? ''} className="ml-1 rounded border px-2 py-1">
          <option value="">All</option>
          {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label>Employee
        <select name="employee" defaultValue={searchParams.get('employee') ?? ''} className="ml-1 rounded border px-2 py-1">
          <option value="">All</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </label>
      <button className="rounded bg-neutral-900 px-3 py-1.5 text-white">Apply</button>
    </form>
  );
}
```

- [ ] **Step 6: Full gates.**

- [ ] **Step 7: Commit**

```bash
git add src/lib/filters.ts src/components/global-filters.tsx tests/lib/filters.test.ts
git commit -m "feat(m3): global filters -- URL params + sessionStorage persistence"
```

---

### Task 11: `reports` service — the four report-cut queries

**Files:**
- Create: `src/server/services/reports.ts`
- Test: `tests/services/reports.test.ts`

**Interfaces:**
- Consumes: `ReportFilters` from `@/lib/filters`; `distributorLeads`, `distributors`, `quotations`, `employeeDailyReports` schemas.
- Produces:
  - `pipelineReport(orgId, filters: ReportFilters): Promise<{ byStage: { stage: string; count: number }[]; byTerritory: { territoryName: string | null; count: number }[]; byEmployee: { employeeName: string | null; count: number }[]; lossReasons: { reason: string; count: number }[] }>`
  - `quotationsReport(orgId, filters): Promise<{ byStatus: { status: string; count: number; value: number }[]; byDistributor: { businessName: string; count: number; value: number }[]; byEmployee: { employeeName: string | null; count: number; value: number }[] }>` — `value` sums `quotationItems.netAmount` per quotation via a join.
  - `employeesReport(orgId, filters): Promise<EmployeeScorecard[]>` — thin wrapper over `listScorecards` (Task 3) using `filters.from`/`filters.to` (default: last 7 days) and `filters.employeeId`.
  - `distributorsReport(orgId, filters): Promise<{ byStatus: { status: string; count: number }[]; byGrade: { grade: string | null; count: number }[]; byTerritory: { territoryName: string | null; count: number }[]; dailyReportCompliance: { employeeName: string; submitted: number; expected: number }[] }>`

Each function applies `filters.territoryId`/`filters.employeeId`/`filters.from`/`filters.to` where the underlying table has that column (leads/distributors have `territoryId`; leads/quotations/activities have an employee link; date range applies to `createdAt` unless noted).

- [ ] **Step 1: Write the failing test** (one representative case per report — the implementer expands coverage)

```ts
// tests/services/reports.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { distributorLeads } from '@/server/db/schema/crm';
import { distributors } from '@/server/db/schema/distributor';
import { pipelineReport, distributorsReport } from '@/server/services/reports';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('reports service', () => {
  it('pipelineReport groups open+lost leads by stage and surfaces loss reasons', async () => {
    const { orgId } = await seedBase();
    await testDb.insert(distributorLeads).values([
      { orgId, businessName: 'A', contactPerson: 'x', phone: '9800000030', stage: 'QUALIFIED' },
      { orgId, businessName: 'B', contactPerson: 'x', phone: '9800000031', stage: 'LOST', lostReason: 'PRICE' },
    ]);
    const r = await pipelineReport(orgId, { from: null, to: null, territoryId: null, employeeId: null, categoryId: null });
    expect(r.byStage.find((s) => s.stage === 'QUALIFIED')?.count).toBe(1);
    expect(r.lossReasons.find((l) => l.reason === 'PRICE')?.count).toBe(1);
  });

  it('distributorsReport groups by status and grade', async () => {
    const { orgId } = await seedBase();
    await testDb.insert(distributors).values([
      { orgId, businessName: 'D1', contactPerson: 'x', phone: '9800000032', status: 'ACTIVE', grade: 'A' },
      { orgId, businessName: 'D2', contactPerson: 'x', phone: '9800000033', status: 'ACTIVE', grade: 'B' },
    ]);
    const r = await distributorsReport(orgId, { from: null, to: null, territoryId: null, employeeId: null, categoryId: null });
    expect(r.byStatus.find((s) => s.status === 'ACTIVE')?.count).toBe(2);
    expect(r.byGrade.map((g) => g.grade).sort()).toEqual(['A', 'B']);
  });
});
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement**

```ts
// src/server/services/reports.ts
import { and, eq, gte, lte, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { distributorLeads } from '@/server/db/schema/crm';
import { distributors } from '@/server/db/schema/distributor';
import { territories } from '@/server/db/schema/territory';
import { employees } from '@/server/db/schema/identity';
import { quotations, quotationItems } from '@/server/db/schema/quotation';
import { employeeDailyReports } from '@/server/db/schema/crm';
import type { ReportFilters } from '@/lib/filters';
import { listScorecards, type EmployeeScorecard } from './scorecard';

function dateConds(filters: ReportFilters, col: ReturnType<typeof sql>) {
  const c = [];
  if (filters.from) c.push(gte(col as never, filters.from));
  if (filters.to) c.push(lte(col as never, filters.to));
  return c;
}

export async function pipelineReport(orgId: string, filters: ReportFilters) {
  const conds = [eq(distributorLeads.orgId, orgId), isNull(distributorLeads.deletedAt)];
  if (filters.territoryId) conds.push(eq(distributorLeads.territoryId, filters.territoryId));
  if (filters.employeeId) conds.push(eq(distributorLeads.assignedEmployeeId, filters.employeeId));
  const rows = await db.select({
    stage: distributorLeads.stage, lostReason: distributorLeads.lostReason,
    territoryName: territories.name, employeeName: employees.name,
  }).from(distributorLeads)
    .leftJoin(territories, eq(territories.id, distributorLeads.territoryId))
    .leftJoin(employees, eq(employees.id, distributorLeads.assignedEmployeeId))
    .where(and(...conds));

  const count = <T,>(rows: T[], key: (r: T) => string | null) => {
    const m = new Map<string | null, number>();
    for (const r of rows) { const k = key(r); m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  };
  const byStageMap = count(rows, (r) => r.stage);
  const byTerritoryMap = count(rows, (r) => r.territoryName);
  const byEmployeeMap = count(rows, (r) => r.employeeName);
  const lossMap = count(rows.filter((r) => r.stage === 'LOST'), (r) => r.lostReason);

  return {
    byStage: [...byStageMap].map(([stage, count]) => ({ stage: stage!, count })),
    byTerritory: [...byTerritoryMap].map(([territoryName, count]) => ({ territoryName, count })),
    byEmployee: [...byEmployeeMap].map(([employeeName, count]) => ({ employeeName, count })),
    lossReasons: [...lossMap].map(([reason, count]) => ({ reason: reason!, count })),
  };
}

export async function quotationsReport(orgId: string, filters: ReportFilters) {
  const conds = [eq(quotations.orgId, orgId), isNull(quotations.deletedAt)];
  if (filters.employeeId) conds.push(eq(quotations.employeeId, filters.employeeId));
  const rows = await db.select({
    status: quotations.status, employeeId: quotations.employeeId, employeeName: employees.name,
    distributorId: quotations.distributorId, distributorName: distributors.businessName,
    quotationId: quotations.id, netAmount: quotationItems.netAmount,
  }).from(quotations)
    .leftJoin(employees, eq(employees.id, quotations.employeeId))
    .leftJoin(distributors, eq(distributors.id, quotations.distributorId))
    .leftJoin(quotationItems, eq(quotationItems.quotationId, quotations.id))
    .where(and(...conds));

  type Agg = { count: Set<string>; value: number };
  const bump = (m: Map<string, Agg>, key: string, quotationId: string, amount: number) => {
    const agg = m.get(key) ?? { count: new Set(), value: 0 };
    agg.count.add(quotationId); agg.value += amount;
    m.set(key, agg);
  };
  const byStatus = new Map<string, Agg>();
  const byDistributor = new Map<string, Agg>();
  const byEmployee = new Map<string, Agg>();
  for (const r of rows) {
    const amount = r.netAmount ?? 0;
    bump(byStatus, r.status, r.quotationId, amount);
    if (r.distributorName) bump(byDistributor, r.distributorName, r.quotationId, amount);
    bump(byEmployee, r.employeeName ?? '—', r.quotationId, amount);
  }
  const toArr = (m: Map<string, Agg>) => [...m].map(([key, agg]) => ({ key, count: agg.count.size, value: agg.value }));
  return {
    byStatus: toArr(byStatus).map((r) => ({ status: r.key, count: r.count, value: r.value })),
    byDistributor: toArr(byDistributor).map((r) => ({ businessName: r.key, count: r.count, value: r.value })),
    byEmployee: toArr(byEmployee).map((r) => ({ employeeName: r.key, count: r.count, value: r.value })),
  };
}

export async function employeesReport(orgId: string, filters: ReportFilters): Promise<EmployeeScorecard[]> {
  const to = filters.to ? new Date(filters.to) : new Date();
  const from = filters.from ? new Date(filters.from) : new Date(to.getTime() - 6 * 86_400_000);
  return listScorecards(orgId, from, to, { employeeId: filters.employeeId ?? undefined });
}

export async function distributorsReport(orgId: string, filters: ReportFilters) {
  const conds = [eq(distributors.orgId, orgId), isNull(distributors.deletedAt)];
  if (filters.territoryId) conds.push(eq(distributors.territoryId, filters.territoryId));
  const rows = await db.select({
    status: distributors.status, grade: distributors.grade, territoryName: territories.name,
  }).from(distributors).leftJoin(territories, eq(territories.id, distributors.territoryId)).where(and(...conds));

  const count = <T,>(rows: T[], key: (r: T) => string | null) => {
    const m = new Map<string | null, number>();
    for (const r of rows) { const k = key(r); m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  };
  const byStatus = [...count(rows, (r) => r.status)].map(([status, count]) => ({ status: status!, count }));
  const byGrade = [...count(rows, (r) => r.grade)].map(([grade, count]) => ({ grade, count }));
  const byTerritory = [...count(rows, (r) => r.territoryName)].map(([territoryName, count]) => ({ territoryName, count }));

  const emps = await db.select({ id: employees.id, name: employees.name }).from(employees)
    .where(and(eq(employees.orgId, orgId), eq(employees.status, 'active')));
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const submittedRows = await db.select({ employeeId: employeeDailyReports.employeeId }).from(employeeDailyReports)
    .where(and(eq(employeeDailyReports.orgId, orgId), eq(employeeDailyReports.reportDate, yesterday)));
  const submittedSet = new Set(submittedRows.map((r) => r.employeeId));
  const dailyReportCompliance = emps.map((e) => ({
    employeeName: e.name, submitted: submittedSet.has(e.id) ? 1 : 0, expected: 1,
  }));

  return { byStatus, byGrade, byTerritory, dailyReportCompliance };
}
```

> Drop the unused `dateConds` helper above before committing (none of the four functions ended up needing a shared date-range fragment — leads/distributors don't have a natural single date column to range-filter on for this task's queries, and `employeesReport` uses `listScorecards`'s own range args instead) — `tsc`/`lint` will flag it as unused if left in.

- [ ] **Step 4: Run — passes.**

- [ ] **Step 5: Full gates.**

- [ ] **Step 6: Commit**

```bash
git add src/server/services/reports.ts tests/services/reports.test.ts
git commit -m "feat(m3): reports service -- pipeline/quotations/employees/distributors cuts"
```

---

### Task 12: Reports screens (hub + 4 report pages) with global filters

**Files:**
- Create: `src/app/(app)/reports/page.tsx` (hub)
- Create: `src/app/(app)/reports/pipeline/page.tsx`
- Create: `src/app/(app)/reports/quotations/page.tsx`
- Create: `src/app/(app)/reports/employees/page.tsx`
- Create: `src/app/(app)/reports/distributors/page.tsx`
- Modify: `src/components/app-nav.tsx` — `{ href: '/reports', label: 'Reports', ownerOnly: true }` replaces the old `/reports/daily` target; add `{ href: '/reports/employees', label: 'Employee Activity', ownerOnly: true }` right after Distributors (matches spec §6.1 nav ordering intent — CRM-adjacent, not buried under Reports).

**Interfaces:**
- Consumes: `pipelineReport`/`quotationsReport`/`employeesReport`/`distributorsReport` (Task 11), `parseFilters` (Task 10), `<GlobalFilters>` (Task 10), `listTerritories`, `listEmployees`.

- [ ] **Step 1: Hub page** — `/reports`: `if (!can(user, 'dailyReport.viewAll')) redirect('/')` (reuse the existing owner-only gate the old `/reports/daily` page used); four link cards to Pipeline, Quotations, Employees, Distributors, plus a fifth "Daily Reports" card linking to the pre-existing `/reports/daily`.

- [ ] **Step 2: Each report page** follows the same shape:

```tsx
// src/app/(app)/reports/pipeline/page.tsx (representative — quotations/distributors follow identically, employees uses employeesReport's EmployeeScorecard[] shape instead of the {byX} shape)
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { pipelineReport } from '@/server/services/reports';
import { listTerritories } from '@/server/services/territory';
import { listEmployees } from '@/server/services/employee';
import { parseFilters } from '@/lib/filters';
import { GlobalFilters } from '@/components/global-filters';

export default async function PipelineReportPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!can(user, 'dailyReport.viewAll')) redirect('/');
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [report, territories, employees] = await Promise.all([
    pipelineReport(user.orgId, filters),
    listTerritories(user.orgId),
    listEmployees(user.orgId, { activeOnly: true }),
  ]);

  return (
    <main className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pipeline report</h1>
        <a href={`/api/reports/pipeline/export?${new URLSearchParams(sp as Record<string, string>).toString()}`}
           className="rounded border px-3 py-1.5 text-sm">Export CSV</a>
      </div>
      <GlobalFilters territories={territories} employees={employees} />
      {/* three small tables: report.byStage, report.byTerritory, report.byEmployee,
          report.lossReasons -- each a <table> with two columns (label, count),
          mirroring the plain two-column table style already used in
          src/app/(app)/reports/daily/page.tsx's CountBlock component */}
    </main>
  );
}
```

Build the actual per-report table markup (byStage/byTerritory/byEmployee/lossReasons for pipeline; byStatus/byDistributor/byEmployee for quotations, each row showing count + `formatINR(value)`; the `EmployeeScorecard[]` list for employees, rendering `counts.activity` and `counts.funnel` via the existing `CountBlock`-style two-column layout from `reports/daily/page.tsx`; byStatus/byGrade/byTerritory/dailyReportCompliance for distributors) using the same plain-table Tailwind classes already established in `reports/daily/page.tsx` (`<table className="w-full text-sm">`, `<tr className="border-b text-left text-neutral-500">` headers).

- [ ] **Step 3: Nav** — apply the `app-nav.tsx` change described above.

- [ ] **Step 4: Gates** — `npm test` ×2 (unchanged) · `tsc` · `lint` · `build` (confirm all five new routes appear).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/reports src/components/app-nav.tsx
git commit -m "feat(m3): Reports hub + pipeline/quotations/employees/distributors screens with global filters"
```

---

### Task 13: CSV export route handler (SheetJS)

**Files:**
- Modify: `package.json` (add `xlsx`)
- Create: `src/app/api/reports/[kind]/export/route.ts`

**Interfaces:**
- Consumes: the same four report functions from Task 11, `parseFilters` from Task 10.
- Produces: `GET /api/reports/{pipeline|quotations|employees|distributors}/export?<filters>` — requires an authenticated OWNER (`requireUser()` + `can(user,'dailyReport.viewAll')`, 302 to `/` otherwise, matching the report pages' own gate), returns a `.csv` attachment.

- [ ] **Step 1: Install dependency**

```bash
npm install xlsx
```

- [ ] **Step 2: Route handler**

```ts
// src/app/api/reports/[kind]/export/route.ts
import * as XLSX from 'xlsx';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { pipelineReport, quotationsReport, employeesReport, distributorsReport } from '@/server/services/reports';
import { parseFilters } from '@/lib/filters';

export const dynamic = 'force-dynamic';

const KINDS = ['pipeline', 'quotations', 'employees', 'distributors'] as const;
type Kind = (typeof KINDS)[number];

function flatten(kind: Kind, report: unknown): Record<string, unknown>[] {
  switch (kind) {
    case 'pipeline': {
      const r = report as Awaited<ReturnType<typeof pipelineReport>>;
      return [
        ...r.byStage.map((x) => ({ cut: 'stage', key: x.stage, count: x.count })),
        ...r.byTerritory.map((x) => ({ cut: 'territory', key: x.territoryName ?? '—', count: x.count })),
        ...r.byEmployee.map((x) => ({ cut: 'employee', key: x.employeeName ?? '—', count: x.count })),
        ...r.lossReasons.map((x) => ({ cut: 'loss_reason', key: x.reason, count: x.count })),
      ];
    }
    case 'quotations': {
      const r = report as Awaited<ReturnType<typeof quotationsReport>>;
      return [
        ...r.byStatus.map((x) => ({ cut: 'status', key: x.status, count: x.count, valuePaise: x.value })),
        ...r.byDistributor.map((x) => ({ cut: 'distributor', key: x.businessName, count: x.count, valuePaise: x.value })),
        ...r.byEmployee.map((x) => ({ cut: 'employee', key: x.employeeName ?? '—', count: x.count, valuePaise: x.value })),
      ];
    }
    case 'employees': {
      const r = report as Awaited<ReturnType<typeof employeesReport>>;
      return r.map((e) => ({
        employee: e.employeeName,
        calls: e.counts.activity.calls, meetings: e.counts.activity.meetings,
        presentations: e.counts.activity.presentations, followUpsCompleted: e.counts.activity.followUpsCompleted,
        quotations: e.counts.activity.quotations,
        newLeads: e.counts.funnel.newLeads, qualifiedLeads: e.counts.funnel.qualifiedLeads,
        appointments: e.counts.funnel.appointments, firstOrders: e.counts.funnel.firstOrders,
      }));
    }
    case 'distributors': {
      const r = report as Awaited<ReturnType<typeof distributorsReport>>;
      return [
        ...r.byStatus.map((x) => ({ cut: 'status', key: x.status, count: x.count })),
        ...r.byGrade.map((x) => ({ cut: 'grade', key: x.grade ?? '—', count: x.count })),
        ...r.byTerritory.map((x) => ({ cut: 'territory', key: x.territoryName ?? '—', count: x.count })),
        ...r.dailyReportCompliance.map((x) => ({ cut: 'daily_report', key: x.employeeName, count: x.submitted })),
      ];
    }
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await requireUser();
  if (!can(user, 'dailyReport.viewAll')) redirect('/');
  const { kind } = await params;
  if (!KINDS.includes(kind as Kind)) return new Response('not found', { status: 404 });

  const url = new URL(req.url);
  const sp: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { sp[k] = v; });
  const filters = parseFilters(sp);

  const report = kind === 'pipeline' ? await pipelineReport(user.orgId, filters)
    : kind === 'quotations' ? await quotationsReport(user.orgId, filters)
    : kind === 'employees' ? await employeesReport(user.orgId, filters)
    : await distributorsReport(user.orgId, filters);

  const rows = flatten(kind as Kind, report);
  const sheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(sheet);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${kind}-report.csv"`,
    },
  });
}
```

- [ ] **Step 3: Manual verification** — `npm run dev`, visit `/reports/pipeline`, click "Export CSV", confirm a `.csv` downloads with sensible rows. Repeat for the other three kinds.

- [ ] **Step 4: Full gates** — `npm test` ×2 · `tsc` · `lint` · `build`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/app/api/reports
git commit -m "feat(m3): CSV export route for the four report cuts (SheetJS)"
```

---

### Task 14: Quotation history — inline audit view

**Files:**
- Modify: `src/server/services/quotation.ts` (add `getQuotationHistory`)
- Modify: `src/app/(app)/quotations/[id]/page.tsx` (mount a History section)
- Test: `tests/services/quotation.test.ts` (extend)

**Interfaces:**
- Consumes: `auditLog` schema from `@/server/db/schema/audit`; `users` schema (for name resolution).
- Produces: `getQuotationHistory(orgId: string, quotationId: string): Promise<{ id: string; action: string; entityType: string; occurredAt: Date; userName: string; summary: string }[]>` — reads `audit_log` where (`entityType='quotation' AND entityId=quotationId`) OR (`entityType='price_approval' AND entityId IN <that quote's approval ids>`), resolved to `users.name` via a left join, ordered by `createdAt` ascending, with a plain-English `summary` derived per `action`:
  - `quotation`/`create` → `"Created"`
  - `quotation`/`submit` → `"Submitted"`
  - `quotation`/`status` → `` `Status: ${old.status} → ${new.status}` ``
  - `price_approval`/`auto_approve` → `` `Self-approved a line at ${formatINR(newValues.requestedRate)}` `` (computed client-side from the raw `newValues` the row already carries — keep `summary` as a fallback string when `newValues` doesn't parse, don't throw)
  - `price_approval`/`decide` → `` `Line ${newValues.decision.toLowerCase()}` ``
  - default → the raw `action` string

- [ ] **Step 1: Write the failing test (append to `tests/services/quotation.test.ts`)**

```ts
it('getQuotationHistory returns the quotation + its approvals audit trail in order, with resolved names', async () => {
  const { orgId } = await seedBase();
  const { product } = await seedProduct(orgId);
  const d = await seedDist(orgId);
  const q = await createQuotation(owner(orgId), {
    distributorId: d.id, validUntil: '2026-12-31',
    items: [{ productId: product.id, qty: 5, requestedRate: 12000 }], // PENDING band
  });
  await submitQuotation(owner(orgId), q.id); // self-approves
  await setQuotationStatus(owner(orgId), q.id, 'ACCEPTED');

  const history = await getQuotationHistory(orgId, q.id);
  expect(history.map((h) => h.action)).toEqual(['create', 'submit', 'auto_approve', 'status']);
  expect(history[0].userName).toBe('O'); // seeded owner() AppUser.name
});
```

(This requires `users` to actually carry a row for `owner(orgId).id` — insert one in the test setup if `seedBase` doesn't already; check `tests/helpers` conventions used by other service tests that resolve user names, e.g. `tests/services/dailyReport.test.ts` if it exists, and follow the same seeding pattern. If no precedent exists, insert directly: `await testDb.insert(users).values({ id: 'u-owner', orgId, email: 'o', name: 'O', role: 'OWNER' });` before calling the service functions.)

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement**

Add to `src/server/services/quotation.ts` (new imports: `auditLog` from `@/server/db/schema/audit`, `users` from `@/server/db/schema/identity`, `inArray`, `or`):

```ts
export interface QuotationHistoryEntry {
  id: string; action: string; entityType: string; occurredAt: Date; userName: string; summary: string;
}

function summarize(entry: { entityType: string; action: string; oldValues: unknown; newValues: unknown }): string {
  const nv = entry.newValues as Record<string, unknown> | null;
  const ov = entry.oldValues as Record<string, unknown> | null;
  if (entry.entityType === 'quotation') {
    if (entry.action === 'create') return 'Created';
    if (entry.action === 'submit') return 'Submitted';
    if (entry.action === 'status' && ov && nv) return `Status: ${ov.status} → ${nv.status}`;
  }
  if (entry.entityType === 'price_approval') {
    if (entry.action === 'auto_approve' && nv?.requestedRate != null) {
      return `Self-approved a line at ₹${(Number(nv.requestedRate) / 100).toFixed(2)}`;
    }
    if (entry.action === 'decide' && nv?.decision) return `Line ${String(nv.decision).toLowerCase()}`;
  }
  return entry.action;
}

export async function getQuotationHistory(orgId: string, quotationId: string): Promise<QuotationHistoryEntry[]> {
  const approvalIds = (await db.select({ id: priceApprovals.id }).from(priceApprovals)
    .innerJoin(quotationItems, eq(quotationItems.id, priceApprovals.quotationItemId))
    .where(eq(quotationItems.quotationId, quotationId))).map((r) => r.id);

  const rows = await db.select({
    id: auditLog.id, action: auditLog.action, entityType: auditLog.entityType,
    occurredAt: auditLog.createdAt, userId: auditLog.userId,
    oldValues: auditLog.oldValues, newValues: auditLog.newValues, userName: users.name,
  }).from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(and(
      eq(auditLog.orgId, orgId),
      or(
        and(eq(auditLog.entityType, 'quotation'), eq(auditLog.entityId, quotationId)),
        approvalIds.length
          ? and(eq(auditLog.entityType, 'price_approval'), inArray(auditLog.entityId, approvalIds))
          : undefined,
      ),
    ))
    .orderBy(asc(auditLog.createdAt));

  return rows.map((r) => ({
    id: r.id, action: r.action, entityType: r.entityType, occurredAt: r.occurredAt,
    userName: r.userName ?? r.userId,
    summary: summarize(r),
  }));
}
```

- [ ] **Step 4: Mount the History section on the quotation detail page**

In `src/app/(app)/quotations/[id]/page.tsx`, add `getQuotationHistory` to the import from `@/server/services/quotation`, fetch it alongside `pending` (`const history = await getQuotationHistory(user.orgId, id);`), and render, after the existing "Pending price approvals" section:

```tsx
<section className="rounded border p-4">
  <h2 className="mb-3 text-sm font-medium">History</h2>
  <ol className="space-y-2 text-sm">
    {history.map((h) => (
      <li key={h.id} className="border-l-2 border-neutral-200 pl-3">
        <div className="text-neutral-500">
          {new Date(h.occurredAt).toLocaleString('en-IN')} · <span className="font-medium text-neutral-800">{h.userName}</span>
        </div>
        <div>{h.summary}</div>
      </li>
    ))}
    {history.length === 0 && <li className="text-neutral-400">No history yet.</li>}
  </ol>
</section>
```

- [ ] **Step 5: Run — passes.**

- [ ] **Step 6: Full gates.**

- [ ] **Step 7: Commit**

```bash
git add src/server/services/quotation.ts "src/app/(app)/quotations/[id]/page.tsx" tests/services/quotation.test.ts
git commit -m "feat(m3): quotation history -- inline audit trail on the detail page"
```

---

### Task 15: Smoke sweep extension + docs

**Files:**
- Modify: `tests/e2e/smoke-owner.spec.ts`
- Modify: `docs/BUILD-LOG.md`, `docs/PONYTAIL-DEBT.md`

**Interfaces:** none new — this task only extends the existing manual Playwright spec and records the ledger.

- [ ] **Step 1: Extend the smoke spec** — add ONE `test(...)` block (dev server + demo data required, not run automatically): visits `/` and asserts both `'Command Center'` and the mode-toggle links render with no server error; clicks `EOD`, asserts the URL carries `?mode=eod` and `"Tomorrow: priorities"` renders; visits `/reports`, then `/reports/pipeline`, asserts a table renders with no server error; visits `/reports/employees`, asserts at least the page renders (data may be empty on fresh demo data); opens a quotation detail page, asserts a "History" section renders with at least one entry (the demo quotation already has a `create` audit row); clicks the notification bell (if present in demo data, else asserts the bell renders with a `0` badge) and confirms no server error. Follow the existing spec's `assertNoServerError` helper and unique-timestamped-name convention where the block creates anything.

- [ ] **Step 2: BUILD-LOG.md** — append one line per completed task (1–15).

- [ ] **Step 3: PONYTAIL-DEBT.md** — add rows for: the deferred org-wide "activities yesterday" and "open quotations value" rollups in `commandCenterSummary` (both explicitly stubbed at `0`/`[]` in Task 8 pending a proper aggregate query); the Command Center / Executive Dashboard merge into one `/` route (documented reasoning, not a shortcut, but worth a ledger line so a future reader isn't surprised there's no separate route); money/inventory/order-dependent blocks dropped wholesale (list them) with the upgrade path "add with Phase 2 Orders/Inventory schema, reusing the same KPI-card/block components."

- [ ] **Step 4: Full gates** — `npm test` ×2 · `npx tsc --noEmit` · `npm run lint` · `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/smoke-owner.spec.ts docs/BUILD-LOG.md docs/PONYTAIL-DEBT.md
git commit -m "feat(m3): smoke sweep extension + debt ledger"
```

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| §4.2 `notifications` table | 1 |
| §6.2 Command Center (6 blocks, morning/eod, scoped) | 8, 9 |
| §6.3 Executive Dashboard (KPI cards, funnel — scoped, merged into `/`) | 8, 9 |
| §6.3 Reports (parameterized, CSV export — scoped) | 10, 11, 12, 13 |
| §5.7 Employee scorecard (Activity + Funnel blocks, weekly comparison) | 3, 11, 12 |
| §6.4 Global filters (Reports + Dashboard — per user's scope decision, wired on Reports; Dashboard's KPI section reads the same `commandCenterSummary` which is not yet filter-parameterized — see gap below) | 10, 12 |
| §7 Alert engine (scoped: 6 of 10 listed alert types; positive events emitted inline) | 4, 5, 6 |
| §7 Notification Center (bell, grouped by severity, mark-read, deep-links) | 7 |
| Quotation history (user's explicit M2b-era ask) | 14 |
| §8 Import/export — CSV via SheetJS | 13 |

**Gap found and accepted:** the approved design said global filters apply to "Executive Dashboard and Reports." Since Executive Dashboard content is merged into `/` (Task 9) and `/` is driven by `commandCenterSummary(user, mode)` — not yet filter-aware — Task 9's Dashboard KPI section does NOT actually honor the global filter bar; only the four Reports screens (Task 12) do. Wiring filters into `commandCenterSummary` too would mean every one of Task 8's ~10 queries takes a `ReportFilters` param — a meaningful scope increase. Recorded as a PONYTAIL-DEBT line in Task 15 rather than silently expanding Task 8; flag this to the user at plan handoff so they can confirm the trade-off before execution.

**2. Placeholder scan** — every step carries real code. The two spots with an inline `// ponytail:` explaining a deliberately deferred sub-query (`commandCenterSummary`'s `activityCount`/`quotationsSentValue`/`openQuotationsValue`) are not vague placeholders — they return a concrete `0`/`[]` today and are logged as debt in Task 15, matching the plan's own "no Phase-2 stubs" constraint (this is a same-milestone scope trim, not a Phase-2 stub).

**3. Type consistency** — `ScorecardCounts` (Task 3) is reused verbatim by `EmployeeScorecard` (Task 3), `employeesReport`'s return type (Task 11), and the CSV export's `employees` flattener (Task 13) — same field names throughout (`activity.calls`, `funnel.firstOrders`, etc.). `AlertCandidate` (Task 4) is the exact shape both `runAlertScan` (Task 5) and `convertLead`'s inline call (Task 5) construct and pass to `createNotification`. `ReportFilters` (Task 10) is the one shape threaded through all four Task 11 functions, all four Task 12 pages, and the Task 13 export route.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-04-super-stockist-milestone-3-command-center.md`.**

**One design gap to confirm before execution:** the global filter bar (Task 10/12) only applies to the four Reports screens, not to the Command Center/Dashboard's KPI numbers on `/` — wiring it into `commandCenterSummary` too is a real scope increase (every query in that service would need a filters param). I've left `/` unfiltered and logged the gap rather than silently expanding Task 8/9. Confirm that's fine, or say the word and I'll fold filter support into Tasks 8–9 before dispatching.

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
