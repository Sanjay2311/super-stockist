# Milestone 2b — Distributors, Quotations, Price Approval, Schemes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Distributor Master, manual lead→distributor conversion with a real territory-exclusivity check, Quotations with the spec §16 price-approval ladder, and basic Schemes (FLAT_DISCOUNT / QTY_SCHEME / DISTRIBUTOR_INCENTIVE) that auto-apply to quotation lines.

**Architecture:** Same layering as M1/M2a — pure calc in `src/domain/*` (no framework/DB imports), all DB access behind `src/server/services/*`, Server Actions in `src/app/(app)/<feature>/actions.ts` call only services, `writeAudit` on every mutation, money as integer paise, soft-delete + `is_demo` flags. Three new migrations (0009 distributors, 0010 quotations/items/approvals, 0011 schemes/applications). Two new pure domain modules (`quote`, `scheme`). Quotation is a priced proposal document in M2b: manual status transitions + an HTML print view + a copy-to-WhatsApp text block; it feeds nothing downstream until Phase 2 Orders.

**Tech Stack:** Next.js 15 App Router (RSC + Server Actions), Drizzle ORM over postgres.js, Postgres 16, zod v4, Vitest (serial), Playwright (`describe.skip` except the manual smoke sweep), Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-31-super-stockist-design.md` — §4.4 (Distributor master), §4.6 (Quotations / price approval / schemes), §5.5 (activation & conversion), §13 (territory exclusivity rule), §16 (price approval ladder), §3.5 (conventions), §11 (accepted ponytail debt).

## Global Constraints

- **Money = integer paise.** Every rupee value from a form is `rupees(Number(v))` before it reaches a service; every column is `bigint({ mode: 'number' })`.
- **Domain purity.** `src/domain/*` imports only `./money` and other `src/domain/*` modules — never Drizzle, Next, zod, or a service.
- **DB access boundary.** Only `src/server/services/*` and `src/server/db/*` import `@/server/db/client`. Server Actions and pages call services, never Drizzle.
- **Audit every mutation.** `writeAudit(user, entityType, entityId, action, oldValues, newValues)` after each insert/update/delete in a service.
- **Permission gate.** Every mutating service method starts with `assertCan(user, '<action>')`. Every new action is added to the `Action` union AND both `OWNER_ACTIONS` / `SALES_ACTIONS` lists in `src/server/auth/permissions.ts`.
- **SALES cost redaction is an allow-list.** `stripFinancial(user, row, fields)` keeps `fields` only when `can(user, 'product.viewCost')` (OWNER only). Any new read path carrying a floor/target/cost figure must pass through it.
- **zod v4.** `z.uuid()`, `z.email()`, `z.enum([...] as const)`. Use `z.input<typeof schema>` for the caller-facing `*Input` type when the schema has `.default()`.
- **Soft-delete + demo flag.** New relationship/financial tables get `deletedAt timestamp` and `isDemo boolean NOT NULL DEFAULT false`.
- **Migrations live in `./drizzle`.** Generate with `npm run db:generate`, apply with `npm run db:migrate`. Hand-append CHECK constraints at the end of the generated `.sql` with a `-- hand-appended` comment (drizzle-kit does not emit them) — precedent: `drizzle/0003_shiny_pride.sql` `activities_target_ck`.
- **en-IN / INR / Asia/Kolkata.** Display via `formatINR` from `@/domain/money`.
- **Per-task gates (Definition of Done, spec §9):** `npm test` green twice in a row · `npx tsc --noEmit` clean · `npm run lint` clean · `npm run build` clean · one focused commit · BUILD-LOG entry · PONYTAIL-DEBT updated if a shortcut was taken.
- **e2e stays `describe.skip`** (no local Supabase Auth). The only runnable spec is `tests/e2e/smoke-owner.spec.ts` (manual, via the `DEV_LOGIN_EMAIL` hatch).

---

## File Structure

**New — schema (`src/server/db/schema/`)**
- `distributor.ts` — `distributors` table. Registered in `schema/index.ts`.
- `quotation.ts` — `quotations`, `quotationItems`, `priceApprovals` tables. Registered in `schema/index.ts`.
- `scheme.ts` — `schemes`, `schemeApplications` tables. Registered in `schema/index.ts`.

**New — migrations (`drizzle/`)**
- `0009_*.sql` — `distributors`.
- `0010_*.sql` — `quotations` + `quotation_items` + `price_approvals` + hand-appended `quotations_party_ck`.
- `0011_*.sql` — `schemes` + `scheme_applications`.

**New — domain (`src/domain/`)**
- `quote.ts` — `classifyRate`, `computeQuoteLine`, `quoteTotals`. Pure.
- `scheme.ts` — types `SchemeDef` / `SchemeBenefit` / `SchemeContext`, `isSchemeEligible`, `schemeBenefitPaise`. Pure.

**New — services (`src/server/services/`)**
- `distributor.ts` — `listDistributors`, `getDistributor`, `updateDistributor`, `convertLead`, redaction helpers.
- `quotation.ts` — `createQuotation`, `getQuotation`, `listQuotations`, `submitQuotation`, `decideApproval`, `listPendingApprovals`, `setQuotationStatus`, redaction helpers.
- `scheme.ts` — `listSchemes`, `getScheme`, `createScheme`, `updateScheme`, `activeSchemesFor`.

**New — screens (`src/app/(app)/`)**
- `distributors/page.tsx` · `distributors/[id]/page.tsx` · `distributors/[id]/actions.ts`
- `leads/[id]/convert-form.tsx` (client) — new; `leads/[id]/actions.ts` gains `convertToDistributor`; `leads/[id]/page.tsx` mounts the panel.
- `quotations/page.tsx` · `quotations/new/page.tsx` · `quotations/new/quote-builder.tsx` (client) · `quotations/[id]/page.tsx` · `quotations/[id]/print/page.tsx` · `quotations/actions.ts`
- `approvals/page.tsx` · `approvals/actions.ts`
- `schemes/page.tsx` · `schemes/scheme-form.tsx` (client) · `schemes/actions.ts`

**Modified**
- `src/lib/schemas.ts` — `distributorSchema`, `convertLeadSchema`, `quotationSchema`, `schemeSchema` + their enum consts.
- `src/server/auth/permissions.ts` — 9 new actions.
- `src/server/services/config.ts` — `priceApprovalRequired: true` in `CONFIG_DEFAULTS` + its `satisfies` type.
- `src/server/services/territory.ts` — replace the `overlapsExclusive` stub with the real query.
- `src/server/db/schema/index.ts` — 3 new re-exports.
- `src/components/app-nav.tsx` — 4 new nav items.
- `src/server/db/seed.ts` — `seedDemo` / `purgeDemo` gain distributors, schemes, a quotation.
- `tests/e2e/smoke-owner.spec.ts` — convert → quote → approve → scheme steps.
- `docs/BUILD-LOG.md`, `docs/PONYTAIL-DEBT.md`.

**New — tests (`tests/`)**
- `tests/services/territory-exclusivity.test.ts`
- `tests/services/distributor.test.ts`
- `tests/domain/quote.test.ts`
- `tests/domain/scheme.test.ts`
- `tests/services/scheme.test.ts`
- `tests/services/quotation.test.ts`

---

### Task 1: `distributors` schema + migration 0009 + real `overlapsExclusive`

**Files:**
- Create: `src/server/db/schema/distributor.ts`
- Modify: `src/server/db/schema/index.ts` (add `export * from './distributor';`)
- Create: `drizzle/0009_*.sql` (generated)
- Modify: `src/server/services/territory.ts:91-102` (replace the stub)
- Test: `tests/services/territory-exclusivity.test.ts`

**Interfaces:**
- Consumes: `territories` schema, `ancestorIds(orgId, territoryId)` / `descendantIds(orgId, territoryId)` from `@/server/services/territory` (already exist, return `string[]`).
- Produces:
  - `distributors` table (`typeof distributors.$inferSelect` shape below).
  - `overlapsExclusive(orgId: string, territoryId: string, excludeDistributorId?: string): Promise<boolean>` — true when another non-deleted distributor with `exclusive = true` and `status ∈ {'APPROVED','ACTIVE'}` holds a territory that equals, is an ancestor of, or is a descendant of `territoryId`.

- [ ] **Step 1: Write the failing test**

`tests/services/territory-exclusivity.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { territories } from '@/server/db/schema/territory';
import { distributors } from '@/server/db/schema/distributor';
import { overlapsExclusive } from '@/server/services/territory';

beforeAll(migrateTestDb);
beforeEach(resetDb);

async function tree(orgId: string) {
  const [zone] = await testDb.insert(territories).values({ orgId, name: 'East', type: 'ZONE', parentId: null }).returning();
  const [area] = await testDb.insert(territories).values({ orgId, name: 'Whitefield', type: 'AREA', parentId: zone.id }).returning();
  const [pin] = await testDb.insert(territories).values({ orgId, name: '560066', type: 'PINCODE', parentId: area.id }).returning();
  const [other] = await testDb.insert(territories).values({ orgId, name: 'Indiranagar', type: 'AREA', parentId: zone.id }).returning();
  return { zone, area, pin, other };
}

describe('overlapsExclusive', () => {
  it('is false when no exclusive distributor holds any overlapping territory', async () => {
    const { orgId } = await seedBase();
    const { area } = await tree(orgId);
    expect(await overlapsExclusive(orgId, area.id)).toBe(false);
  });

  it('is true on an exact-territory clash with an active exclusive distributor', async () => {
    const { orgId } = await seedBase();
    const { area } = await tree(orgId);
    await testDb.insert(distributors).values({
      orgId, businessName: 'X', contactPerson: 'x', phone: '9800000000',
      territoryId: area.id, exclusive: true, status: 'ACTIVE',
    });
    expect(await overlapsExclusive(orgId, area.id)).toBe(true);
  });

  it('is true when the requested territory sits UNDER a territory held exclusively (ancestor clash)', async () => {
    const { orgId } = await seedBase();
    const { area, pin } = await tree(orgId);
    await testDb.insert(distributors).values({
      orgId, businessName: 'X', contactPerson: 'x', phone: '9800000000',
      territoryId: area.id, exclusive: true, status: 'APPROVED',
    });
    expect(await overlapsExclusive(orgId, pin.id)).toBe(true);
  });

  it('is true when the requested territory CONTAINS a territory held exclusively (descendant clash)', async () => {
    const { orgId } = await seedBase();
    const { area, pin } = await tree(orgId);
    await testDb.insert(distributors).values({
      orgId, businessName: 'X', contactPerson: 'x', phone: '9800000000',
      territoryId: pin.id, exclusive: true, status: 'ACTIVE',
    });
    expect(await overlapsExclusive(orgId, area.id)).toBe(true);
  });

  it('ignores a sibling territory, a non-exclusive holder, a closed distributor, and the excluded distributor itself', async () => {
    const { orgId } = await seedBase();
    const { area, other } = await tree(orgId);
    const [sibling] = await testDb.insert(distributors).values({
      orgId, businessName: 'Sib', contactPerson: 'x', phone: '9800000000',
      territoryId: other.id, exclusive: true, status: 'ACTIVE',
    }).returning();
    await testDb.insert(distributors).values({
      orgId, businessName: 'NonExcl', contactPerson: 'x', phone: '9800000001',
      territoryId: area.id, exclusive: false, status: 'ACTIVE',
    });
    await testDb.insert(distributors).values({
      orgId, businessName: 'Closed', contactPerson: 'x', phone: '9800000002',
      territoryId: area.id, exclusive: true, status: 'CLOSED',
    });
    const [self] = await testDb.insert(distributors).values({
      orgId, businessName: 'Self', contactPerson: 'x', phone: '9800000003',
      territoryId: area.id, exclusive: true, status: 'ACTIVE',
    }).returning();
    void sibling;
    expect(await overlapsExclusive(orgId, area.id, self.id)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — fails to compile (`distributor` schema + real fn absent)**

Run: `npx vitest run tests/services/territory-exclusivity.test.ts`
Expected: FAIL — cannot find module `@/server/db/schema/distributor`.

- [ ] **Step 3: Create the schema module**

`src/server/db/schema/distributor.ts`:

```ts
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
```

Add to `src/server/db/schema/index.ts`, after the `./crm` line:

```ts
export * from './distributor';
```

- [ ] **Step 4: Replace the `overlapsExclusive` stub**

In `src/server/services/territory.ts`: add imports at the top —

```ts
import { and, eq, isNull, asc, inArray } from 'drizzle-orm';
import { distributors } from '@/server/db/schema/distributor';
```

Replace the stub block (`src/server/services/territory.ts:91-102`) with:

```ts
// spec §13: a territory clashes when another ACTIVE exclusive distributor holds a
// territory that equals, contains (ancestor), or sits under (descendant) the target.
const EXCLUSIVE_BLOCKING_STATUSES = ['APPROVED', 'ACTIVE'] as const;

export async function overlapsExclusive(
  orgId: string,
  territoryId: string,
  excludeDistributorId?: string,
): Promise<boolean> {
  const [anc, desc] = await Promise.all([
    ancestorIds(orgId, territoryId),
    descendantIds(orgId, territoryId),
  ]);
  const scope = new Set<string>([territoryId, ...anc, ...desc]);
  const rows = await db
    .select({ id: distributors.id, territoryId: distributors.territoryId })
    .from(distributors)
    .where(and(
      eq(distributors.orgId, orgId),
      isNull(distributors.deletedAt),
      eq(distributors.exclusive, true),
      inArray(distributors.status, [...EXCLUSIVE_BLOCKING_STATUSES]),
    ));
  return rows.some(
    (d) => d.territoryId != null && scope.has(d.territoryId) && d.id !== excludeDistributorId,
  );
}
```

Delete the `/* eslint-disable ... */` wrapper that guarded the old stub.

- [ ] **Step 5: Generate the migration**

Run: `npm run db:generate`
Expected: `drizzle/0009_*.sql` created with `CREATE TABLE "distributors" (...)` + the three indexes. No hand-append needed for this migration.

- [ ] **Step 6: Run the test — passes**

Run: `npx vitest run tests/services/territory-exclusivity.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Full gates**

Run: `npm test` (twice) · `npx tsc --noEmit` · `npm run lint` · `npm run build`
Expected: all green. (`resetDb` truncates every public table including the new `distributors`, so no test-isolation change is needed.)

- [ ] **Step 8: Commit**

```bash
git add src/server/db/schema/distributor.ts src/server/db/schema/index.ts src/server/services/territory.ts drizzle/0009_* tests/services/territory-exclusivity.test.ts
git commit -m "feat(m2b): distributors table + real overlapsExclusive territory check"
```

---

### Task 2: `distributor` service — list / get / update + redaction + permissions

**Files:**
- Modify: `src/lib/schemas.ts` (add `DISTRIBUTOR_STATUSES`, `distributorSchema`, `DistributorInput`)
- Modify: `src/server/auth/permissions.ts` (add `distributor.view` / `distributor.create` / `distributor.edit`)
- Create: `src/server/services/distributor.ts`
- Test: `tests/services/distributor.test.ts`

**Interfaces:**
- Consumes: `distributors` schema (Task 1), `patchOnly` from `@/lib/patch`, `assertCan` / `stripFinancial` from `@/server/auth/permissions`, `writeAudit` from `./audit`.
- Produces:
  - `type DistributorRow = typeof distributors.$inferSelect`
  - `DISTRIBUTOR_FINANCIAL_FIELDS: (keyof DistributorRow)[]` — `[]` in M2b (credit limit is not a cost field; kept as the redaction hook for later).
  - `redactDistributor(user, row)` / `redactDistributors(user, rows)`
  - `listDistributors(orgId, opts?: { status?: string; territoryId?: string; q?: string }): Promise<DistributorRow[]>`
  - `getDistributor(orgId, id): Promise<DistributorRow | null>`
  - `updateDistributor(user, id, input: Partial<DistributorInput>): Promise<DistributorRow>` — `patchOnly`; when `territoryId` or `exclusive` changes to an exclusive assignment, re-runs `overlapsExclusive(orgId, territoryId, id)` and throws `Error('EXCLUSIVITY_CONFLICT')` unless `input.overrideReason` is a non-empty string (then persists it to `exclusivityNote` + audits `exclusivity_override`).

- [ ] **Step 1: Write the failing test**

`tests/services/distributor.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { territories } from '@/server/db/schema/territory';
import { distributors } from '@/server/db/schema/distributor';
import { auditLog } from '@/server/db/schema/audit';
import { listDistributors, getDistributor, updateDistributor } from '@/server/services/distributor';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'u-owner', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });
const sales = (orgId: string): AppUser => ({ id: 'u-sales', email: 's', name: 'S', role: 'SALES', employeeId: null, orgId });

async function seedDist(orgId: string, over: Partial<typeof distributors.$inferInsert> = {}) {
  const [d] = await testDb.insert(distributors).values({
    orgId, businessName: 'Coastal Trading', contactPerson: 'W. Salian', phone: '9845000001',
    status: 'APPROVED', grade: 'A', ...over,
  }).returning();
  return d;
}

describe('distributor service', () => {
  it('lists and gets, org-scoped, hiding soft-deleted rows', async () => {
    const { orgId } = await seedBase();
    const d = await seedDist(orgId);
    expect((await listDistributors(orgId)).map((x) => x.id)).toContain(d.id);
    expect((await getDistributor(orgId, d.id))?.businessName).toBe('Coastal Trading');
    await testDb.update(distributors).set({ deletedAt: new Date() }).where(eq(distributors.id, d.id));
    expect(await getDistributor(orgId, d.id)).toBeNull();
  });

  it('filters the list by status', async () => {
    const { orgId } = await seedBase();
    await seedDist(orgId, { status: 'ACTIVE' });
    await seedDist(orgId, { businessName: 'Other', status: 'SUSPENDED' });
    expect((await listDistributors(orgId, { status: 'ACTIVE' })).length).toBe(1);
  });

  it('updateDistributor patches only supplied fields and writes an audit row; SALES is forbidden', async () => {
    const { orgId } = await seedBase();
    const d = await seedDist(orgId);
    await expect(updateDistributor(sales(orgId), d.id, { creditDays: 30 })).rejects.toThrow('forbidden');
    const up = await updateDistributor(owner(orgId), d.id, { creditLimit: 50000000, creditDays: 30 });
    expect(up.creditLimit).toBe(50000000);
    expect(up.creditDays).toBe(30);
    expect(up.businessName).toBe('Coastal Trading'); // untouched
    const rows = await testDb.select().from(auditLog).where(eq(auditLog.entityType, 'distributor'));
    expect(rows.length).toBe(1);
  });

  it('blocks an exclusive territory clash on update unless an override reason is given', async () => {
    const { orgId } = await seedBase();
    const [zone] = await testDb.insert(territories).values({ orgId, name: 'East', type: 'ZONE', parentId: null }).returning();
    const [area] = await testDb.insert(territories).values({ orgId, name: 'Whitefield', type: 'AREA', parentId: zone.id }).returning();
    await seedDist(orgId, { businessName: 'Incumbent', territoryId: area.id, exclusive: true, status: 'ACTIVE' });
    const mover = await seedDist(orgId, { businessName: 'Mover' });

    await expect(
      updateDistributor(owner(orgId), mover.id, { territoryId: area.id, exclusive: true }),
    ).rejects.toThrow('EXCLUSIVITY_CONFLICT');

    const ok = await updateDistributor(owner(orgId), mover.id, {
      territoryId: area.id, exclusive: true, overrideReason: 'Split retail vs HoReCa channel, agreed with F&F',
    });
    expect(ok.territoryId).toBe(area.id);
    expect(ok.exclusivityNote).toMatch(/HoReCa/);
    const rows = await testDb.select().from(auditLog).where(eq(auditLog.action, 'exclusivity_override'));
    expect(rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run it — fails**

Run: `npx vitest run tests/services/distributor.test.ts`
Expected: FAIL — cannot find `@/server/services/distributor`.

- [ ] **Step 3: Add the zod schema + enum**

In `src/lib/schemas.ts`, after the CRM section, add:

```ts
// ── Distributor master (spec §4.4) ─────────────────────────────────────────
export const DISTRIBUTOR_STATUSES = ['PROSPECT', 'APPROVED', 'ACTIVE', 'TEMP_INACTIVE', 'SUSPENDED', 'CLOSED'] as const;
export const DISTRIBUTOR_GRADES = ['A', 'B', 'C'] as const;

export const distributorSchema = z.object({
  businessName: z.string().min(2).max(160),
  contactPerson: z.string().min(2).max(120),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'),
  email: z.email().optional().or(z.literal('')),
  address: z.string().max(400).optional().or(z.literal('')),
  territoryId: z.uuid().nullable().optional(),
  exclusive: z.boolean().optional(),
  assignedEmployeeId: z.uuid().nullable().optional(),
  status: z.enum(DISTRIBUTOR_STATUSES).optional(),
  grade: z.enum(DISTRIBUTOR_GRADES).nullable().optional(),
  creditLimit: z.coerce.number().int().min(0).optional(),            // paise
  creditDays: z.coerce.number().int().min(0).max(365).optional(),
  paymentTerms: z.string().max(200).optional().or(z.literal('')),
  expectedMonthlyPurchase: z.coerce.number().int().min(0).optional(), // paise
  reviewDate: z.coerce.date().nullable().optional(),
  agreementStatus: z.string().max(80).optional().or(z.literal('')),
  // not a column — signals an accepted §13 exclusivity override on updateDistributor
  overrideReason: z.string().max(500).optional().or(z.literal('')),
});
export type DistributorInput = z.infer<typeof distributorSchema>;
```

- [ ] **Step 4: Add the permission actions**

In `src/server/auth/permissions.ts`:

- `Action` union — add `| 'distributor.view' | 'distributor.create' | 'distributor.edit'`
- `OWNER_ACTIONS` — add all three
- `SALES_ACTIONS` — add `'distributor.view', 'distributor.create'` (SALES converts leads it owns; it cannot edit a distributor master or override exclusivity)

- [ ] **Step 5: Write the service**

`src/server/services/distributor.ts`:

```ts
import { and, asc, eq, ilike, isNull, or } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { distributors } from '@/server/db/schema/distributor';
import { distributorSchema, type DistributorInput } from '@/lib/schemas';
import { patchOnly } from '@/lib/patch';
import { assertCan, stripFinancial } from '@/server/auth/permissions';
import { overlapsExclusive } from './territory';
import { writeAudit } from './audit';
import type { AppUser } from '@/server/auth/session';

export type DistributorRow = typeof distributors.$inferSelect;

// No cost columns on a distributor read in M2b. Kept as the redaction hook so a
// future cost/margin field is added here AND every wired read path stays covered.
export const DISTRIBUTOR_FINANCIAL_FIELDS: (keyof DistributorRow)[] = [];

export function redactDistributor(user: AppUser, row: DistributorRow): DistributorRow {
  return stripFinancial(user, row, DISTRIBUTOR_FINANCIAL_FIELDS);
}
export function redactDistributors(user: AppUser, rows: DistributorRow[]): DistributorRow[] {
  return rows.map((r) => redactDistributor(user, r));
}

function clean<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
  return out as T;
}

export async function listDistributors(
  orgId: string,
  opts: { status?: string; territoryId?: string; q?: string } = {},
): Promise<DistributorRow[]> {
  const conds = [eq(distributors.orgId, orgId), isNull(distributors.deletedAt)];
  if (opts.status) conds.push(eq(distributors.status, opts.status));
  if (opts.territoryId) conds.push(eq(distributors.territoryId, opts.territoryId));
  if (opts.q) {
    const like = `%${opts.q}%`;
    conds.push(or(ilike(distributors.businessName, like), ilike(distributors.contactPerson, like), ilike(distributors.phone, like))!);
  }
  return db.select().from(distributors).where(and(...conds)).orderBy(asc(distributors.businessName));
}

export async function getDistributor(orgId: string, id: string): Promise<DistributorRow | null> {
  const [row] = await db.select().from(distributors)
    .where(and(eq(distributors.id, id), eq(distributors.orgId, orgId), isNull(distributors.deletedAt)));
  return row ?? null;
}

export async function updateDistributor(
  user: AppUser,
  id: string,
  input: Partial<DistributorInput>,
): Promise<DistributorRow> {
  assertCan(user, 'distributor.edit');
  const [before] = await db.select().from(distributors)
    .where(and(eq(distributors.id, id), eq(distributors.orgId, user.orgId)));
  if (!before) throw new Error('not found');

  const { overrideReason, ...rest } = input;
  const data = patchOnly(rest, distributorSchema.omit({ overrideReason: true }).partial().parse(rest));

  const nextTerritoryId = 'territoryId' in data ? (data.territoryId ?? null) : before.territoryId;
  const nextExclusive = 'exclusive' in data ? !!data.exclusive : before.exclusive;
  const nextStatus = 'status' in data ? data.status! : before.status;
  const territoryOrExclusivityChanged =
    nextTerritoryId !== before.territoryId || nextExclusive !== before.exclusive;

  let exclusivityNote: string | null | undefined;
  if (nextExclusive && nextTerritoryId && territoryOrExclusivityChanged
      && ['APPROVED', 'ACTIVE'].includes(nextStatus)) {
    const clash = await overlapsExclusive(user.orgId, nextTerritoryId, id);
    if (clash) {
      if (!overrideReason) throw new Error('EXCLUSIVITY_CONFLICT');
      exclusivityNote = overrideReason;
    }
  }

  const [row] = await db.update(distributors).set({
    ...clean(data),
    ...(exclusivityNote !== undefined ? { exclusivityNote } : {}),
    updatedAt: new Date(),
  }).where(eq(distributors.id, id)).returning();

  await writeAudit(user, 'distributor', id, exclusivityNote ? 'exclusivity_override' : 'update', before, row);
  return row;
}
```

- [ ] **Step 6: Run the test — passes**

Run: `npx vitest run tests/services/distributor.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Full gates**

Run: `npm test` (twice) · `npx tsc --noEmit` · `npm run lint` · `npm run build`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/schemas.ts src/server/auth/permissions.ts src/server/services/distributor.ts tests/services/distributor.test.ts
git commit -m "feat(m2b): distributor service (list/get/update) + exclusivity guard on update"
```

---

### Task 3: `convertLead` — manual lead→distributor conversion

**Files:**
- Modify: `src/lib/schemas.ts` (add `convertLeadSchema`, `ConvertLeadInput`)
- Modify: `src/server/services/distributor.ts` (add `convertLead`)
- Test: `tests/services/distributor.test.ts` (extend)

**Interfaces:**
- Consumes: `getLead` from `@/server/services/lead`, `addActivity` from `@/server/services/activity`, `overlapsExclusive` from `@/server/services/territory`, `distributorLeads` schema.
- Produces:
  - `convertLead(user: AppUser, leadId: string, input: ConvertLeadInput): Promise<DistributorRow>`
    - `assertCan(user, 'distributor.create')`
    - loads the lead (org-scoped); throws `Error('not found')` if absent
    - throws `Error('LEAD_NOT_CONVERTIBLE')` unless `lead.stage ∈ {'APPROVED','APPOINTED'}` and `lead.convertedDistributorId == null`
    - if `input.territoryId` and `input.exclusive`: `overlapsExclusive(orgId, territoryId)` → on clash, `Error('EXCLUSIVITY_CONFLICT')` unless `input.overrideReason` non-empty AND `user.role === 'OWNER'` (SALES can never override — `Error('EXCLUSIVITY_OVERRIDE_REQUIRES_OWNER')`); on accepted override, set `exclusivityNote` + audit `exclusivity_override`
    - inserts a `distributors` row: `status = 'APPROVED'`, `grade = lead.grade` (only if `∈ {'A','B','C'}`, else null), `appointmentDate = today (YYYY-MM-DD)`, `sourceLeadId = leadId`, copies `businessName / contactPerson / phone / email / address` from the lead, applies the form's territory / credit / terms fields
    - updates the lead: `convertedDistributorId = <new id>`, and if `stage === 'APPROVED'` bumps `stage → 'APPOINTED'` with `probability` from `getConfig(orgId, 'stageProbability').APPOINTED`
    - `addActivity(user, { leadId, type: 'OTHER', outcome: 'Converted to distributor' })`
    - `writeAudit(user, 'distributor', id, 'convert', { leadId }, row)` and `writeAudit(user, 'lead', leadId, 'convert', { stage: before.stage }, { stage: after.stage, convertedDistributorId })`

- [ ] **Step 1: Add the schema**

In `src/lib/schemas.ts`:

```ts
export const convertLeadSchema = z.object({
  territoryId: z.uuid().nullable().optional(),
  exclusive: z.boolean().optional(),
  assignedEmployeeId: z.uuid().nullable().optional(),
  creditLimit: z.coerce.number().int().min(0).default(0),            // paise
  creditDays: z.coerce.number().int().min(0).max(365).default(0),
  paymentTerms: z.string().max(200).optional().or(z.literal('')),
  expectedMonthlyPurchase: z.coerce.number().int().min(0).default(0), // paise
  overrideReason: z.string().max(500).optional().or(z.literal('')),
});
export type ConvertLeadInput = z.input<typeof convertLeadSchema>;
```

- [ ] **Step 2: Write the failing tests (extend `tests/services/distributor.test.ts`)**

Add imports: `import { convertLead } from '@/server/services/distributor';`, `import { getLead } from '@/server/services/lead';`, `import { distributorLeads } from '@/server/db/schema/crm';`.

```ts
describe('convertLead', () => {
  async function seedLead(orgId: string, over: Partial<typeof distributorLeads.$inferInsert> = {}) {
    const [l] = await testDb.insert(distributorLeads).values({
      orgId, businessName: 'Prime Retail', contactPerson: 'J. Acharya', phone: '9845010016',
      stage: 'APPROVED', grade: 'A', score: 82, ...over,
    }).returning();
    return l;
  }

  it('creates an APPROVED distributor, links the lead, and bumps the stage to APPOINTED', async () => {
    const { orgId } = await seedBase();
    const lead = await seedLead(orgId);
    const d = await convertLead(owner(orgId), lead.id, { creditLimit: 100000000, creditDays: 21 });
    expect(d.status).toBe('APPROVED');
    expect(d.grade).toBe('A');
    expect(d.sourceLeadId).toBe(lead.id);
    expect(d.creditLimit).toBe(100000000);
    const after = await getLead(orgId, lead.id);
    expect(after?.convertedDistributorId).toBe(d.id);
    expect(after?.stage).toBe('APPOINTED');
  });

  it('refuses a lead that is not APPROVED/APPOINTED, and refuses a second conversion', async () => {
    const { orgId } = await seedBase();
    const early = await seedLead(orgId, { stage: 'NEGOTIATION' });
    await expect(convertLead(owner(orgId), early.id, {})).rejects.toThrow('LEAD_NOT_CONVERTIBLE');
    const lead = await seedLead(orgId, { businessName: 'Twice' });
    await convertLead(owner(orgId), lead.id, {});
    await expect(convertLead(owner(orgId), lead.id, {})).rejects.toThrow('LEAD_NOT_CONVERTIBLE');
  });

  it('blocks an exclusive clash; OWNER may override with a reason, SALES may not', async () => {
    const { orgId } = await seedBase();
    const [zone] = await testDb.insert(territories).values({ orgId, name: 'East', type: 'ZONE', parentId: null }).returning();
    const [area] = await testDb.insert(territories).values({ orgId, name: 'Whitefield', type: 'AREA', parentId: zone.id }).returning();
    await seedDist(orgId, { businessName: 'Incumbent', territoryId: area.id, exclusive: true, status: 'ACTIVE' });

    const l1 = await seedLead(orgId, { businessName: 'Blocked' });
    await expect(
      convertLead(owner(orgId), l1.id, { territoryId: area.id, exclusive: true }),
    ).rejects.toThrow('EXCLUSIVITY_CONFLICT');

    const l2 = await seedLead(orgId, { businessName: 'SalesTry' });
    await expect(
      convertLead(sales(orgId), l2.id, { territoryId: area.id, exclusive: true, overrideReason: 'x' }),
    ).rejects.toThrow('EXCLUSIVITY_OVERRIDE_REQUIRES_OWNER');

    const l3 = await seedLead(orgId, { businessName: 'OwnerOverride' });
    const d = await convertLead(owner(orgId), l3.id, {
      territoryId: area.id, exclusive: true, overrideReason: 'Channel split agreed with F&F',
    });
    expect(d.exclusivityNote).toMatch(/Channel split/);
  });
});
```

- [ ] **Step 3: Run — fails**

Run: `npx vitest run tests/services/distributor.test.ts`
Expected: FAIL — `convertLead` is not exported.

- [ ] **Step 4: Implement `convertLead`**

Add to `src/server/services/distributor.ts` (imports first):

```ts
import { distributorLeads } from '@/server/db/schema/crm';
import { convertLeadSchema, type ConvertLeadInput, DISTRIBUTOR_GRADES } from '@/lib/schemas';
import { getConfig } from './config';
import { getLead } from './lead';
import { addActivity } from './activity';
```

```ts
const CONVERTIBLE_STAGES = ['APPROVED', 'APPOINTED'];
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function convertLead(
  user: AppUser,
  leadId: string,
  input: ConvertLeadInput,
): Promise<DistributorRow> {
  assertCan(user, 'distributor.create');
  const form = convertLeadSchema.parse(input);

  const lead = await getLead(user.orgId, leadId);
  if (!lead) throw new Error('not found');
  if (!CONVERTIBLE_STAGES.includes(lead.stage) || lead.convertedDistributorId) {
    throw new Error('LEAD_NOT_CONVERTIBLE');
  }

  let exclusivityNote: string | null = null;
  if (form.exclusive && form.territoryId) {
    const clash = await overlapsExclusive(user.orgId, form.territoryId);
    if (clash) {
      if (!form.overrideReason) throw new Error('EXCLUSIVITY_CONFLICT');
      if (user.role !== 'OWNER') throw new Error('EXCLUSIVITY_OVERRIDE_REQUIRES_OWNER');
      exclusivityNote = form.overrideReason;
    }
  }

  const grade = DISTRIBUTOR_GRADES.includes(lead.grade as (typeof DISTRIBUTOR_GRADES)[number])
    ? lead.grade : null;

  const [row] = await db.insert(distributors).values({
    orgId: user.orgId,
    businessName: lead.businessName,
    contactPerson: lead.contactPerson,
    phone: lead.phone,
    email: lead.email,
    address: lead.address,
    territoryId: form.territoryId ?? null,
    exclusive: !!form.exclusive,
    exclusivityNote,
    assignedEmployeeId: form.assignedEmployeeId ?? lead.assignedEmployeeId ?? null,
    appointmentDate: ymd(new Date()),
    status: 'APPROVED',
    grade,
    creditLimit: form.creditLimit ?? 0,
    creditDays: form.creditDays ?? 0,
    paymentTerms: form.paymentTerms || null,
    expectedMonthlyPurchase: form.expectedMonthlyPurchase ?? 0,
    sourceLeadId: leadId,
  }).returning();

  const nextStage = lead.stage === 'APPROVED' ? 'APPOINTED' : lead.stage;
  const probMap = await getConfig(user.orgId, 'stageProbability');
  const [leadAfter] = await db.update(distributorLeads).set({
    convertedDistributorId: row.id,
    stage: nextStage,
    probability: probMap[nextStage as keyof typeof probMap],
    updatedAt: new Date(),
  }).where(eq(distributorLeads.id, leadId)).returning();

  await addActivity(user, { leadId, type: 'OTHER', outcome: 'Converted to distributor' });
  await writeAudit(user, 'distributor', row.id, exclusivityNote ? 'exclusivity_override' : 'convert', { leadId }, row);
  await writeAudit(user, 'lead', leadId, 'convert',
    { stage: lead.stage, convertedDistributorId: null },
    { stage: leadAfter.stage, convertedDistributorId: row.id });
  return row;
}
```

- [ ] **Step 5: Run — passes**

Run: `npx vitest run tests/services/distributor.test.ts`
Expected: PASS (7 tests total in the file).

- [ ] **Step 6: Full gates** — `npm test` ×2 · `tsc` · `lint` · `build`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/schemas.ts src/server/services/distributor.ts tests/services/distributor.test.ts
git commit -m "feat(m2b): convertLead — manual lead->distributor conversion with exclusivity override"
```

---

### Task 4: Distributors screens + nav

**Files:**
- Create: `src/app/(app)/distributors/page.tsx`
- Create: `src/app/(app)/distributors/[id]/page.tsx`
- Create: `src/app/(app)/distributors/[id]/actions.ts`
- Modify: `src/components/app-nav.tsx` (add `{ href: '/distributors', label: 'Distributors' }` after Leads)

**Interfaces:**
- Consumes: `listDistributors`, `getDistributor`, `redactDistributor`, `redactDistributors`, `updateDistributor` (Task 2); `listTerritories` from `@/server/services/territory`; `listActivities` — note it currently takes `(orgId, leadId)` and filters on `activities.leadId`. For M2b, add a sibling `listDistributorActivities(orgId, distributorId)` to `@/server/services/activity` (mirror `listActivities`, filter `eq(activities.distributorId, distributorId)`).
- Produces: no exported API — screens only.

**Pattern reference:** mirror `src/app/(app)/leads/page.tsx` (list + filter `<form action="/distributors">`) and `src/app/(app)/leads/[id]/page.tsx` (card sections + `action={saveX.bind(null, id)}`). Use `formatINR` for money, `.toFixed`-free integer rupee inputs (`defaultValue={row.creditLimit / 100}`), and `DISTRIBUTOR_STATUSES` for the status `<select>`.

- [ ] **Step 1: Add `listDistributorActivities` to the activity service**

In `src/server/services/activity.ts`, after `listActivities`:

```ts
export async function listDistributorActivities(orgId: string, distributorId: string): Promise<ActivityRow[]> {
  return db.select().from(activities)
    .where(and(eq(activities.orgId, orgId), eq(activities.distributorId, distributorId), isNull(activities.deletedAt)))
    .orderBy(desc(activities.occurredAt));
}
```

- [ ] **Step 2: List page**

`src/app/(app)/distributors/page.tsx` — server component:
- `const user = await requireUser();` then `if (!can(user, 'distributor.view')) redirect('/');`
- read `searchParams: Promise<{ q?: string; status?: string }>`
- `const rows = redactDistributors(user, await listDistributors(user.orgId, { q, status }));`
- filter `<form action="/distributors">` with a search `<input name="q">` and a `<select name="status" aria-label="Status">` (blank = all, then `DISTRIBUTOR_STATUSES`)
- table: Business (link to `/distributors/${r.id}`), Contact, Territory *(resolve names: also fetch `listTerritories` and build an id→name map)*, Status, Grade, Credit limit (`formatINR`), Assigned — empty-state row "No distributors yet. Convert an approved lead from its lead page."

- [ ] **Step 3: Detail page + actions**

`src/app/(app)/distributors/[id]/actions.ts`:

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { updateDistributor } from '@/server/services/distributor';
import { rupees } from '@/domain/money';
import { DISTRIBUTOR_STATUSES } from '@/lib/schemas';

export async function saveDistributor(id: string, formData: FormData) {
  const user = await requireUser();
  const text = (k: string) => {
    const v = formData.get(k);
    return v === null || v === '' ? undefined : String(v);
  };
  const status = text('status');
  await updateDistributor(user, id, {
    businessName: text('businessName'),
    contactPerson: text('contactPerson'),
    phone: text('phone'),
    email: text('email') ?? '',
    address: text('address') ?? '',
    territoryId: (formData.get('territoryId') || null) as string | null,
    exclusive: formData.get('exclusive') === 'on',
    assignedEmployeeId: (formData.get('assignedEmployeeId') || null) as string | null,
    status: status && (DISTRIBUTOR_STATUSES as readonly string[]).includes(status)
      ? (status as (typeof DISTRIBUTOR_STATUSES)[number]) : undefined,
    creditLimit: text('creditLimit') ? rupees(Number(text('creditLimit'))) : undefined,
    creditDays: text('creditDays'),
    paymentTerms: text('paymentTerms') ?? '',
    expectedMonthlyPurchase: text('expectedMonthlyPurchase')
      ? rupees(Number(text('expectedMonthlyPurchase'))) : undefined,
    agreementStatus: text('agreementStatus') ?? '',
    overrideReason: text('overrideReason') ?? '',
  });
  revalidatePath(`/distributors/${id}`);
}
```

`src/app/(app)/distributors/[id]/page.tsx` — server component, `notFound()` when `getDistributor` is null; `redactDistributor(user, found)`. Three cards, mirroring the lead detail layout:
1. **Master fields** — `<form action={saveDistributor.bind(null, id)}>`: business/contact/phone/email/address, territory `<select>` (from `listTerritories`), exclusive checkbox, assigned employee `<select>` (fetch employees via a small `listEmployees(orgId)` if one exists — otherwise omit the select and keep `assignedEmployeeId` read-only for M2b), status `<select>`, credit limit (₹), credit days, payment terms, expected monthly purchase (₹), agreement status, and a small `overrideReason` text input with helper text "Only needed if changing to an exclusive territory already held by another distributor."
2. **Exclusivity** — badge: if `d.exclusive` show "Exclusive · <territory name>"; if `d.exclusivityNote` show "Override on record: <note>".
3. **Timeline** — `listDistributorActivities(user.orgId, id)`, render read-only (reuse the `<ol>` markup from the lead page).

If `saveDistributor` throws `EXCLUSIVITY_CONFLICT`, the Server Action rejection surfaces as the default error overlay in dev — acceptable for M2b (the convert flow in Task 5 has the friendly banner). Add a `// ponytail:` note in the page that a friendly inline error on the distributor edit form is deferred to M3.

- [ ] **Step 4: Nav**

`src/components/app-nav.tsx` — insert `{ href: '/distributors', label: 'Distributors' }` into `NAV_ITEMS` right after the `/leads` entry.

- [ ] **Step 5: Gates**

Run: `npm test` (twice — unchanged count) · `npx tsc --noEmit` · `npm run lint` · `npm run build`
Expected: all green; `/distributors` and `/distributors/[id]` appear in the build route list.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/distributors src/components/app-nav.tsx src/server/services/activity.ts
git commit -m "feat(m2b): distributors list + master detail screens + nav"
```

---

### Task 5: Convert-to-Distributor panel on the lead detail page

**Files:**
- Create: `src/app/(app)/leads/[id]/convert-form.tsx` (client component)
- Modify: `src/app/(app)/leads/[id]/actions.ts` (add `convertToDistributor`)
- Modify: `src/app/(app)/leads/[id]/page.tsx` (mount the panel; fetch territories)

**Interfaces:**
- Consumes: `convertLead` (Task 3), `listTerritories`, `getLead`.
- Produces:
  - Server Action `convertToDistributor(id: string, formData: FormData): Promise<{ error: string } | void>` — parses the form, calls `convertLead`, and on success `redirect(\`/distributors/\${d.id}\`)`. On `EXCLUSIVITY_CONFLICT` returns `{ error: 'EXCLUSIVITY_CONFLICT' }` (so the client can reveal the override field); on `EXCLUSIVITY_OVERRIDE_REQUIRES_OWNER` returns `{ error: 'OWNER_ONLY' }`; rethrows anything else.

- [ ] **Step 1: The action**

Append to `src/app/(app)/leads/[id]/actions.ts`:

```ts
import { redirect } from 'next/navigation';
import { convertLead } from '@/server/services/distributor';
import { rupees } from '@/domain/money';

export async function convertToDistributor(id: string, formData: FormData) {
  const user = await requireUser();
  try {
    const d = await convertLead(user, id, {
      territoryId: (formData.get('territoryId') || null) as string | null,
      exclusive: formData.get('exclusive') === 'on',
      assignedEmployeeId: (formData.get('assignedEmployeeId') || null) as string | null,
      creditLimit: rupees(Number(formData.get('creditLimit') ?? 0)),
      creditDays: Number(formData.get('creditDays') ?? 0),
      paymentTerms: String(formData.get('paymentTerms') ?? ''),
      expectedMonthlyPurchase: rupees(Number(formData.get('expectedMonthlyPurchase') ?? 0)),
      overrideReason: String(formData.get('overrideReason') ?? ''),
    });
    redirect(`/distributors/${d.id}`);
  } catch (e) {
    if (e instanceof Error && e.message === 'EXCLUSIVITY_CONFLICT') return { error: 'EXCLUSIVITY_CONFLICT' as const };
    if (e instanceof Error && e.message === 'EXCLUSIVITY_OVERRIDE_REQUIRES_OWNER') return { error: 'OWNER_ONLY' as const };
    throw e;
  }
}
```

> Note: `redirect` throws internally — keep it INSIDE `try` but after the `await`; the `catch` re-throws anything that is not one of the two sentinel messages, so the Next redirect signal propagates correctly.

- [ ] **Step 2: The client panel**

`src/app/(app)/leads/[id]/convert-form.tsx`:

```tsx
'use client';
import { useActionState } from 'react';

type Result = { error: 'EXCLUSIVITY_CONFLICT' | 'OWNER_ONLY' } | void;

export function ConvertForm({
  action,
  territories,
}: {
  action: (fd: FormData) => Promise<Result>;
  territories: { id: string; name: string; type: string }[];
}) {
  const [state, formAction, pending] = useActionState<Result, FormData>(
    async (_prev, fd) => action(fd), undefined,
  );
  const conflict = state?.error === 'EXCLUSIVITY_CONFLICT';
  const ownerOnly = state?.error === 'OWNER_ONLY';
  const field = 'mt-1 block w-full rounded border px-2 py-1 text-sm';

  return (
    <form action={formAction} className="grid grid-cols-2 gap-3">
      <label className="text-sm">Territory
        <select name="territoryId" defaultValue="" className={field}>
          <option value="">— none —</option>
          {territories.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.type}</option>)}
        </select>
      </label>
      <label className="flex items-end gap-2 text-sm">
        <input type="checkbox" name="exclusive" /> Exclusive territory
      </label>
      <label className="text-sm">Credit limit (₹)
        <input name="creditLimit" type="number" min="0" step="1" defaultValue={0} className={field} />
      </label>
      <label className="text-sm">Credit days
        <input name="creditDays" type="number" min="0" max="365" step="1" defaultValue={0} className={field} />
      </label>
      <label className="text-sm">Payment terms
        <input name="paymentTerms" className={field} placeholder="e.g. 50% advance, balance on delivery" />
      </label>
      <label className="text-sm">Expected monthly purchase (₹)
        <input name="expectedMonthlyPurchase" type="number" min="0" step="1" defaultValue={0} className={field} />
      </label>

      {(conflict || ownerOnly) && (
        <div className="col-span-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {ownerOnly
            ? 'This territory is already held exclusively by another distributor. Only the owner can override an exclusivity clash.'
            : 'This territory is already held exclusively by another distributor. Enter a reason to override and record it, then submit again.'}
          {conflict && (
            <textarea name="overrideReason" rows={2} required
              className="mt-2 block w-full rounded border px-2 py-1"
              placeholder="Why is this exclusivity clash acceptable?" />
          )}
        </div>
      )}

      <div className="col-span-2">
        <button disabled={pending}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          {pending ? 'Converting…' : 'Convert to Distributor'}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Mount it on the lead page**

In `src/app/(app)/leads/[id]/page.tsx`:
- add imports: `import { listTerritories } from '@/server/services/territory';`, `import { ConvertForm } from './convert-form';`, `import { convertToDistributor } from './actions';`
- after `const timeline = ...`: `const territories = lead.convertedDistributorId ? [] : await listTerritories(user.orgId);`
- render a new `<section>` before the timeline card, only when `['APPROVED', 'APPOINTED'].includes(lead.stage) && !lead.convertedDistributorId`:

```tsx
<section className="rounded border p-4">
  <h2 className="mb-3 text-sm font-medium">Convert to Distributor</h2>
  <ConvertForm action={convertToDistributor.bind(null, id)} territories={territories} />
</section>
```

- when `lead.convertedDistributorId` is set, render instead a small note: `Converted — <a href={\`/distributors/\${lead.convertedDistributorId}\`}>view distributor</a>`.

- [ ] **Step 4: Gates** — `npm test` ×2 · `tsc` · `lint` · `build`.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/leads/\[id\]
git commit -m "feat(m2b): Convert to Distributor panel on the lead page (with exclusivity override)"
```

---

### Task 6: `quotations` + `quotation_items` + `price_approvals` schema + migration 0010

**Files:**
- Create: `src/server/db/schema/quotation.ts`
- Modify: `src/server/db/schema/index.ts` (add `export * from './quotation';`)
- Create: `drizzle/0010_*.sql` (generated + hand-appended CHECK)
- Test: `tests/services/quotation-schema.test.ts` (round-trip)

**Interfaces:**
- Produces: `quotations`, `quotationItems`, `priceApprovals` tables. `quotationItems.quotationId` and `.productId` are real FKs (both tables exist by 0010 / earlier). `quotationItems.schemeId` is a **plain uuid** (the `schemes` table only lands in 0011). `priceApprovals.quotationItemId` is a real FK to `quotationItems`.

- [ ] **Step 1: Write the schema**

`src/server/db/schema/quotation.ts`:

```ts
import { pgTable, uuid, text, integer, bigint, boolean, timestamp, date, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { products } from './product';

const ts = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

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
```

Add `export * from './quotation';` to `src/server/db/schema/index.ts`.

- [ ] **Step 2: Generate + hand-append the CHECK**

Run: `npm run db:generate` → `drizzle/0010_*.sql`.
Append at the end of that file (precedent: `drizzle/0003_shiny_pride.sql`):

```sql
--> statement-breakpoint
-- hand-appended (not emitted by drizzle-kit generate): a quotation targets exactly one of lead / distributor
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_party_ck" CHECK (("lead_id" IS NOT NULL) <> ("distributor_id" IS NOT NULL));
```

Add a `// ponytail:` note in `src/server/db/schema/quotation.ts` mirroring the `crm.ts` note: this CHECK is hand-appended and a schema squash/regenerate would drop it.

- [ ] **Step 3: Round-trip test**

`tests/services/quotation-schema.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { categories, products } from '@/server/db/schema/product';
import { quotations, quotationItems, priceApprovals } from '@/server/db/schema/quotation';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('quotation schema', () => {
  it('round-trips a quotation with an item and an approval', async () => {
    const { orgId } = await seedBase();
    const [cat] = await testDb.insert(categories).values({ orgId, name: 'Dry Fruits' }).returning();
    const [p] = await testDb.insert(products).values({
      orgId, categoryId: cat.id, skuCode: 'DF-ALMOND-100G', name: 'Almond', packLabel: '100g', gstPct: 12,
    }).returning();
    const [q] = await testDb.insert(quotations).values({
      orgId, quoteNo: 'Q-202609-001', leadId: crypto.randomUUID(),
      quoteDate: '2026-09-01', validUntil: '2026-09-08',
    }).returning();
    const [it] = await testDb.insert(quotationItems).values({
      orgId, quotationId: q.id, productId: p.id, qty: 10,
      requestedRate: 11000, listRate: 11984, floorRate: 11556, targetRate: 12626,
      gstPct: 12, netAmount: 110000, approvalStatus: 'PENDING',
    }).returning();
    const [ap] = await testDb.insert(priceApprovals).values({
      orgId, quotationItemId: it.id, requestedRate: 11000, originalRate: 11984, requestedBy: 'u-sales',
    }).returning();
    expect(ap.decision).toBe('PENDING');
    expect(it.netAmount).toBe(110000);
  });

  it('rejects a quotation that names both a lead and a distributor', async () => {
    const { orgId } = await seedBase();
    await expect(testDb.insert(quotations).values({
      orgId, quoteNo: 'Q-202609-002', leadId: crypto.randomUUID(), distributorId: crypto.randomUUID(),
      quoteDate: '2026-09-01', validUntil: '2026-09-08',
    })).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tests/services/quotation-schema.test.ts`
Expected: PASS (2 tests). (`migrateTestDb` applies 0010 including the hand-appended CHECK.)

- [ ] **Step 5: Full gates** — `npm test` ×2 · `tsc` · `lint` · `build`.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/schema/quotation.ts src/server/db/schema/index.ts drizzle/0010_* tests/services/quotation-schema.test.ts
git commit -m "feat(m2b): quotations / quotation_items / price_approvals schema + migration"
```

---

### Task 7: `quote` domain module

**Files:**
- Create: `src/domain/quote.ts`
- Test: `tests/domain/quote.test.ts`

**Interfaces:**
- Consumes: `Paise` from `./money`.
- Produces:
  - `type RateClass = 'AUTO' | 'NEEDS_APPROVAL' | 'BELOW_FLOOR'`
  - `classifyRate(i: { requestedRate: Paise; floorRate: Paise; targetRate: Paise }): RateClass`
  - `interface QuoteLineInput { qty: number; requestedRate: Paise; discount: Paise; schemeBenefit: Paise; gstPct: number }`
  - `interface QuoteLineResult { gross: Paise; netAmount: Paise; taxableValue: Paise; gstAmount: Paise }`
  - `computeQuoteLine(i: QuoteLineInput): QuoteLineResult`
  - `quoteTotals(lines: (QuoteLineInput & QuoteLineResult)[]): { gross; discountTotal; schemeTotal; netTotal; taxableTotal; gstTotal }` (all `Paise`)

- [ ] **Step 1: Write the failing test**

`tests/domain/quote.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyRate, computeQuoteLine, quoteTotals } from '@/domain/quote';

describe('classifyRate (spec §16 ladder)', () => {
  const bands = { floorRate: 11556, targetRate: 12626 };
  it('AUTO at or above target', () => {
    expect(classifyRate({ requestedRate: 12626, ...bands })).toBe('AUTO');
    expect(classifyRate({ requestedRate: 13000, ...bands })).toBe('AUTO');
  });
  it('NEEDS_APPROVAL between floor (inclusive) and target (exclusive)', () => {
    expect(classifyRate({ requestedRate: 11556, ...bands })).toBe('NEEDS_APPROVAL');
    expect(classifyRate({ requestedRate: 12000, ...bands })).toBe('NEEDS_APPROVAL');
  });
  it('BELOW_FLOOR under the floor', () => {
    expect(classifyRate({ requestedRate: 11555, ...bands })).toBe('BELOW_FLOOR');
  });
});

describe('computeQuoteLine (GST-inclusive)', () => {
  it('nets discount + scheme off the gross and backs GST out of the net', () => {
    const r = computeQuoteLine({ qty: 10, requestedRate: 11200, discount: 2000, schemeBenefit: 3360, gstPct: 12 });
    expect(r.gross).toBe(112000);
    expect(r.netAmount).toBe(106640);           // 112000 - 2000 - 3360
    expect(r.taxableValue).toBe(Math.round(106640 / 1.12)); // 95214
    expect(r.gstAmount).toBe(106640 - Math.round(106640 / 1.12));
  });
  it('never goes negative', () => {
    const r = computeQuoteLine({ qty: 1, requestedRate: 1000, discount: 5000, schemeBenefit: 0, gstPct: 5 });
    expect(r.netAmount).toBe(0);
  });
});

describe('quoteTotals', () => {
  it('sums each column across lines', () => {
    const mk = (i: Parameters<typeof computeQuoteLine>[0]) => ({ ...i, ...computeQuoteLine(i) });
    const lines = [
      mk({ qty: 10, requestedRate: 11200, discount: 0, schemeBenefit: 0, gstPct: 12 }),
      mk({ qty: 5, requestedRate: 20000, discount: 1000, schemeBenefit: 0, gstPct: 5 }),
    ];
    const t = quoteTotals(lines);
    expect(t.gross).toBe(112000 + 100000);
    expect(t.discountTotal).toBe(1000);
    expect(t.netTotal).toBe(lines[0].netAmount + lines[1].netAmount);
    expect(t.taxableTotal).toBe(lines[0].taxableValue + lines[1].taxableValue);
    expect(t.gstTotal).toBe(lines[0].gstAmount + lines[1].gstAmount);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run tests/domain/quote.test.ts`
Expected: FAIL — cannot find `@/domain/quote`.

- [ ] **Step 3: Implement**

`src/domain/quote.ts`:

```ts
import type { Paise } from './money';

export type RateClass = 'AUTO' | 'NEEDS_APPROVAL' | 'BELOW_FLOOR';

/** spec §16: >= target auto-approves; [floor, target) needs admin approval; < floor is blocked. */
export function classifyRate(i: { requestedRate: Paise; floorRate: Paise; targetRate: Paise }): RateClass {
  if (i.requestedRate >= i.targetRate) return 'AUTO';
  if (i.requestedRate >= i.floorRate) return 'NEEDS_APPROVAL';
  return 'BELOW_FLOOR';
}

export interface QuoteLineInput {
  qty: number;
  requestedRate: Paise; // GST-inclusive, per unit
  discount: Paise;       // absolute, line-level
  schemeBenefit: Paise;  // absolute, line-level
  gstPct: number;
}

export interface QuoteLineResult {
  gross: Paise;        // qty * requestedRate
  netAmount: Paise;    // max(0, gross - discount - schemeBenefit)
  taxableValue: Paise; // netAmount backed out of GST (prices_gst_inclusive = true)
  gstAmount: Paise;    // netAmount - taxableValue
}

export function computeQuoteLine(i: QuoteLineInput): QuoteLineResult {
  const gross = i.qty * i.requestedRate;
  const netAmount = Math.max(0, gross - i.discount - i.schemeBenefit);
  const taxableValue = Math.round(netAmount / (1 + i.gstPct / 100));
  return { gross, netAmount, taxableValue, gstAmount: netAmount - taxableValue };
}

export interface QuoteTotals {
  gross: Paise; discountTotal: Paise; schemeTotal: Paise;
  netTotal: Paise; taxableTotal: Paise; gstTotal: Paise;
}

export function quoteTotals(lines: (QuoteLineInput & QuoteLineResult)[]): QuoteTotals {
  const sum = (f: (l: QuoteLineInput & QuoteLineResult) => number) => lines.reduce((a, l) => a + f(l), 0);
  return {
    gross: sum((l) => l.gross),
    discountTotal: sum((l) => l.discount),
    schemeTotal: sum((l) => l.schemeBenefit),
    netTotal: sum((l) => l.netAmount),
    taxableTotal: sum((l) => l.taxableValue),
    gstTotal: sum((l) => l.gstAmount),
  };
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tests/domain/quote.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gates** — `npm test` ×2 · `tsc` · `lint` · `build`.

- [ ] **Step 6: Commit**

```bash
git add src/domain/quote.ts tests/domain/quote.test.ts
git commit -m "feat(m2b): quote domain — price-ladder classification + GST-inclusive line math"
```

---

### Task 8: `scheme` domain module

**Files:**
- Create: `src/domain/scheme.ts`
- Test: `tests/domain/scheme.test.ts`

**Interfaces:**
- Consumes: `Paise` from `./money`.
- Produces:
  - `type SchemeType = 'FLAT_DISCOUNT' | 'QTY_SCHEME' | 'DISTRIBUTOR_INCENTIVE'`
  - `type SchemeScope = 'PRODUCT' | 'CATEGORY' | 'ALL'`
  - `interface SchemeBenefit { kind: 'PCT' | 'AMOUNT' | 'PER_UNIT'; value: number }` — PCT: percent 0–100; AMOUNT / PER_UNIT: paise
  - `interface SchemeDef { type; scopeType; scopeId: string | null; startDate: string; endDate: string; minQty: number | null; minValue: Paise | null; benefit: SchemeBenefit; eligibility: { distributorGrades?: string[] }; active: boolean }` — dates are `'YYYY-MM-DD'`
  - `interface SchemeContext { onDate: string; productId: string; categoryId: string | null; qty: number; lineValue: Paise; distributorGrade: string | null }`
  - `isSchemeEligible(s: SchemeDef, ctx: SchemeContext): boolean`
  - `schemeBenefitPaise(s: SchemeDef, line: { qty: number; requestedRate: Paise }): Paise` — returns `0` for `DISTRIBUTOR_INCENTIVE` (payout accrual is Phase 2); caps every benefit at the line gross

- [ ] **Step 1: Write the failing test**

`tests/domain/scheme.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isSchemeEligible, schemeBenefitPaise, type SchemeDef } from '@/domain/scheme';

const base: SchemeDef = {
  type: 'FLAT_DISCOUNT', scopeType: 'ALL', scopeId: null,
  startDate: '2026-09-01', endDate: '2026-09-30',
  minQty: null, minValue: null,
  benefit: { kind: 'PCT', value: 5 }, eligibility: {}, active: true,
};
const ctx = {
  onDate: '2026-09-15', productId: 'p1', categoryId: 'c1',
  qty: 10, lineValue: 112000, distributorGrade: 'B' as string | null,
};

describe('isSchemeEligible', () => {
  it('true for an active, in-window, all-scope scheme with no thresholds', () => {
    expect(isSchemeEligible(base, ctx)).toBe(true);
  });
  it('false when inactive or out of the date window', () => {
    expect(isSchemeEligible({ ...base, active: false }, ctx)).toBe(false);
    expect(isSchemeEligible(base, { ...ctx, onDate: '2026-10-01' })).toBe(false);
    expect(isSchemeEligible(base, { ...ctx, onDate: '2026-08-31' })).toBe(false);
  });
  it('respects PRODUCT and CATEGORY scope', () => {
    expect(isSchemeEligible({ ...base, scopeType: 'PRODUCT', scopeId: 'p1' }, ctx)).toBe(true);
    expect(isSchemeEligible({ ...base, scopeType: 'PRODUCT', scopeId: 'p2' }, ctx)).toBe(false);
    expect(isSchemeEligible({ ...base, scopeType: 'CATEGORY', scopeId: 'c1' }, ctx)).toBe(true);
    expect(isSchemeEligible({ ...base, scopeType: 'CATEGORY', scopeId: 'c9' }, ctx)).toBe(false);
  });
  it('respects minQty / minValue and distributor-grade eligibility', () => {
    expect(isSchemeEligible({ ...base, minQty: 20 }, ctx)).toBe(false);
    expect(isSchemeEligible({ ...base, minValue: 200000 }, ctx)).toBe(false);
    expect(isSchemeEligible({ ...base, eligibility: { distributorGrades: ['A'] } }, ctx)).toBe(false);
    expect(isSchemeEligible({ ...base, eligibility: { distributorGrades: ['A', 'B'] } }, ctx)).toBe(true);
    expect(isSchemeEligible({ ...base, eligibility: { distributorGrades: ['A'] } }, { ...ctx, distributorGrade: null })).toBe(false);
  });
});

describe('schemeBenefitPaise', () => {
  const line = { qty: 10, requestedRate: 11200 }; // gross 112000
  it('PCT of gross', () => {
    expect(schemeBenefitPaise({ ...base, benefit: { kind: 'PCT', value: 5 } }, line)).toBe(5600);
  });
  it('flat AMOUNT, capped at gross', () => {
    expect(schemeBenefitPaise({ ...base, benefit: { kind: 'AMOUNT', value: 2000 } }, line)).toBe(2000);
    expect(schemeBenefitPaise({ ...base, benefit: { kind: 'AMOUNT', value: 999999 } }, line)).toBe(112000);
  });
  it('PER_UNIT times qty', () => {
    expect(schemeBenefitPaise({ ...base, type: 'QTY_SCHEME', benefit: { kind: 'PER_UNIT', value: 500 } }, line)).toBe(5000);
  });
  it('DISTRIBUTOR_INCENTIVE yields 0 at quote time (accrual is Phase 2)', () => {
    expect(schemeBenefitPaise({ ...base, type: 'DISTRIBUTOR_INCENTIVE', benefit: { kind: 'PCT', value: 3 } }, line)).toBe(0);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run tests/domain/scheme.test.ts`
Expected: FAIL — cannot find `@/domain/scheme`.

- [ ] **Step 3: Implement**

`src/domain/scheme.ts`:

```ts
import type { Paise } from './money';

export type SchemeType = 'FLAT_DISCOUNT' | 'QTY_SCHEME' | 'DISTRIBUTOR_INCENTIVE';
export type SchemeScope = 'PRODUCT' | 'CATEGORY' | 'ALL';

export interface SchemeBenefit {
  kind: 'PCT' | 'AMOUNT' | 'PER_UNIT';
  value: number; // PCT: percent 0-100; AMOUNT / PER_UNIT: paise
}

export interface SchemeDef {
  type: SchemeType;
  scopeType: SchemeScope;
  scopeId: string | null;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
  minQty: number | null;
  minValue: Paise | null;
  benefit: SchemeBenefit;
  eligibility: { distributorGrades?: string[] };
  active: boolean;
}

export interface SchemeContext {
  onDate: string; // 'YYYY-MM-DD'
  productId: string;
  categoryId: string | null;
  qty: number;
  lineValue: Paise; // qty * requestedRate, pre-discount
  distributorGrade: string | null;
}

export function isSchemeEligible(s: SchemeDef, ctx: SchemeContext): boolean {
  if (!s.active) return false;
  if (ctx.onDate < s.startDate || ctx.onDate > s.endDate) return false;
  if (s.scopeType === 'PRODUCT' && s.scopeId !== ctx.productId) return false;
  if (s.scopeType === 'CATEGORY' && s.scopeId !== ctx.categoryId) return false;
  if (s.minQty != null && ctx.qty < s.minQty) return false;
  if (s.minValue != null && ctx.lineValue < s.minValue) return false;
  const grades = s.eligibility.distributorGrades;
  if (grades && grades.length > 0) {
    if (!ctx.distributorGrade || !grades.includes(ctx.distributorGrade)) return false;
  }
  return true;
}

export function schemeBenefitPaise(s: SchemeDef, line: { qty: number; requestedRate: Paise }): Paise {
  if (s.type === 'DISTRIBUTOR_INCENTIVE') return 0; // payout accrual needs Orders (Phase 2)
  const gross = line.qty * line.requestedRate;
  let raw: number;
  switch (s.benefit.kind) {
    case 'PCT': raw = Math.round(gross * s.benefit.value / 100); break;
    case 'AMOUNT': raw = s.benefit.value; break;
    case 'PER_UNIT': raw = s.benefit.value * line.qty; break;
  }
  return Math.max(0, Math.min(gross, raw));
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tests/domain/scheme.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gates** — `npm test` ×2 · `tsc` · `lint` · `build`.

- [ ] **Step 6: Commit**

```bash
git add src/domain/scheme.ts tests/domain/scheme.test.ts
git commit -m "feat(m2b): scheme domain — eligibility + benefit computation"
```

---

### Task 9: `schemes` + `scheme_applications` schema + migration 0011 + `scheme` service

**Files:**
- Create: `src/server/db/schema/scheme.ts`
- Modify: `src/server/db/schema/index.ts` (add `export * from './scheme';`)
- Create: `drizzle/0011_*.sql` (generated)
- Modify: `src/lib/schemas.ts` (add `schemeSchema` + enum consts)
- Modify: `src/server/auth/permissions.ts` (add `scheme.view` / `scheme.edit`)
- Create: `src/server/services/scheme.ts`
- Test: `tests/services/scheme.test.ts`

**Interfaces:**
- Consumes: `SchemeDef` shape from `@/domain/scheme` (the service maps a `SchemeRow` → `SchemeDef` for callers that need it), `assertCan`, `writeAudit`.
- Produces:
  - `type SchemeRow = typeof schemes.$inferSelect`
  - `toSchemeDef(row: SchemeRow): SchemeDef` — maps DB row (dates as `Date`/string, `benefit`/`eligibility` jsonb) to the domain shape, dates as `'YYYY-MM-DD'`
  - `listSchemes(orgId, opts?: { activeOnly?: boolean }): Promise<SchemeRow[]>`
  - `getScheme(orgId, id): Promise<SchemeRow | null>`
  - `createScheme(user, input: SchemeFormInput): Promise<SchemeRow>` — `assertCan('scheme.edit')`
  - `updateScheme(user, id, patch: Partial<SchemeFormInput>): Promise<SchemeRow>`
  - `activeSchemesFor(orgId, ctx: { onDate: string; productId: string; categoryId: string | null }): Promise<SchemeRow[]>` — DB-level filter: org, not deleted, `active`, `startDate <= onDate <= endDate`, and scope match (`scopeType = 'ALL'` OR (`'PRODUCT'` AND `scopeId = productId`) OR (`'CATEGORY'` AND `scopeId = categoryId`)). Qty / value / grade checks are the caller's job via `isSchemeEligible`.

- [ ] **Step 1: Schema**

`src/server/db/schema/scheme.ts`:

```ts
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
```

Add `export * from './scheme';` to `src/server/db/schema/index.ts`. Run `npm run db:generate` → `0011_*.sql` (no hand-append).

- [ ] **Step 2: zod schema + enums (`src/lib/schemas.ts`)**

```ts
// ── Schemes (spec §4.6 / §30) ─────────────────────────────────────────────
export const SCHEME_TYPES = ['FLAT_DISCOUNT', 'QTY_SCHEME', 'DISTRIBUTOR_INCENTIVE'] as const;
export const SCHEME_SCOPES = ['PRODUCT', 'CATEGORY', 'ALL'] as const;
export const SCHEME_BENEFIT_KINDS = ['PCT', 'AMOUNT', 'PER_UNIT'] as const;

export const schemeSchema = z.object({
  name: z.string().min(2).max(160),
  type: z.enum(SCHEME_TYPES),
  scopeType: z.enum(SCHEME_SCOPES),
  scopeId: z.uuid().nullable().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  minQty: z.coerce.number().int().min(0).nullable().optional(),
  minValue: z.coerce.number().int().min(0).nullable().optional(), // paise
  benefitKind: z.enum(SCHEME_BENEFIT_KINDS),
  benefitValue: z.coerce.number().min(0),                          // PCT: percent; AMOUNT/PER_UNIT: paise
  eligibleGrades: z.array(z.enum(['A', 'B', 'C'])).default([]),
  requiresApproval: z.boolean().optional(),
  active: z.boolean().optional(),
})
  .refine((v) => v.endDate >= v.startDate, { message: 'endDate is before startDate' })
  .refine((v) => v.scopeType === 'ALL' || v.scopeId != null, { message: 'scopeId is required for PRODUCT / CATEGORY scope' });
export type SchemeFormInput = z.input<typeof schemeSchema>;
```

- [ ] **Step 3: Permissions** — add `| 'scheme.view' | 'scheme.edit'` to the `Action` union; `scheme.view` + `scheme.edit` in `OWNER_ACTIONS`; `scheme.view` only in `SALES_ACTIONS`.

- [ ] **Step 4: Failing test**

`tests/services/scheme.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { auditLog } from '@/server/db/schema/audit';
import { listSchemes, createScheme, updateScheme, activeSchemesFor } from '@/server/services/scheme';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'u-owner', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });
const sales = (orgId: string): AppUser => ({ id: 'u-sales', email: 's', name: 'S', role: 'SALES', employeeId: null, orgId });

const form = {
  name: 'Sept Dry Fruits 5%', type: 'FLAT_DISCOUNT' as const, scopeType: 'CATEGORY' as const,
  scopeId: '00000000-0000-0000-0000-0000000000c1',
  startDate: '2026-09-01', endDate: '2026-09-30',
  benefitKind: 'PCT' as const, benefitValue: 5, eligibleGrades: [] as ('A'|'B'|'C')[],
};

describe('scheme service', () => {
  it('createScheme is OWNER-only, stores benefit/eligibility jsonb, and audits', async () => {
    const { orgId } = await seedBase();
    await expect(createScheme(sales(orgId), form)).rejects.toThrow('forbidden');
    const s = await createScheme(owner(orgId), { ...form, eligibleGrades: ['A', 'B'] });
    expect(s.benefit).toEqual({ kind: 'PCT', value: 5 });
    expect(s.eligibility).toEqual({ distributorGrades: ['A', 'B'] });
    expect(s.active).toBe(true);
    const rows = await testDb.select().from(auditLog).where(eq(auditLog.entityType, 'scheme'));
    expect(rows.length).toBe(1);
  });

  it('updateScheme patches supplied fields', async () => {
    const { orgId } = await seedBase();
    const s = await createScheme(owner(orgId), form);
    const up = await updateScheme(owner(orgId), s.id, { active: false, benefitKind: 'AMOUNT', benefitValue: 1000 });
    expect(up.active).toBe(false);
    expect(up.benefit).toEqual({ kind: 'AMOUNT', value: 1000 });
    expect(up.name).toBe(form.name);
  });

  it('activeSchemesFor filters by window + scope', async () => {
    const { orgId } = await seedBase();
    await createScheme(owner(orgId), { ...form, name: 'cat c1' });                         // CATEGORY c1
    await createScheme(owner(orgId), { ...form, name: 'all', scopeType: 'ALL', scopeId: null });
    await createScheme(owner(orgId), { ...form, name: 'expired', endDate: '2026-09-05' });

    const hits = await activeSchemesFor(orgId, {
      onDate: '2026-09-15', productId: '00000000-0000-0000-0000-0000000000p1',
      categoryId: '00000000-0000-0000-0000-0000000000c1',
    });
    expect(hits.map((h) => h.name).sort()).toEqual(['all', 'cat c1']);
  });
});
```

- [ ] **Step 5: Run — fails**

Run: `npx vitest run tests/services/scheme.test.ts`
Expected: FAIL — cannot find `@/server/services/scheme`.

- [ ] **Step 6: Implement the service**

`src/server/services/scheme.ts`:

```ts
import { and, asc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { schemes } from '@/server/db/schema/scheme';
import { schemeSchema, type SchemeFormInput } from '@/lib/schemas';
import { patchOnly } from '@/lib/patch';
import { assertCan } from '@/server/auth/permissions';
import { writeAudit } from './audit';
import type { SchemeDef } from '@/domain/scheme';
import type { AppUser } from '@/server/auth/session';

export type SchemeRow = typeof schemes.$inferSelect;

const ymd = (d: Date | string): string => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));

export function toSchemeDef(r: SchemeRow): SchemeDef {
  return {
    type: r.type as SchemeDef['type'],
    scopeType: r.scopeType as SchemeDef['scopeType'],
    scopeId: r.scopeId,
    startDate: ymd(r.startDate as unknown as string),
    endDate: ymd(r.endDate as unknown as string),
    minQty: r.minQty,
    minValue: r.minValue,
    benefit: r.benefit as SchemeDef['benefit'],
    eligibility: (r.eligibility ?? {}) as SchemeDef['eligibility'],
    active: r.active,
  };
}

// map the flat form shape to column values (benefit/eligibility become jsonb)
function toColumns(f: ReturnType<typeof schemeSchema.parse>) {
  return {
    name: f.name,
    type: f.type,
    scopeType: f.scopeType,
    scopeId: f.scopeType === 'ALL' ? null : (f.scopeId ?? null),
    startDate: ymd(f.startDate),
    endDate: ymd(f.endDate),
    minQty: f.minQty ?? null,
    minValue: f.minValue ?? null,
    benefit: { kind: f.benefitKind, value: f.benefitValue },
    eligibility: f.eligibleGrades.length ? { distributorGrades: f.eligibleGrades } : {},
    requiresApproval: f.requiresApproval ?? false,
    active: f.active ?? true,
  };
}

export async function listSchemes(orgId: string, opts: { activeOnly?: boolean } = {}): Promise<SchemeRow[]> {
  const conds = [eq(schemes.orgId, orgId), isNull(schemes.deletedAt)];
  if (opts.activeOnly) conds.push(eq(schemes.active, true));
  return db.select().from(schemes).where(and(...conds)).orderBy(asc(schemes.name));
}

export async function getScheme(orgId: string, id: string): Promise<SchemeRow | null> {
  const [row] = await db.select().from(schemes)
    .where(and(eq(schemes.id, id), eq(schemes.orgId, orgId), isNull(schemes.deletedAt)));
  return row ?? null;
}

export async function createScheme(user: AppUser, input: SchemeFormInput): Promise<SchemeRow> {
  assertCan(user, 'scheme.edit');
  const f = schemeSchema.parse(input);
  const [row] = await db.insert(schemes).values({ ...toColumns(f), orgId: user.orgId }).returning();
  await writeAudit(user, 'scheme', row.id, 'create', null, row);
  return row;
}

export async function updateScheme(user: AppUser, id: string, input: Partial<SchemeFormInput>): Promise<SchemeRow> {
  assertCan(user, 'scheme.edit');
  const [before] = await db.select().from(schemes).where(and(eq(schemes.id, id), eq(schemes.orgId, user.orgId)));
  if (!before) throw new Error('not found');
  // Re-parse a merged view so cross-field refinements still hold, then patch only supplied keys.
  const merged = schemeSchema.parse({
    name: input.name ?? before.name,
    type: input.type ?? before.type,
    scopeType: input.scopeType ?? before.scopeType,
    scopeId: 'scopeId' in input ? input.scopeId : before.scopeId,
    startDate: input.startDate ?? (before.startDate as unknown as string),
    endDate: input.endDate ?? (before.endDate as unknown as string),
    minQty: 'minQty' in input ? input.minQty : before.minQty,
    minValue: 'minValue' in input ? input.minValue : before.minValue,
    benefitKind: input.benefitKind ?? (before.benefit as { kind: string }).kind,
    benefitValue: input.benefitValue ?? (before.benefit as { value: number }).value,
    eligibleGrades: input.eligibleGrades
      ?? ((before.eligibility as { distributorGrades?: string[] }).distributorGrades ?? []),
    requiresApproval: 'requiresApproval' in input ? input.requiresApproval : before.requiresApproval,
    active: 'active' in input ? input.active : before.active,
  });
  const [row] = await db.update(schemes)
    .set({ ...toColumns(merged), updatedAt: new Date() })
    .where(eq(schemes.id, id)).returning();
  await writeAudit(user, 'scheme', id, 'update', before, row);
  return row;
}

export async function activeSchemesFor(
  orgId: string,
  ctx: { onDate: string; productId: string; categoryId: string | null },
): Promise<SchemeRow[]> {
  const scopeMatch = or(
    eq(schemes.scopeType, 'ALL'),
    and(eq(schemes.scopeType, 'PRODUCT'), eq(schemes.scopeId, ctx.productId)),
    ctx.categoryId ? and(eq(schemes.scopeType, 'CATEGORY'), eq(schemes.scopeId, ctx.categoryId)) : undefined,
  );
  return db.select().from(schemes).where(and(
    eq(schemes.orgId, orgId),
    isNull(schemes.deletedAt),
    eq(schemes.active, true),
    lte(schemes.startDate, ctx.onDate),
    gte(schemes.endDate, ctx.onDate),
    scopeMatch!,
  )).orderBy(asc(schemes.name));
}
```

> `patchOnly` import is unused here (the merged-reparse handles partial updates) — drop it from the import line if lint flags it.

- [ ] **Step 7: Run — passes**

Run: `npx vitest run tests/services/scheme.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Full gates** — `npm test` ×2 · `tsc` · `lint` · `build`.

- [ ] **Step 9: Commit**

```bash
git add src/server/db/schema/scheme.ts src/server/db/schema/index.ts drizzle/0011_* src/lib/schemas.ts src/server/auth/permissions.ts src/server/services/scheme.ts tests/services/scheme.test.ts
git commit -m "feat(m2b): schemes schema + service (CRUD + activeSchemesFor)"
```

---

### Task 10: `quotation` service — create / submit / approve / status

**Files:**
- Modify: `src/lib/schemas.ts` (add `QUOTATION_STATUSES`, `quotationSchema`)
- Modify: `src/server/auth/permissions.ts` (add `quotation.view` / `quotation.create` / `quotation.approve` / `quotation.setStatus`)
- Modify: `src/server/services/config.ts` (`priceApprovalRequired: true` in `CONFIG_DEFAULTS` + its `satisfies` type)
- Create: `src/server/services/quotation.ts`
- Test: `tests/services/quotation.test.ts`

**Interfaces:**
- Consumes: `classifyRate`, `computeQuoteLine` from `@/domain/quote`; `isSchemeEligible`, `schemeBenefitPaise` from `@/domain/scheme`; `getProduct` from `@/server/services/product`; `activeSchemesFor`, `toSchemeDef` from `@/server/services/scheme`; `getDistributor` from `@/server/services/distributor`; `getConfig` from `./config`; `getLead` from `./lead`.
- Produces:
  - `type QuotationRow`, `QuotationItemRow`, `PriceApprovalRow`
  - `QUOTATION_ITEM_FINANCIAL_FIELDS: (keyof QuotationItemRow)[] = ['floorRate', 'targetRate']`; `redactQuotationItem(user, row)` / `redactQuotationItems(user, rows)`
  - `interface NewQuoteItem { productId: string; qty: number; requestedRate: Paise; discount?: Paise }`
  - `interface NewQuotation { leadId?: string | null; distributorId?: string | null; validUntil: string; notes?: string; items: NewQuoteItem[] }`
  - `createQuotation(user, input: NewQuotation): Promise<QuotationRow>` — validates exactly one of `leadId`/`distributorId`; allocates `quoteNo = Q-YYYYMM-NNN` (per-org, `NNN` = count of that org's quotations in the same YYYYMM + 1, zero-padded to 3); for each item: `getProduct` → snapshot `listRate=distributorPrice`, `floorRate=floorPrice`, `targetRate=targetPrice`, `gstPct=product.gstPct`; resolve schemes via `activeSchemesFor` + `isSchemeEligible` (context: `onDate=today`, product & category ids, `qty`, `lineValue=qty*requestedRate`, `distributorGrade` from the distributor if any) → first eligible non-zero-benefit scheme wins → `schemeBenefit`; `computeQuoteLine` → `netAmount`; `approvalStatus` from `classifyRate` mapped `AUTO→'AUTO'`, `NEEDS_APPROVAL→'PENDING'`, `BELOW_FLOOR→'BLOCKED'`. Inserts the quotation (`status='DRAFT'`, `quoteDate=today`, `employeeId=user.employeeId`), its items, and a `scheme_applications` row per item that has a scheme. Audits `quotation/create`.
  - `getQuotation(orgId, id): Promise<{ quotation: QuotationRow; items: QuotationItemRow[] } | null>`
  - `listQuotations(orgId, opts?: { status?: string; distributorId?: string; leadId?: string }): Promise<QuotationRow[]>`
  - `submitQuotation(user, id): Promise<QuotationRow>` — `assertCan('quotation.create')`; quotation must be `DRAFT`; `const approvalOn = await getConfig(orgId, 'priceApprovalRequired')`. Per item: `AUTO` stays. `PENDING` → insert a `price_approvals` row (`requestedRate`, `originalRate=listRate`, `requestedBy=user.id`, `reason='[floor,target) rate'`); if `user.role === 'OWNER' || !approvalOn` → set that approval `decision='APPROVED'`, `approverId=user.id`, `decidedAt=now`, and item `approvalStatus='APPROVED'`; else leave `PENDING`. `BLOCKED` → insert a `price_approvals` row (`reason='below floor'`, `decision='PENDING'`), item stays `BLOCKED` (only an explicit `decideApproval` APPROVE by the OWNER clears it). Set `quotation.status='SENT'`. Audit `quotation/submit`.
  - `decideApproval(user, approvalId, decision: 'APPROVED' | 'REJECTED', note?: string): Promise<PriceApprovalRow>` — `assertCan('quotation.approve')` (OWNER); approval must be `PENDING`; set `decision`, `approverId=user.id`, `decidedAt=now`, append `note` to `reason`; set the linked item `approvalStatus = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED'`. Audit `price_approval/decide`.
  - `listPendingApprovals(orgId): Promise<(PriceApprovalRow & { quoteNo: string; quotationId: string; productName: string; qty: number })[]>` — joins `price_approvals → quotation_items → quotations`, `products`, `decision='PENDING'`.
  - `setQuotationStatus(user, id, status: string): Promise<QuotationRow>` — `assertCan('quotation.setStatus')`; validates `status ∈ QUOTATION_STATUSES`; audit `quotation/status`.

- [ ] **Step 1: Config + schema + permissions**

`src/server/services/config.ts` — inside `CONFIG_DEFAULTS`, after `pricesGstInclusive: true,` add `priceApprovalRequired: true,`; in the `satisfies { ... }` type add `priceApprovalRequired: boolean;`.

`src/lib/schemas.ts`:

```ts
export const QUOTATION_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const;

export const quotationSchema = z.object({
  leadId: z.uuid().nullable().optional(),
  distributorId: z.uuid().nullable().optional(),
  validUntil: z.coerce.date(),
  notes: z.string().max(2000).optional().or(z.literal('')),
}).refine((v) => !!v.leadId !== !!v.distributorId, { message: 'name exactly one of lead or distributor' });
export type QuotationFormInput = z.input<typeof quotationSchema>;
```

`src/server/auth/permissions.ts` — `Action` union: `| 'quotation.view' | 'quotation.create' | 'quotation.approve' | 'quotation.setStatus'`. `OWNER_ACTIONS`: all four. `SALES_ACTIONS`: `'quotation.view', 'quotation.create', 'quotation.setStatus'`.

- [ ] **Step 2: Failing test**

`tests/services/quotation.test.ts` (key cases — the implementer expands coverage but must keep these passing):

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { categories, products, productPrices } from '@/server/db/schema/product';
import { distributors } from '@/server/db/schema/distributor';
import { priceApprovals, quotationItems } from '@/server/db/schema/quotation';
import { auditLog } from '@/server/db/schema/audit';
import {
  createQuotation, getQuotation, submitQuotation, decideApproval, listPendingApprovals,
  setQuotationStatus, redactQuotationItem,
} from '@/server/services/quotation';
import { createScheme } from '@/server/services/scheme';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'u-owner', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });
const sales = (orgId: string): AppUser => ({ id: 'u-sales', email: 's', name: 'S', role: 'SALES', employeeId: null, orgId });

async function seedProduct(orgId: string, over: Partial<typeof productPrices.$inferInsert> = {}) {
  const [cat] = await testDb.insert(categories).values({ orgId, name: 'Dry Fruits' }).returning();
  const [p] = await testDb.insert(products).values({
    orgId, categoryId: cat.id, skuCode: `DF-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Almond 100g', packLabel: '100g', gstPct: 12, mrp: 19300,
  }).returning();
  await testDb.insert(productPrices).values({
    orgId, productId: p.id, ssBillingPrice: 10700, distributorPrice: 11984,
    floorPrice: 11556, targetPrice: 12626, retailerPrice: 13782, mrp: 19300, ...over,
  });
  return { catId: cat.id, product: p };
}

async function seedDist(orgId: string) {
  const [d] = await testDb.insert(distributors).values({
    orgId, businessName: 'Coastal', contactPerson: 'W', phone: '9845000001', status: 'ACTIVE', grade: 'A',
  }).returning();
  return d;
}

describe('quotation service', () => {
  it('createQuotation snapshots rates, computes the line, and allocates a Q-YYYYMM-NNN number', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedProduct(orgId);
    const d = await seedDist(orgId);
    const q = await createQuotation(owner(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 10, requestedRate: 12800 }], // >= target -> AUTO
    });
    expect(q.quoteNo).toMatch(/^Q-\d{6}-\d{3}$/);
    const got = await getQuotation(orgId, q.id);
    expect(got!.items[0].listRate).toBe(11984);
    expect(got!.items[0].floorRate).toBe(11556);
    expect(got!.items[0].targetRate).toBe(12626);
    expect(got!.items[0].netAmount).toBe(128000);
    expect(got!.items[0].approvalStatus).toBe('AUTO');
  });

  it('OWNER submitting a [floor,target) rate self-approves; SALES submitting queues it PENDING', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedProduct(orgId);
    const d = await seedDist(orgId);

    const q1 = await createQuotation(owner(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 5, requestedRate: 12000 }],
    });
    await submitQuotation(owner(orgId), q1.id);
    const g1 = await getQuotation(orgId, q1.id);
    expect(g1!.quotation.status).toBe('SENT');
    expect(g1!.items[0].approvalStatus).toBe('APPROVED');
    const [a1] = await testDb.select().from(priceApprovals).where(eq(priceApprovals.quotationItemId, g1!.items[0].id));
    expect(a1.decision).toBe('APPROVED');

    const q2 = await createQuotation(sales(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 5, requestedRate: 12000 }],
    });
    await submitQuotation(sales(orgId), q2.id);
    const g2 = await getQuotation(orgId, q2.id);
    expect(g2!.items[0].approvalStatus).toBe('PENDING');
    expect((await listPendingApprovals(orgId)).length).toBe(1);
  });

  it('a below-floor rate is BLOCKED on submit; OWNER decideApproval APPROVE clears it', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedProduct(orgId);
    const d = await seedDist(orgId);
    const q = await createQuotation(sales(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 4, requestedRate: 11000 }], // < floor 11556
    });
    expect((await getQuotation(orgId, q.id))!.items[0].approvalStatus).toBe('BLOCKED');
    await submitQuotation(sales(orgId), q.id);
    const pend = await listPendingApprovals(orgId);
    expect(pend.length).toBe(1);
    await expect(decideApproval(sales(orgId), pend[0].id, 'APPROVED')).rejects.toThrow('forbidden');
    await decideApproval(owner(orgId), pend[0].id, 'APPROVED', 'one-off to land the account');
    const [it] = await testDb.select().from(quotationItems).where(eq(quotationItems.id, pend[0].quotationItemId));
    expect(it.approvalStatus).toBe('APPROVED');
  });

  it('auto-applies an eligible FLAT_DISCOUNT scheme to the line and records a scheme_application', async () => {
    const { orgId } = await seedBase();
    const { catId, product } = await seedProduct(orgId);
    const d = await seedDist(orgId);
    await createScheme(owner(orgId), {
      name: 'DF 5%', type: 'FLAT_DISCOUNT', scopeType: 'CATEGORY', scopeId: catId,
      startDate: '2026-01-01', endDate: '2026-12-31', benefitKind: 'PCT', benefitValue: 5, eligibleGrades: [],
    });
    const q = await createQuotation(owner(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 10, requestedRate: 12800 }],
    });
    const got = await getQuotation(orgId, q.id);
    expect(got!.items[0].schemeBenefit).toBe(6400);                       // 5% of 128000
    expect(got!.items[0].netAmount).toBe(128000 - 6400);
  });

  it('redactQuotationItem strips floor/target for SALES, keeps them for OWNER', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedProduct(orgId);
    const d = await seedDist(orgId);
    const q = await createQuotation(owner(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 1, requestedRate: 12800 }],
    });
    const [item] = (await getQuotation(orgId, q.id))!.items;
    const s = redactQuotationItem(sales(orgId), item);
    expect(s).not.toHaveProperty('floorRate');
    expect(s).not.toHaveProperty('targetRate');
    expect(s).toHaveProperty('listRate');
    expect(redactQuotationItem(owner(orgId), item).floorRate).toBe(11556);
  });

  it('setQuotationStatus validates the enum and audits', async () => {
    const { orgId } = await seedBase();
    const { product } = await seedProduct(orgId);
    const d = await seedDist(orgId);
    const q = await createQuotation(owner(orgId), {
      distributorId: d.id, validUntil: '2026-12-31',
      items: [{ productId: product.id, qty: 1, requestedRate: 12800 }],
    });
    await expect(setQuotationStatus(owner(orgId), q.id, 'BOGUS')).rejects.toThrow();
    await setQuotationStatus(owner(orgId), q.id, 'ACCEPTED');
    const rows = await testDb.select().from(auditLog).where(and(eq(auditLog.entityType, 'quotation'), eq(auditLog.action, 'status')));
    expect(rows.length).toBe(1);
  });
});
```

- [ ] **Step 3: Run — fails**

Run: `npx vitest run tests/services/quotation.test.ts`
Expected: FAIL — cannot find `@/server/services/quotation`.

- [ ] **Step 4: Implement the service**

`src/server/services/quotation.ts` — build to the interface spec above. Key implementation notes:

```ts
import { and, count, desc, eq, like } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { quotations, quotationItems, priceApprovals } from '@/server/db/schema/quotation';
import { schemeApplications } from '@/server/db/schema/scheme';
import { products } from '@/server/db/schema/product';
import { quotationSchema } from '@/lib/schemas';
import { QUOTATION_STATUSES } from '@/lib/schemas';
import { assertCan, stripFinancial } from '@/server/auth/permissions';
import { classifyRate, computeQuoteLine } from '@/domain/quote';
import { isSchemeEligible, schemeBenefitPaise } from '@/domain/scheme';
import { getProduct } from './product';
import { getDistributor } from './distributor';
import { activeSchemesFor, toSchemeDef } from './scheme';
import { getConfig } from './config';
import { writeAudit } from './audit';
import type { Paise } from '@/domain/money';
import type { AppUser } from '@/server/auth/session';

export type QuotationRow = typeof quotations.$inferSelect;
export type QuotationItemRow = typeof quotationItems.$inferSelect;
export type PriceApprovalRow = typeof priceApprovals.$inferSelect;

export const QUOTATION_ITEM_FINANCIAL_FIELDS: (keyof QuotationItemRow)[] = ['floorRate', 'targetRate'];
export function redactQuotationItem(user: AppUser, row: QuotationItemRow): QuotationItemRow {
  return stripFinancial(user, row, QUOTATION_ITEM_FINANCIAL_FIELDS);
}
export function redactQuotationItems(user: AppUser, rows: QuotationItemRow[]): QuotationItemRow[] {
  return rows.map((r) => redactQuotationItem(user, r));
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function allocateQuoteNo(orgId: string, on: Date): Promise<string> {
  const ym = `${on.getFullYear()}${String(on.getMonth() + 1).padStart(2, '0')}`;
  const [{ n }] = await db.select({ n: count() }).from(quotations)
    .where(and(eq(quotations.orgId, orgId), like(quotations.quoteNo, `Q-${ym}-%`)));
  return `Q-${ym}-${String(n + 1).padStart(3, '0')}`;
}
```

- `createQuotation`: `assertCan('quotation.create')`; `const f = quotationSchema.parse({ leadId, distributorId, validUntil, notes })`; resolve `distributorGrade` (`f.distributorId ? (await getDistributor(orgId, f.distributorId))?.grade ?? null : null`); for each item load `full = await getProduct(orgId, item.productId)` (throw `'product not found'` if null or `!full.price`); build `line` values; `schemes = await activeSchemesFor(orgId, { onDate, productId, categoryId: full.categoryId })`; pick `chosen = schemes.find(s => isSchemeEligible(toSchemeDef(s), ctx) && schemeBenefitPaise(toSchemeDef(s), line) > 0)`; `schemeBenefit = chosen ? schemeBenefitPaise(toSchemeDef(chosen), line) : 0`; `const calc = computeQuoteLine({ qty, requestedRate, discount: item.discount ?? 0, schemeBenefit, gstPct: full.price.... })` — wait, `gstPct` comes from `full.gstPct`; `approvalStatus = { AUTO:'AUTO', NEEDS_APPROVAL:'PENDING', BELOW_FLOOR:'BLOCKED' }[classifyRate({ requestedRate, floorRate: full.price.floorPrice, targetRate: full.price.targetPrice })]`. Insert quotation, then items (collect their ids), then a `schemeApplications` row for each item with a `chosen` scheme (`actualBenefit = schemeBenefit`, `quotationId`, `quotationItemId`, `distributorId`). One `writeAudit(user, 'quotation', q.id, 'create', null, { quoteNo, itemCount })`.
- `submitQuotation`: load quotation (org-scoped) + items; `if (quotation.status !== 'DRAFT') throw new Error('not a draft')`; `approvalOn = await getConfig(orgId, 'priceApprovalRequired')`; loop items — for `'PENDING'` insert a `priceApprovals` row then, if `user.role === 'OWNER' || !approvalOn`, immediately update it to APPROVED + set item `'APPROVED'`; for `'BLOCKED'` insert a PENDING `priceApprovals` row (`reason: 'below floor'`), leave the item `'BLOCKED'`. Update `quotation.status = 'SENT'`. `writeAudit(user, 'quotation', id, 'submit', { status: 'DRAFT' }, { status: 'SENT' })`.
- `decideApproval`: `assertCan('quotation.approve')`; load approval (org-scoped via `eq(priceApprovals.orgId, user.orgId)`); `if (approval.decision !== 'PENDING') throw new Error('already decided')`; update; update the linked item's `approvalStatus`. `writeAudit(user, 'price_approval', approvalId, 'decide', { decision: 'PENDING' }, { decision, note })`.
- `listPendingApprovals`: inner-join `priceApprovals → quotationItems → quotations`, left-join `products`, `where decision = 'PENDING' and quotations.orgId = orgId`, select the extra display columns.
- `setQuotationStatus`: `assertCan('quotation.setStatus')`; `if (!(QUOTATION_STATUSES as readonly string[]).includes(status)) throw new Error('invalid status')`; load before, update, `writeAudit(user, 'quotation', id, 'status', { status: before.status }, { status })`.
- `getQuotation`: `{ quotation, items }` with items ordered by `createdAt`.
- `listQuotations`: filter by org + not deleted + optional status/distributorId/leadId, `orderBy(desc(quotations.createdAt))`.

- [ ] **Step 5: Run — passes**

Run: `npx vitest run tests/services/quotation.test.ts`
Expected: PASS (6+ tests).

- [ ] **Step 6: Full gates** — `npm test` ×2 · `tsc` · `lint` · `build`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/schemas.ts src/server/auth/permissions.ts src/server/services/config.ts src/server/services/quotation.ts tests/services/quotation.test.ts
git commit -m "feat(m2b): quotation service — create/submit/approve/status + price ladder + scheme auto-apply"
```

---

### Task 11: Quotation screens + Approvals queue + nav

**Files:**
- Create: `src/app/(app)/quotations/page.tsx` · `quotations/new/page.tsx` · `quotations/new/quote-builder.tsx` (client) · `quotations/[id]/page.tsx` · `quotations/[id]/print/page.tsx` · `quotations/actions.ts`
- Create: `src/app/(app)/approvals/page.tsx` · `src/app/(app)/approvals/actions.ts`
- Modify: `src/components/app-nav.tsx` (add `{ href: '/quotations', label: 'Quotations' }` and `{ href: '/approvals', label: 'Approvals', ownerOnly: true }`)

**Interfaces:**
- Consumes: everything from `@/server/services/quotation`; `listDistributors`, `listLeads`, `listProducts` (search), `redactQuotationItems`, `getConfig`.
- Produces: Server Actions —
  - `createQuotationAction(formData): Promise<void>` — parses the party + `validUntil` + a repeated `item.productId[]` / `item.qty[]` / `item.rate[]` set, calls `createQuotation`, `redirect(\`/quotations/\${q.id}\`)`
  - `submitQuotationAction(id): Promise<void>` · `setStatusAction(id, formData): Promise<void>`
  - `decideApprovalAction(id, decision, formData): Promise<void>` in `approvals/actions.ts`

**Pattern reference:** list/detail mirror `products/page.tsx` + `products/[id]/page.tsx`. The line-item builder is a client component holding an array of `{ productId, qty, rate }` rows with an "Add line" button; product picker is a `<select>` populated from a `products` prop (`listProducts(orgId, { limit: 1000 })`, redacted — SALES sees name + distributor price only). All money inputs are integer-rupee `<input type="number">`; the action multiplies by 100.

- [ ] **Step 1: `quotations/actions.ts`** — `createQuotationAction`, `submitQuotationAction`, `setStatusAction`. `createQuotationAction` reads `formData.getAll('itemProductId')`, `getAll('itemQty')`, `getAll('itemRate')` and zips them into `items`, dropping any row with an empty product or `qty <= 0`.

- [ ] **Step 2: `quotations/page.tsx`** — list: `quoteNo`, party name (resolve lead/distributor), status badge, `validUntil`, `net total` (sum items' `netAmount` — fetch per row or add a `listQuotationsWithTotals` helper; simplest: `listQuotations` then `Promise.all(getQuotation)` for the small M2b volume, with a `// ponytail:` note to add a SQL sum in M3). "New quotation" link → `/quotations/new`. Filter by status.

- [ ] **Step 3: `quotations/new/page.tsx` + `quote-builder.tsx`** — server page fetches `listDistributors(orgId)` (ACTIVE/APPROVED) + `listLeads(orgId)` (open stages) + redacted `listProducts`. Renders `<QuoteBuilder distributors={...} leads={...} products={...} action={createQuotationAction} />`. The client component: a party `<select>` (optgroups "Distributors" / "Leads", value carries a `d:`/`l:` prefix the action splits), a `validUntil` date input, a notes textarea, and the dynamic line rows. Submit posts the form.

- [ ] **Step 4: `quotations/[id]/page.tsx`** — `getQuotation`; `redactQuotationItems(user, items)`. Header: `quoteNo`, party, status, `validUntil`, `quoteDate`. Items table: product, qty, requested rate, `listRate` (labelled "List"), discount, scheme benefit, `netAmount`, and an `approvalStatus` badge. For OWNER, `floorRate` / `targetRate` columns show; for SALES they're absent (redacted) and the badge alone conveys "needs approval". Totals row from `quoteTotals`. Buttons: when `status === 'DRAFT'` → "Submit quotation" (`submitQuotationAction.bind(null, id)`); a status `<select>` + "Update status" (`setStatusAction`); "Print / WhatsApp" → link to `/quotations/[id]/print`. Below the table, for OWNER, a list of this quote's `PENDING` approvals with inline APPROVE / REJECT (posts to `decideApprovalAction`). Add a `<CopyWhatsApp text={...} />` tiny client button that does `navigator.clipboard.writeText` of a plain-text quote summary (quoteNo, party, each line `name x qty @ ₹rate = ₹net`, total, validity).

- [ ] **Step 5: `quotations/[id]/print/page.tsx`** — minimal server-rendered HTML, no `AppNav`/chrome (it is under `(app)` so it still gets the layout; acceptable for M2b — add `// ponytail:` that a true chrome-less print route via a route group is deferred). Clean table + totals + "Generated <date> · valid until <date>". OWNER-only cost columns hidden here too (use `redactQuotationItems`).

- [ ] **Step 6: `approvals/page.tsx` + `actions.ts`** — `if (!can(user, 'quotation.approve')) redirect('/')`. `listPendingApprovals(user.orgId)` → table: `quoteNo`, product, qty, `originalRate` (List), `requestedRate`, gap %, requestedBy; APPROVE / REJECT buttons + an optional note input, posting to `decideApprovalAction`. Empty state "No price approvals waiting."

- [ ] **Step 7: Nav** — add the two items to `NAV_ITEMS` in `src/components/app-nav.tsx` (`/quotations` after `/distributors`; `/approvals` with `ownerOnly: true`).

- [ ] **Step 8: Gates** — `npm test` ×2 (unchanged) · `tsc` · `lint` · `build` (new routes appear in the manifest).

- [ ] **Step 9: Commit**

```bash
git add src/app/\(app\)/quotations src/app/\(app\)/approvals src/components/app-nav.tsx
git commit -m "feat(m2b): quotation screens (list/new/detail/print) + price-approval queue + nav"
```

---

### Task 12: Schemes screen

**Files:**
- Create: `src/app/(app)/schemes/page.tsx` · `schemes/scheme-form.tsx` (client) · `schemes/actions.ts`
- Modify: `src/components/app-nav.tsx` (add `{ href: '/schemes', label: 'Schemes', ownerOnly: true }`)

**Interfaces:**
- Consumes: `listSchemes`, `getScheme`, `createScheme`, `updateScheme` (Task 9); `listProducts`, `listCategories` from `@/server/services/product` (for the scope picker).
- Produces: Server Actions `createSchemeAction(formData)` and `updateSchemeAction(id, formData)` — both map the flat form fields to `SchemeFormInput` (money fields via `rupees()` when `benefitKind !== 'PCT'` and for `minValue`), `revalidatePath('/schemes')`.

**Pattern reference:** mirror `settings/forms.tsx` (a `'use client'` form component with `useActionState`) + `settings/page.tsx`.

- [ ] **Step 1: `schemes/actions.ts`** — parse `name`, `type` (`SCHEME_TYPES`), `scopeType` (`SCHEME_SCOPES`), `scopeId` (from a product/category `<select>`, `null` when `scopeType === 'ALL'`), `startDate`/`endDate`, `minQty`, `minValue` (rupees), `benefitKind` (`SCHEME_BENEFIT_KINDS`), `benefitValue` (percent as-is for `PCT`, `rupees()` for `AMOUNT`/`PER_UNIT`), `eligibleGrades` (checkbox group A/B/C), `active` checkbox. `createSchemeAction` calls `createScheme`; `updateSchemeAction` calls `updateScheme`.

- [ ] **Step 2: `schemes/scheme-form.tsx`** — client form. `benefitKind` `<select>` toggles the `benefitValue` label between "Percent" and "₹". `scopeType` `<select>` toggles a product `<select>` / category `<select>` / nothing. Uses `useActionState` to surface `{ error }` returned by the action on a zod failure.

- [ ] **Step 3: `schemes/page.tsx`** — `if (!can(user, 'scheme.view')) redirect('/')`. Table of existing schemes (name, type, scope label, window, benefit summary, active). Below it, the create form (OWNER only — `can(user, 'scheme.edit')`). Editing an existing scheme in M2b: a per-row "Edit" that pre-fills the same form via a `?edit=<id>` query param (server reads `getScheme` and passes `defaults`) — or, simpler for M2b, only `active` toggle + delete inline and full edit deferred; **choose the `?edit=` pre-fill** so `updateScheme` gets real coverage from the UI.

- [ ] **Step 4: Nav** — add `/schemes` (`ownerOnly: true`) to `NAV_ITEMS`.

- [ ] **Step 5: Gates** — `npm test` ×2 · `tsc` · `lint` · `build`.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/schemes src/components/app-nav.tsx
git commit -m "feat(m2b): schemes management screen + nav"
```

---

### Task 13: Demo seed + smoke sweep + docs

**Files:**
- Modify: `src/server/db/seed.ts` (`seedDemo` adds distributors + schemes + a quotation; `purgeDemo` removes them)
- Modify: `tests/e2e/smoke-owner.spec.ts` (convert → quote → approve → scheme steps)
- Modify: `docs/BUILD-LOG.md`, `docs/PONYTAIL-DEBT.md`

**Interfaces:**
- Consumes: `convertLead`, `createScheme`, `createQuotation` — but `seedDemo` runs without an `AppUser`, so insert rows directly with the Drizzle client the way `seedDemo` already does for leads (do **not** call the services from the seed). Keep it a fixed, reviewable set.

- [ ] **Step 1: Extend `seedDemo`** (after `seedCatalogue` has populated `categories`/`products`/`product_prices`):

```ts
import { distributors } from './schema/distributor';
import { schemes } from './schema/scheme';
import { quotations, quotationItems } from './schema/quotation';
import { categories, products, productPrices } from './schema/product';
```

After the tasks insert, add (inside `seedDemo`, still guarded by the `hasDemoData` early-return):

```ts
// two distributors converted from appointed/first-order demo leads
const ashirwad = leadRows[16]; // APPOINTED
const coastal = leadRows[17];  // FIRST_ORDER
const distRows = await db.insert(distributors).values([
  {
    orgId, businessName: ashirwad.businessName, contactPerson: ashirwad.contactPerson,
    phone: ashirwad.phone, address: ashirwad.address, territoryId: ashirwad.territoryId,
    exclusive: true, assignedEmployeeId: ashirwad.assignedEmployeeId, appointmentDate: ymd(daysFromNow(-20)),
    status: 'ACTIVE', grade: ashirwad.grade, creditLimit: rupees(2_00_000), creditDays: 21,
    paymentTerms: '50% advance, balance on delivery', expectedMonthlyPurchase: rupees(6_00_000),
    sourceLeadId: ashirwad.id, isDemo: true,
  },
  {
    orgId, businessName: coastal.businessName, contactPerson: coastal.contactPerson,
    phone: coastal.phone, address: coastal.address, territoryId: coastal.territoryId,
    exclusive: false, assignedEmployeeId: coastal.assignedEmployeeId, appointmentDate: ymd(daysFromNow(-10)),
    status: 'ACTIVE', grade: coastal.grade, creditLimit: rupees(1_50_000), creditDays: 15,
    paymentTerms: 'Net 15', expectedMonthlyPurchase: rupees(5_00_000),
    sourceLeadId: coastal.id, isDemo: true,
  },
]).returning();
await db.update(distributorLeads).set({ convertedDistributorId: distRows[0].id }).where(eq(distributorLeads.id, ashirwad.id));
await db.update(distributorLeads).set({ convertedDistributorId: distRows[1].id }).where(eq(distributorLeads.id, coastal.id));

// two schemes
const [dryFruits] = await db.select().from(categories).where(and(eq(categories.orgId, orgId), eq(categories.name, 'Dry Fruits')));
if (dryFruits) {
  await db.insert(schemes).values([
    {
      orgId, name: 'September Dry Fruits 3%', type: 'FLAT_DISCOUNT', scopeType: 'CATEGORY', scopeId: dryFruits.id,
      startDate: ymd(daysFromNow(-10)), endDate: ymd(daysFromNow(30)),
      benefit: { kind: 'PCT', value: 3 }, eligibility: {}, active: true, isDemo: true,
    },
    {
      orgId, name: 'Bulk 50+ units ₹5/unit', type: 'QTY_SCHEME', scopeType: 'ALL', scopeId: null,
      startDate: ymd(daysFromNow(-30)), endDate: ymd(daysFromNow(60)), minQty: 50,
      benefit: { kind: 'PER_UNIT', value: rupees(5) }, eligibility: {}, active: true, isDemo: true,
    },
  ]);
}

// one draft quotation for the Coastal distributor: one AUTO line, one below-target line
const priced = await db.select({ p: products, pr: productPrices }).from(products)
  .innerJoin(productPrices, eq(productPrices.productId, products.id))
  .where(eq(products.orgId, orgId)).limit(2);
if (priced.length === 2) {
  const [qd] = await db.insert(quotations).values({
    orgId, quoteNo: `Q-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-001`,
    distributorId: distRows[1].id, quoteDate: ymd(new Date()), validUntil: ymd(daysFromNow(7)),
    status: 'DRAFT', isDemo: true,
  }).returning();
  await db.insert(quotationItems).values([
    {
      orgId, quotationId: qd.id, productId: priced[0].p.id, qty: 20,
      requestedRate: priced[0].pr.targetPrice, listRate: priced[0].pr.distributorPrice,
      floorRate: priced[0].pr.floorPrice, targetRate: priced[0].pr.targetPrice,
      gstPct: priced[0].p.gstPct, netAmount: 20 * priced[0].pr.targetPrice, approvalStatus: 'AUTO',
    },
    {
      orgId, quotationId: qd.id, productId: priced[1].p.id, qty: 10,
      requestedRate: priced[1].pr.floorPrice + 1, listRate: priced[1].pr.distributorPrice,
      floorRate: priced[1].pr.floorPrice, targetRate: priced[1].pr.targetPrice,
      gstPct: priced[1].p.gstPct, netAmount: 10 * (priced[1].pr.floorPrice + 1), approvalStatus: 'PENDING',
    },
  ]);
}
```

Add the `console.log` summary line's counts. (`rupees` is already imported in `seed.ts`; `eq`/`and` already imported.)

- [ ] **Step 2: Extend `purgeDemo`** — before the `territories` delete, add (order respects the FKs — approvals → items → quotations, applications → schemes, then distributors):

```ts
import { schemeApplications, schemes } from './schema/scheme';
import { priceApprovals, quotationItems, quotations } from './schema/quotation';
import { distributors } from './schema/distributor';
```

```ts
// M2b demo rows. price_approvals / quotation_items FK their parents, so child-first.
const demoQuotes = await db.select({ id: quotations.id }).from(quotations)
  .where(and(eq(quotations.orgId, orgId), eq(quotations.isDemo, true)));
const demoQuoteIds = demoQuotes.map((q) => q.id);
if (demoQuoteIds.length) {
  const demoItems = await db.select({ id: quotationItems.id }).from(quotationItems)
    .where(inArray(quotationItems.quotationId, demoQuoteIds));
  const itemIds = demoItems.map((i) => i.id);
  if (itemIds.length) {
    await db.delete(priceApprovals).where(inArray(priceApprovals.quotationItemId, itemIds));
    await db.delete(schemeApplications).where(inArray(schemeApplications.quotationItemId, itemIds));
    await db.delete(quotationItems).where(inArray(quotationItems.quotationId, demoQuoteIds));
  }
  await db.delete(quotations).where(inArray(quotations.id, demoQuoteIds));
}
await db.delete(schemeApplications).where(and(eq(schemeApplications.orgId, orgId)));
await db.delete(schemes).where(and(eq(schemes.orgId, orgId), eq(schemes.isDemo, true)));
await db.delete(distributors).where(and(eq(distributors.orgId, orgId), eq(distributors.isDemo, true)));
```

Add `inArray` to the drizzle import in `seed.ts`. (`schemeApplications` blanket-delete by org is safe — nothing else writes it in M2b demo; keep it simple.)

- [ ] **Step 3: Seed round-trips** — run:

```bash
npm run db:seed -- --purge && npm run db:seed
```

Expected: no error; the summary line reports 2 distributors, 2 schemes, 1 quotation. Then `npm run db:seed -- --purge` again leaves zero M2b demo rows (verify with a quick `psql` count or a one-off script). Restore with `npm run db:seed` + `npm run db:seed:catalogue` + `npm run dev:fixtures`.

- [ ] **Step 4: Extend `tests/e2e/smoke-owner.spec.ts`** — add one `test(...)` block that, with the dev server up and demo data loaded:
  - opens a demo lead at stage APPROVED/APPOINTED without a conversion, fills the Convert panel (territory + credit), submits, asserts the URL is `/distributors/<uuid>` and no server error
  - goes to `/quotations`, "New quotation", picks the demo distributor, adds one line (product + qty + a rate ≥ target), saves, asserts the detail page renders, clicks "Submit quotation", asserts status shows "SENT"
  - creates a below-target quote line the same way, submits, goes to `/approvals`, clicks APPROVE on the row, asserts it clears
  - goes to `/schemes`, creates a FLAT_DISCOUNT PCT scheme, asserts it appears in the table

  Keep the header comment's "manual, throwaway, mutates devbrowse" note. Use unique timestamped names as the existing territory test does.

- [ ] **Step 5: Docs** — append a BUILD-LOG entry per completed task (13 lines) and add PONYTAIL-DEBT rows for: hand-appended `quotations_party_ck`; `quoteNo` allocator is a non-transactional count (+1) — fine for one owner, needs a sequence for concurrency; quotation line-items have no edit path in M2b (recreate the quote); `DISTRIBUTOR_INCENTIVE` benefit accrual deferred to Phase 2; `/quotations/[id]/print` still renders inside the app chrome; quotation list totals are computed row-by-row (no SQL sum).

- [ ] **Step 6: Full gates** — `npm test` ×2 · `npx tsc --noEmit` · `npm run lint` · `npm run build`. Then restore `devbrowse` demo data.

- [ ] **Step 7: Commit**

```bash
git add src/server/db/seed.ts tests/e2e/smoke-owner.spec.ts docs/BUILD-LOG.md docs/PONYTAIL-DEBT.md
git commit -m "feat(m2b): demo seed (distributors/schemes/quotation) + smoke sweep + debt ledger"
```

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| §4.4 `distributors` table (all fields, status enum) | 1 |
| §4.4 / §13 territory-exclusivity blocking alert + owner override recorded | 1 (`overlapsExclusive`), 2 (update), 3 (convert), 5 (UI banner) |
| §5.5 conversion: appointed lead → distributor, lead linked, funnel metrics intact | 3 (`convertLead` sets `convertedDistributorId`, bumps stage to APPOINTED, lead not deleted) |
| §4.6 `quotations` + `quotation_items` (lead XOR distributor, `valid_until` required, rate snapshots) | 6 |
| §16 price-approval ladder (≥target auto / [floor,target) admin / <floor blocked) + `price_approvals` | 7 (`classifyRate`), 10 (`submitQuotation`, `decideApproval`) |
| §4.6 `schemes` (FLAT_DISCOUNT / QTY_SCHEME / DISTRIBUTOR_INCENTIVE) + `scheme_applications` | 8 (domain), 9 (schema + service), 10 (auto-apply on quote lines) |
| §4.6 "M2 ships FLAT_DISCOUNT + QTY_SCHEME + DISTRIBUTOR_INCENTIVE" | 8/9/10 — incentive defined & eligible, payout deferred (documented) |
| §3.5 integer paise, soft-delete, audit every mutation | every service task |
| §3.3 SALES cost redaction (floor/target on quote lines) | 10 (`redactQuotationItem`), 4 (`redactDistributor` hook) |
| Nav: Distributors, Schemes & Discounts (§6.1) + Quotations + Approvals | 4, 11, 12 |
| Settings: bands/thresholds/targets/weights | done in M2a — `priceApprovalRequired` toggle added to config in Task 10 (no Settings UI in M2b; `// ponytail` note) |

Gap accepted & recorded: no Settings **UI** control for `priceApprovalRequired` in M2b (config default `true`; flip via a direct `setConfig` if needed) — PONYTAIL-DEBT row in Task 13. Billing Request to F&F is explicitly Phase 2 (needs Orders) — not in scope.

**2. Placeholder scan** — every code step carries real code or an explicit field-by-field spec with exact enum/column names. Screen tasks (4, 5, 11, 12) name every file, action signature, and field, and point at a concrete existing file to mirror — consistent with "follow established patterns in an existing codebase". No "TBD"/"handle errors"/"similar to Task N".

**3. Type consistency** — `classifyRate` returns `'AUTO' | 'NEEDS_APPROVAL' | 'BELOW_FLOOR'` (domain), mapped to the DB `approval_status` set `'AUTO' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'BLOCKED'` in Task 10 — the mapping is stated explicitly in both Task 7 and Task 10. `SchemeDef` (domain, dates as `'YYYY-MM-DD'` strings) vs `SchemeRow` (DB) bridged by `toSchemeDef` in Task 9, consumed in Task 10. `overlapsExclusive(orgId, territoryId, excludeDistributorId?)` signature identical in Task 1 (impl), Task 2 (update), Task 3 (convert). `convertLeadSchema` uses `.default()` → `ConvertLeadInput = z.input<...>` (Task 3), matching the repo's `LeadInput` pattern. `redact*` helpers follow the exact `stripFinancial(user, row, FIELDS)` shape from `lead.ts` / `product.ts`.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-01-super-stockist-milestone-2b-distributors-quotations.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — a fresh subagent per task, task review (spec + quality) after each, broad whole-branch review at the end.

**2. Inline Execution** — tasks executed in this session via `executing-plans`, batch execution with checkpoints.

**Which approach?**
