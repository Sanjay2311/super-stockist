# Super Stockist — Milestone 1 (Field CRM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployed, usable Field CRM: the sales employee can log in, work distributor leads through a pipeline, record activities and follow-ups, see Today's Tasks, and submit a daily report; the owner sees a summary dashboard.

**Architecture:** Next.js 15 App Router deployed to Cloudflare via the OpenNext adapter. Mutations run as Server Actions calling a service layer (`src/server/services/*`); the service layer is the only code that touches the database. All business math lives in pure, framework-free functions in `src/domain/*` with their own unit tests. Supabase provides Postgres and email/password auth; authorization is a static role→actions matrix checked server-side. Money is stored as integer paise.

**Tech Stack:** TypeScript, Next.js 15 (App Router, React 19), Tailwind CSS v4 + shadcn/ui, Drizzle ORM + `postgres` (postgres.js) against Supabase (Supavisor pooler, transaction mode), `@supabase/ssr` for auth cookies, `@dnd-kit` for the Kanban board, `@tanstack/react-table` for tables, `react-hook-form` + `zod`, Vitest + Playwright, `@opennextjs/cloudflare` + `wrangler` for deploy.

**Spec:** `docs/superpowers/specs/2026-08-31-super-stockist-design.md` — read it alongside this plan. This plan implements only **Milestone 1 — Field CRM** (spec §9). Milestones 2–3 and Phases 2–3 are out of scope here.

## Global Constraints

- **Money:** integer **paise** everywhere (`type Paise = number`). Never store rupees or floats. Format for display with `formatINR` (en-IN, lakh/crore).
- **Locale/time:** `en-IN`, dates rendered `DD MMM YYYY`, app timezone `Asia/Kolkata`. Store timestamps as UTC `timestamptz`.
- **DB access boundary:** only `src/server/services/*` and `src/server/db/*` import the Drizzle client. Server Actions, route handlers, and components call services, never the client directly.
- **Domain purity:** `src/domain/*` imports nothing from `next`, `react`, Drizzle, or Supabase. Pure functions only.
- **Authorization:** every Server Action and protected route calls `requireUser()` then `can(user, action)` before doing work. `SALES` never receives cost/financial fields — strip them server-side with `stripFinancial`.
- **Soft delete:** relationship/financial tables use `deleted_at`; list queries filter it out. No hard deletes in app code.
- **Audit:** mutating services that change leads, territories, tasks, config, or scores wrap writes in `withAudit()`.
- **IDs:** all primary keys are `uuid` default `gen_random_uuid()`. All tables carry `org_id uuid not null`, `created_at`, `updated_at`.
- **Naming:** DB tables/columns `snake_case`; TypeScript `camelCase`; Drizzle schema objects `camelCase` mapping to snake_case columns.
- **ponytail ruleset** (`AGENTS.md`) applies to every task. Prefer deletion, reuse, one line. Mark deliberate corners with a `// ponytail:` comment naming the ceiling and log them in `docs/PONYTAIL-DEBT.md`.
- **Definition of Done (every task):** all tests green (`npm test`) · `docs/BUILD-LOG.md` entry appended · `docs/PONYTAIL-DEBT.md` updated if a corner was cut · ponytail-review self-check on the diff · one focused commit. Verify `npm run dev` still boots before committing.

## Shared Types (defined in Task 3 / Task 6, referenced throughout)

```ts
type Paise = number;
type Role = 'OWNER' | 'SALES';

type LeadStage =
  | 'IDENTIFIED' | 'CONTACTED' | 'QUALIFIED' | 'MEETING_SCHEDULED'
  | 'PRESENTATION_DONE' | 'COMMERCIAL_DISCUSSION' | 'NEGOTIATION' | 'APPROVED'
  | 'APPOINTED' | 'FIRST_ORDER' | 'ACTIVATED' | 'REPEAT_ORDER' | 'LOST' | 'ON_HOLD';

interface AppUser {
  id: string;          // = Supabase auth uid, = users.id
  email: string;
  name: string;
  role: Role;
  employeeId: string | null;
  orgId: string;
}
```

## File Structure

```
Root config
  package.json, tsconfig.json, next.config.ts, open-next.config.ts, wrangler.toml
  tailwind + postcss config, components.json (shadcn), drizzle.config.ts
  vitest.config.ts, playwright.config.ts, .env.example
  docs/BUILD-LOG.md, docs/PONYTAIL-DEBT.md, README.md

src/domain/            pure functions, no framework imports
  money.ts             Paise helpers, formatINR
  scoring.ts           scoreDistributor(inputs, weights)
  pipeline.ts          STAGES, stageRank, defaultProbability, weightedPipelineValue, funnelConversion
  followup.ts          isHotLead, classifyFollowUp

src/lib/
  format.ts            formatDate (en-IN), relative day helpers
  schemas.ts           shared zod schemas (lead, activity, task, dailyReport, territory)

src/server/db/
  client.ts            drizzle client (postgres.js, pooler, prepare:false)
  schema/{identity,territory,crm,config,audit,index}.ts
  seed.ts              base + demo seed, is_demo markers, purgeDemo()

src/server/auth/
  supabase.ts          @supabase/ssr server client (cookie bridge)
  session.ts           getSession(), requireUser()
  permissions.ts       ROLE_MATRIX, can(), stripFinancial()

src/server/services/
  audit.ts             withAudit()
  config.ts            getConfig(key), setConfig(key,value), CONFIG_DEFAULTS
  territory.ts         list/tree/create/update, overlapsExclusive()
  lead.ts              create/update/list/get, setStage(), rescoreLead()
  activity.ts          addActivity() (updates lead.next_follow_up_at)
  task.ts              create/update/complete, listOpen()
  followup.ts          getFollowUpBuckets(), getTodayView()
  dailyReport.ts       submitReport(), listReports(), deriveCounts()

src/app/
  layout.tsx, globals.css
  (auth)/login/page.tsx, (auth)/login/actions.ts
  (app)/layout.tsx                  app shell, requires session
  (app)/page.tsx                    minimal dashboard
  (app)/territories/page.tsx + actions.ts
  (app)/leads/page.tsx             list + create
  (app)/leads/[id]/page.tsx        detail: fields, score, activity timeline
  (app)/leads/actions.ts
  (app)/pipeline/page.tsx          Kanban
  (app)/pipeline/actions.ts
  (app)/today/page.tsx             Today's Tasks (tasks + due follow-ups)
  (app)/today/actions.ts
  (app)/daily-report/page.tsx      employee submit
  (app)/reports/daily/page.tsx     owner: list of submitted reports
  (app)/settings/page.tsx + actions.ts
  api/health/route.ts

src/components/
  ui/                              shadcn primitives (button, input, select, dialog, ...)
  app-nav.tsx                      role-aware sidebar + mobile bottom nav
  data-table.tsx                   TanStack table wrapper (search, sort, pagination)
  stage-badge.tsx, grade-badge.tsx

tests/
  domain/{money,scoring,pipeline,followup}.test.ts
  services/{territory,lead,activity,followup,dailyReport}.test.ts
  helpers/db.ts                    connects TEST_DATABASE_URL, resetDb()
  e2e/{auth,lead-pipeline}.spec.ts
```

---

### Task 1: Project scaffold + tooling + docs skeleton

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `open-next.config.ts`, `wrangler.toml`, `postcss.config.mjs`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/(app)/page.tsx`, `src/app/api/health/route.ts`
- Create: `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `.gitignore`
- Create: `src/domain/money.ts`, `tests/domain/money.test.ts`
- Create: `docs/BUILD-LOG.md`, `docs/PONYTAIL-DEBT.md`, `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a booting Next.js app on Cloudflare-compatible config; `npm test` runs Vitest; `npm run e2e` runs Playwright; `formatINR(paise: Paise): string` and `rupees(n: number): Paise` from `src/domain/money.ts`.

- [ ] **Step 1: Initialise the project**

Run:
```bash
npx create-next-app@latest . --typescript --app --tailwind --eslint --src-dir --import-alias "@/*" --no-turbopack --use-npm
```
Accept overwriting the empty repo. Then add dependencies:
```bash
npm i drizzle-orm postgres @supabase/ssr @supabase/supabase-js zod react-hook-form @hookform/resolvers @tanstack/react-table @dnd-kit/core @dnd-kit/sortable date-fns
npm i -D drizzle-kit vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom @playwright/test @opennextjs/cloudflare wrangler tsx
```

- [ ] **Step 2: Write the failing test**

Create `tests/domain/money.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatINR, rupees } from '@/domain/money';

describe('money', () => {
  it('converts rupees to integer paise', () => {
    expect(rupees(107)).toBe(10700);
    expect(rupees(50.4)).toBe(5040);
  });
  it('formats paise as en-IN currency with lakh grouping', () => {
    expect(formatINR(10700)).toBe('₹107.00');
    expect(formatINR(15000000)).toBe('₹1,50,000.00');
  });
});
```

- [ ] **Step 3: Configure Vitest and verify the test fails**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    setupFiles: [],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/e2e/**'],
  },
});
```
Add scripts to `package.json`:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run",
  "test:watch": "vitest",
  "e2e": "playwright test",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx src/server/db/migrate.ts",
  "db:seed": "tsx src/server/db/seed.ts",
  "cf:build": "opennextjs-cloudflare build",
  "cf:deploy": "opennextjs-cloudflare build && wrangler deploy"
}
```
Run: `npm test`
Expected: FAIL — `Cannot find module '@/domain/money'`.

- [ ] **Step 4: Implement `src/domain/money.ts`**

```ts
export type Paise = number;

/** Convert a rupee amount (possibly with 2 decimals) to integer paise. */
export function rupees(amount: number): Paise {
  return Math.round(amount * 100);
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

/** Format integer paise as an en-IN currency string (lakh/crore grouping). */
export function formatINR(paise: Paise): string {
  return inr.format(paise / 100);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS (2 tests).

- [ ] **Step 6: Cloudflare + Next config, health route, minimal page**

Create `open-next.config.ts`:
```ts
import { defineCloudflareConfig } from '@opennextjs/cloudflare';
export default defineCloudflareConfig({});
```
Create `wrangler.toml`:
```toml
name = "super-stockist"
main = ".open-next/worker.js"
compatibility_date = "2025-03-01"
compatibility_flags = ["nodejs_compat"]
assets = { directory = ".open-next/assets", binding = "ASSETS" }

[vars]
NEXT_PUBLIC_SUPABASE_URL = ""
# secrets set via `wrangler secret put`: SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, CRON_SECRET
```
Create `src/app/api/health/route.ts`:
```ts
export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ ok: true, ts: new Date().toISOString() });
}
```
Replace `src/app/(app)/page.tsx` with a placeholder:
```tsx
export default function DashboardPage() {
  return <main className="p-6"><h1 className="text-xl font-semibold">Super Stockist</h1><p className="text-sm text-neutral-500">Milestone 1 scaffold.</p></main>;
}
```

- [ ] **Step 7: `.env.example`, docs skeletons, Playwright config**

Create `.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
CRON_SECRET=dev-secret
```
Create `playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://127.0.0.1:3000' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:3000', reuseExistingServer: true },
});
```
Create `docs/BUILD-LOG.md`:
```markdown
# Build Log

One entry per completed task: what shipped, files touched, tests run + result, shortcuts.

## 2026-08-31 — Task 1: Project scaffold
- Next.js 15 App Router + Tailwind v4 + TS scaffolded; deps installed.
- Cloudflare (OpenNext) config, health route, `src/domain/money.ts`.
- Tests: `npm test` → 2 passed.
- Shortcuts: no CI pipeline yet (see PONYTAIL-DEBT).
```
Create `docs/PONYTAIL-DEBT.md`:
```markdown
# Ponytail Debt Ledger

Deliberate corners cut, each with its ceiling and the task that clears it.

| Date | Item | Ceiling | Upgrade path | Cleared by |
|------|------|---------|--------------|------------|
| 2026-08-31 | No CI pipeline | Tests only run locally | Add GitHub Actions running `npm test` + `npm run e2e` | Post-M1 |
```
Create `README.md` with: prerequisites (Node 20+, Docker, Supabase CLI), `cp .env.example .env.local`, `supabase start`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`. (Fill deploy section in Task 20.)

- [ ] **Step 8: Verify boot, then commit**

Run: `npm run dev` → open `http://127.0.0.1:3000` (dashboard placeholder) and `http://127.0.0.1:3000/api/health` (`{ ok: true }`). Stop the server.
Run: `npm test` → PASS.
```bash
git add -A
git commit -m "chore: scaffold Next.js + Cloudflare + Vitest, add money domain helper"
```

---

### Task 2: Database client + migration runner + test DB helper

**Files:**
- Create: `src/server/db/client.ts`, `src/server/db/migrate.ts`, `drizzle.config.ts`
- Create: `src/server/db/schema/index.ts` (empty barrel for now)
- Create: `tests/helpers/db.ts`
- Create: `tests/services/db-connection.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL`, `TEST_DATABASE_URL` from env.
- Produces:
  - `db` — the Drizzle client (`import { db } from '@/server/db/client'`).
  - `runMigrations(): Promise<void>` from `migrate.ts`.
  - `tests/helpers/db.ts`: `testDb` (Drizzle client on `TEST_DATABASE_URL`), `resetDb(): Promise<void>` (truncates all app tables), `migrateTestDb(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `tests/services/db-connection.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { testDb } from '../helpers/db';

describe('db connection', () => {
  it('runs a trivial query against the test database', async () => {
    const rows = await testDb.execute(sql`select 1 as n`);
    expect(rows[0].n).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- db-connection`
Expected: FAIL — `Cannot find module '../helpers/db'`.

- [ ] **Step 3: Implement the client**

Create `src/server/db/client.ts`:
```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// Supavisor transaction-mode pooling requires prepared statements off.
const queryClient = postgres(url, { prepare: false });

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
```

Create `src/server/db/schema/index.ts`:
```ts
// Barrel — re-exports every table module. Populated as schema tasks land.
export {};
```

- [ ] **Step 4: Implement the migration runner and drizzle config**

Create `drizzle.config.ts`:
```ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './src/server/db/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Create `src/server/db/migrate.ts`:
```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export async function runMigrations(url = process.env.DATABASE_URL!) {
  const client = postgres(url, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  await client.end();
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations().then(() => { console.log('migrations applied'); process.exit(0); });
}
```

- [ ] **Step 5: Implement the test DB helper**

Create `tests/helpers/db.ts`:
```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { runMigrations } from '@/server/db/migrate';
import * as schema from '@/server/db/schema';

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!;
const client = postgres(url, { prepare: false });
export const testDb = drizzle(client, { schema });

export async function migrateTestDb() {
  await runMigrations(url);
}

/** Truncate every table in the public schema except drizzle's migration bookkeeping. */
export async function resetDb() {
  const rows = await testDb.execute(sql`
    select tablename from pg_tables
    where schemaname = 'public' and tablename not like '__drizzle%'
  `);
  const names = rows.map((r: any) => `"${r.tablename}"`).join(', ');
  if (names) await testDb.execute(sql.raw(`truncate ${names} restart identity cascade`));
}
```

- [ ] **Step 6: Run the test to verify it passes**

Prerequisite: `supabase start` is running (provides Postgres on `127.0.0.1:54322`).
Run: `npm test -- db-connection`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: drizzle client, migration runner, test db helper"
```
Append the BUILD-LOG entry.

---

### Task 3: Identity schema (orgs, brands, users, employees) + base seed

**Files:**
- Create: `src/server/db/schema/identity.ts`
- Modify: `src/server/db/schema/index.ts` (export identity)
- Create: `src/server/db/seed.ts` (base seed only; demo data added in Task 19)
- Create: `tests/services/identity-schema.test.ts`
- Generate: `drizzle/0000_*.sql` via `npm run db:generate`

**Interfaces:**
- Consumes: `db` from Task 2.
- Produces (Drizzle tables, all `camelCase` exports):
  - `orgs` { id, name, createdAt, updatedAt }
  - `brands` { id, orgId, name, gstin (text, nullable), billingState (text, nullable), createdAt, updatedAt }
  - `users` { id (uuid, = Supabase uid, PK, no default), orgId, email (unique), name, role (text: 'OWNER'|'SALES'), status (text: 'active'|'disabled', default 'active'), employeeId (uuid, nullable), createdAt, updatedAt }
  - `employees` { id, orgId, name, phone (text), email (text, nullable), joiningDate (date, nullable), status (text, default 'active'), userId (uuid, nullable), createdAt, updatedAt }
  - `seedBase(): Promise<{ orgId: string; brandId: string }>` — idempotent; inserts one org ("Bangalore East Super Stockist") and one brand ("Farm & Farmers", billingState 'Rajasthan') if absent, returns their ids.

- [ ] **Step 1: Write the failing test**

Create `tests/services/identity-schema.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, migrateTestDb, resetDb } from '../helpers/db';
import { orgs, brands } from '@/server/db/schema/identity';
import { seedBase } from '@/server/db/seed';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('identity schema + base seed', () => {
  it('seeds exactly one org and one brand, idempotently', async () => {
    const a = await seedBase();
    const b = await seedBase();
    expect(a.orgId).toBe(b.orgId);
    const orgRows = await testDb.select().from(orgs);
    const brandRows = await testDb.select().from(brands).where(eq(brands.orgId, a.orgId));
    expect(orgRows).toHaveLength(1);
    expect(brandRows).toHaveLength(1);
    expect(brandRows[0].billingState).toBe('Rajasthan');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- identity-schema`
Expected: FAIL — module `@/server/db/schema/identity` not found.

- [ ] **Step 3: Implement the schema**

Create `src/server/db/schema/identity.ts`:
```ts
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
  id: uuid('id').primaryKey(),              // Supabase auth uid, no default
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(),            // 'OWNER' | 'SALES'
  status: text('status').notNull().default('active'),
  employeeId: uuid('employee_id').references(() => employees.id),
  ...ts,
}, (t) => ({ emailIdx: uniqueIndex('users_email_idx').on(t.email) }));
```

Update `src/server/db/schema/index.ts`:
```ts
export * from './identity';
```

- [ ] **Step 4: Implement the base seed**

Create `src/server/db/seed.ts`:
```ts
import { db } from './client';
import { orgs, brands } from './schema/identity';

const ORG_NAME = 'Bangalore East Super Stockist';
const BRAND_NAME = 'Farm & Farmers';

export async function seedBase(): Promise<{ orgId: string; brandId: string }> {
  let [org] = await db.select().from(orgs);
  if (!org) [org] = await db.insert(orgs).values({ name: ORG_NAME }).returning();

  let [brand] = await db.select().from(brands);
  if (!brand) {
    [brand] = await db.insert(brands)
      .values({ orgId: org.id, name: BRAND_NAME, billingState: 'Rajasthan' })
      .returning();
  }
  return { orgId: org.id, brandId: brand.id };
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seedBase().then((r) => { console.log('base seed done', r); process.exit(0); });
}
```

> `seed.ts` imports `./client`, which reads `DATABASE_URL`. The test imports `seedBase` too — ensure `src/server/db/client.ts` picks up `TEST_DATABASE_URL` when running under Vitest. Adjust `client.ts`:
> ```ts
> const url = process.env.VITEST ? (process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL) : process.env.DATABASE_URL;
> ```
> `// ponytail:` single client switched by VITEST env — ceiling: one DB per process. Upgrade path: inject the client. Log it.

- [ ] **Step 5: Generate and apply the migration**

Run:
```bash
npm run db:generate      # writes drizzle/0000_*.sql
npm run db:migrate        # applies to DATABASE_URL (local supabase)
```
Commit the generated SQL file with the task.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- identity-schema`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: identity schema (orgs, brands, users, employees) + idempotent base seed"
```
Append BUILD-LOG; add the `client.ts` VITEST switch to PONYTAIL-DEBT.

---

### Task 4: Supabase auth wiring, session helpers, login page

**Files:**
- Create: `src/server/auth/supabase.ts`, `src/server/auth/session.ts`
- Create: `src/middleware.ts`
- Create: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/login/actions.ts`
- Create: `src/app/(auth)/layout.tsx`
- Create: `src/app/(app)/layout.tsx` (session gate; nav added in Task 7)
- Create: `tests/e2e/auth.spec.ts`
- Create: `scripts/create-user.ts` (admin helper to add a login)

**Interfaces:**
- Consumes: `users`, `employees` from Task 3; `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Produces:
  - `createServerClient()` → `@supabase/ssr` server client bound to Next cookies (`src/server/auth/supabase.ts`).
  - `getSession(): Promise<AppUser | null>` — reads the Supabase session, joins the `users` row, returns `AppUser` or `null`.
  - `requireUser(): Promise<AppUser>` — `getSession()` or `redirect('/login')`.
  - `signIn(email, password)` / `signOut()` Server Actions in `login/actions.ts`.
  - `scripts/create-user.ts`: `npx tsx scripts/create-user.ts <email> <password> <name> <OWNER|SALES>` — creates the Supabase auth user (service role) and the matching `users` row under the seeded org.

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/auth.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test('unauthenticated user is redirected to /login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
});

test('owner can sign in and land on the dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.E2E_OWNER_EMAIL ?? 'owner@example.com');
  await page.getByLabel('Password').fill(process.env.E2E_OWNER_PASSWORD ?? 'password123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: /command|dashboard|super stockist/i })).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run e2e -- auth`
Expected: FAIL — no `/login` route.

- [ ] **Step 3: Implement the Supabase server client**

Create `src/server/auth/supabase.ts`:
```ts
import { createServerClient as createSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerClient() {
  const store = await cookies();
  return createSSR(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try { list.forEach(({ name, value, options }) => store.set(name, value, options)); }
          catch { /* called from a Server Component render — ignore, middleware refreshes */ }
        },
      },
    },
  );
}
```

- [ ] **Step 4: Implement session helpers**

Create `src/server/auth/session.ts`:
```ts
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema/identity';
import { createServerClient } from './supabase';

export interface AppUser {
  id: string; email: string; name: string;
  role: 'OWNER' | 'SALES'; employeeId: string | null; orgId: string;
}

export async function getSession(): Promise<AppUser | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [row] = await db.select().from(users).where(eq(users.id, user.id));
  if (!row || row.status !== 'active') return null;
  return {
    id: row.id, email: row.email, name: row.name,
    role: row.role as AppUser['role'], employeeId: row.employeeId, orgId: row.orgId,
  };
}

export async function requireUser(): Promise<AppUser> {
  const u = await getSession();
  if (!u) redirect('/login');
  return u;
}
```

- [ ] **Step 5: Implement middleware, login route, layouts**

Create `src/middleware.ts` (refreshes the auth cookie; gate is enforced in layouts + actions):
```ts
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    },
  );
  await supabase.auth.getUser();
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'] };
```

Create `src/app/(auth)/layout.tsx`:
```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh grid place-items-center bg-neutral-50 p-6">{children}</div>;
}
```

Create `src/app/(auth)/login/actions.ts`:
```ts
'use server';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/server/auth/supabase';

export async function signIn(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Invalid email or password.' };
  redirect('/');
}

export async function signOut() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
```

Create `src/app/(auth)/login/page.tsx`:
```tsx
'use client';
import { useActionState } from 'react';
import { signIn } from './actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, null as null | { error: string });
  return (
    <form action={action} className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6">
      <h1 className="text-lg font-semibold">Sign in</h1>
      <label className="block text-sm">Email
        <input name="email" type="email" required className="mt-1 w-full rounded border px-3 py-2" />
      </label>
      <label className="block text-sm">Password
        <input name="password" type="password" required className="mt-1 w-full rounded border px-3 py-2" />
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="w-full rounded bg-neutral-900 py-2 text-sm text-white disabled:opacity-50">
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
```

Create `src/app/(app)/layout.tsx`:
```tsx
import { requireUser } from '@/server/auth/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();               // redirects to /login when unauthenticated
  return <div className="min-h-dvh">{children}</div>;   // nav added in Task 7
}
```

- [ ] **Step 6: Implement the create-user script**

Create `scripts/create-user.ts`:
```ts
import { createClient } from '@supabase/supabase-js';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema/identity';
import { seedBase } from '@/server/db/seed';

const [email, password, name, role] = process.argv.slice(2);
if (!email || !password || !name || !['OWNER', 'SALES'].includes(role)) {
  console.error('usage: tsx scripts/create-user.ts <email> <password> <name> <OWNER|SALES>');
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const { orgId } = await seedBase();
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
await db.insert(users).values({ id: data.user.id, orgId, email, name, role });
console.log('created', role, email);
process.exit(0);
```

- [ ] **Step 7: Create test users and run the e2e test**

Run (with `supabase start` up and `.env.local` filled from `supabase status`):
```bash
npx tsx scripts/create-user.ts owner@example.com password123 "Owner" OWNER
npx tsx scripts/create-user.ts sales@example.com password123 "Sales Rep" SALES
E2E_OWNER_EMAIL=owner@example.com E2E_OWNER_PASSWORD=password123 npm run e2e -- auth
```
Expected: PASS (both tests). The dashboard heading regex matches the "Super Stockist" placeholder from Task 1.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: Supabase email/password auth, session helpers, login page, route gate"
```
Append BUILD-LOG. Note in PONYTAIL-DEBT: route gate is per-layout `requireUser()` (not middleware) — ceiling: a new top-level route group could forget it; upgrade path: centralise in middleware with a matcher.

---

### Task 5: Permission matrix + `can()` + financial field stripping

**Files:**
- Create: `src/server/auth/permissions.ts`
- Create: `tests/domain/permissions.test.ts`

**Interfaces:**
- Consumes: `AppUser` from Task 4.
- Produces:
  - `type Action` — union of permission action strings (listed below).
  - `can(user: AppUser, action: Action): boolean`.
  - `assertCan(user: AppUser, action: Action): void` — throws `Error('forbidden')` when denied.
  - `stripFinancial<T>(user: AppUser, row: T, fields: (keyof T)[]): T` — returns a shallow copy with the named fields deleted when `user.role === 'SALES'`.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/permissions.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { can, assertCan, stripFinancial } from '@/server/auth/permissions';
import type { AppUser } from '@/server/auth/session';

const owner: AppUser = { id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId: 'org' };
const sales: AppUser = { id: 's', email: 's', name: 'S', role: 'SALES', employeeId: 'e1', orgId: 'org' };

describe('permissions', () => {
  it('owner can do everything, sales cannot manage config or territories', () => {
    expect(can(owner, 'config.edit')).toBe(true);
    expect(can(owner, 'territory.edit')).toBe(true);
    expect(can(sales, 'lead.create')).toBe(true);
    expect(can(sales, 'lead.update')).toBe(true);
    expect(can(sales, 'config.edit')).toBe(false);
    expect(can(sales, 'territory.edit')).toBe(false);
    expect(can(sales, 'dailyReport.viewAll')).toBe(false);
  });
  it('assertCan throws "forbidden" when denied', () => {
    expect(() => assertCan(sales, 'config.edit')).toThrow('forbidden');
    expect(() => assertCan(owner, 'config.edit')).not.toThrow();
  });
  it('stripFinancial removes fields only for SALES', () => {
    const row = { id: '1', name: 'X', ssBillingPrice: 10700, floorPrice: 11556 };
    expect(stripFinancial(sales, row, ['ssBillingPrice', 'floorPrice'])).toEqual({ id: '1', name: 'X' });
    expect(stripFinancial(owner, row, ['ssBillingPrice', 'floorPrice'])).toEqual(row);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- permissions`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/server/auth/permissions.ts`**

```ts
import type { AppUser, Role } from './session';

export type Action =
  | 'lead.create' | 'lead.update' | 'lead.delete' | 'lead.setStage'
  | 'activity.create'
  | 'task.create' | 'task.update' | 'task.complete'
  | 'dailyReport.submit' | 'dailyReport.viewAll'
  | 'territory.view' | 'territory.edit'
  | 'config.view' | 'config.edit'
  | 'employee.manage'
  | 'dashboard.view';

const OWNER_ACTIONS: Action[] = [
  'lead.create', 'lead.update', 'lead.delete', 'lead.setStage',
  'activity.create', 'task.create', 'task.update', 'task.complete',
  'dailyReport.submit', 'dailyReport.viewAll',
  'territory.view', 'territory.edit', 'config.view', 'config.edit',
  'employee.manage', 'dashboard.view',
];

const SALES_ACTIONS: Action[] = [
  'lead.create', 'lead.update', 'lead.setStage',
  'activity.create', 'task.create', 'task.update', 'task.complete',
  'dailyReport.submit', 'territory.view', 'config.view', 'dashboard.view',
];

const MATRIX: Record<Role, ReadonlySet<Action>> = {
  OWNER: new Set(OWNER_ACTIONS),
  SALES: new Set(SALES_ACTIONS),
};

export function can(user: AppUser, action: Action): boolean {
  return MATRIX[user.role].has(action);
}

export function assertCan(user: AppUser, action: Action): void {
  if (!can(user, action)) throw new Error('forbidden');
}

export function stripFinancial<T extends Record<string, unknown>>(
  user: AppUser, row: T, fields: (keyof T)[],
): T {
  if (user.role !== 'SALES') return row;
  const copy = { ...row };
  for (const f of fields) delete copy[f];
  return copy;
}
```
> Add `export type Role = 'OWNER' | 'SALES';` to `session.ts` and have `AppUser.role` use it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- permissions`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: role permission matrix, can/assertCan, stripFinancial"
```
Append BUILD-LOG.

---

### Task 6: `app_config` schema + config service with typed defaults

**Files:**
- Create: `src/server/db/schema/config.ts`
- Modify: `src/server/db/schema/index.ts`
- Create: `src/server/services/config.ts`
- Create: `tests/services/config.test.ts`
- Generate: new migration

**Interfaces:**
- Consumes: `db`, `seedBase`.
- Produces:
  - `appConfig` table { orgId, key (text), value (jsonb), updatedAt } — PK `(orgId, key)`.
  - `CONFIG_DEFAULTS` — typed object with the Milestone-1 keys:
    - `scoreWeights`: `{ retailerNetwork:20, categoryExperience:15, geoCoverage:15, salesmen:10, deliveryInfra:10, workingCapital:10, brandPortfolio:10, reputation:5, willingness:5 }`
    - `stageProbability`: `Record<LeadStage, number>` (IDENTIFIED 5 … NEGOTIATION 60 … APPOINTED 90 … REPEAT_ORDER 100, LOST 0, ON_HOLD 10)
    - `hotLeadProbabilityThreshold`: `60`
    - `staleQuotationDays`: `5` (unused in M1, seeded for M2)
    - `reorderCadenceDays`: `21` (unused in M1)
  - `getConfig<K extends ConfigKey>(orgId: string, key: K): Promise<ConfigShape[K]>` — returns the stored value or the default.
  - `setConfig<K extends ConfigKey>(orgId: string, key: K, value: ConfigShape[K]): Promise<void>` — upsert.

- [ ] **Step 1: Write the failing test**

Create `tests/services/config.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { getConfig, setConfig, CONFIG_DEFAULTS } from '@/server/services/config';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('config service', () => {
  it('returns the default when unset', async () => {
    const { orgId } = await seedBase();
    expect(await getConfig(orgId, 'scoreWeights')).toEqual(CONFIG_DEFAULTS.scoreWeights);
    expect(await getConfig(orgId, 'hotLeadProbabilityThreshold')).toBe(60);
  });
  it('persists and reads back an override', async () => {
    const { orgId } = await seedBase();
    const weights = { ...CONFIG_DEFAULTS.scoreWeights, reputation: 10, willingness: 0 };
    await setConfig(orgId, 'scoreWeights', weights);
    expect(await getConfig(orgId, 'scoreWeights')).toEqual(weights);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- config`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the schema**

Create `src/server/db/schema/config.ts`:
```ts
import { pgTable, uuid, text, jsonb, timestamp, primaryKey } from 'drizzle-orm/pg-core';

export const appConfig = pgTable('app_config', {
  orgId: uuid('org_id').notNull(),
  key: text('key').notNull(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.orgId, t.key] }) }));
```
Add `export * from './config';` to `schema/index.ts`.

- [ ] **Step 4: Implement the config service**

Create `src/server/services/config.ts`:
```ts
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { appConfig } from '@/server/db/schema/config';
import type { LeadStage } from '@/domain/pipeline';

export const CONFIG_DEFAULTS = {
  scoreWeights: {
    retailerNetwork: 20, categoryExperience: 15, geoCoverage: 15, salesmen: 10,
    deliveryInfra: 10, workingCapital: 10, brandPortfolio: 10, reputation: 5, willingness: 5,
  },
  stageProbability: {
    IDENTIFIED: 5, CONTACTED: 10, QUALIFIED: 20, MEETING_SCHEDULED: 30,
    PRESENTATION_DONE: 40, COMMERCIAL_DISCUSSION: 50, NEGOTIATION: 60, APPROVED: 80,
    APPOINTED: 90, FIRST_ORDER: 95, ACTIVATED: 98, REPEAT_ORDER: 100, LOST: 0, ON_HOLD: 10,
  } as Record<LeadStage, number>,
  hotLeadProbabilityThreshold: 60,
  staleQuotationDays: 5,
  reorderCadenceDays: 21,
} as const;

export type ConfigShape = typeof CONFIG_DEFAULTS;
export type ConfigKey = keyof ConfigShape;

export async function getConfig<K extends ConfigKey>(orgId: string, key: K): Promise<ConfigShape[K]> {
  const [row] = await db.select().from(appConfig)
    .where(and(eq(appConfig.orgId, orgId), eq(appConfig.key, key)));
  return (row?.value as ConfigShape[K]) ?? CONFIG_DEFAULTS[key];
}

export async function setConfig<K extends ConfigKey>(orgId: string, key: K, value: ConfigShape[K]): Promise<void> {
  await db.insert(appConfig).values({ orgId, key, value })
    .onConflictDoUpdate({ target: [appConfig.orgId, appConfig.key], set: { value, updatedAt: new Date() } });
}
```
> `src/domain/pipeline.ts` (Task 10) exports `LeadStage`. If Task 10 is not yet done, define `LeadStage` inline in `pipeline.ts` first as a stub containing only the union type, then flesh it out in Task 10. Record the ordering dependency in the BUILD-LOG.

- [ ] **Step 5: Generate + apply migration, run the test**

```bash
npm run db:generate && npm run db:migrate
npm test -- config
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: app_config schema + typed config service with M1 defaults"
```
Append BUILD-LOG.

---

### Task 7: App shell — role-aware sidebar + mobile bottom nav

**Files:**
- Create: `src/components/app-nav.tsx`
- Modify: `src/app/(app)/layout.tsx` (mount nav + sign-out)
- Create: `src/app/(app)/leads/page.tsx`, `src/app/(app)/pipeline/page.tsx`, `src/app/(app)/territories/page.tsx`, `src/app/(app)/today/page.tsx`, `src/app/(app)/daily-report/page.tsx`, `src/app/(app)/reports/daily/page.tsx`, `src/app/(app)/settings/page.tsx` — each a one-line placeholder heading for now (filled by later tasks)
- Create: `tests/e2e/nav.spec.ts`

**Interfaces:**
- Consumes: `requireUser`, `can`, `signOut`.
- Produces: `<AppNav user={user} />` — renders nav items the user may see (`NAV_ITEMS` filtered by `can`). Milestone-1 nav items: Dashboard (`/`), Today (`/today`), Pipeline (`/pipeline`), Leads (`/leads`), Territories (`/territories`), Daily Report (`/daily-report`), Reports (`/reports/daily`, OWNER only), Settings (`/settings`, OWNER only).

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/nav.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

async function login(page, email, password) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/');
}

test('owner sees Settings and Reports links', async ({ page }) => {
  await login(page, 'owner@example.com', 'password123');
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reports' })).toBeVisible();
});

test('sales rep does not see Settings or Reports', async ({ page }) => {
  await login(page, 'sales@example.com', 'password123');
  await expect(page.getByRole('link', { name: 'Pipeline' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Reports' })).toHaveCount(0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run e2e -- nav`
Expected: FAIL — no nav rendered.

- [ ] **Step 3: Implement `AppNav`**

Create `src/components/app-nav.tsx`:
```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppUser } from '@/server/auth/session';

type Item = { href: string; label: string; ownerOnly?: boolean };
const NAV_ITEMS: Item[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/today', label: 'Today' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/leads', label: 'Leads' },
  { href: '/territories', label: 'Territories' },
  { href: '/daily-report', label: 'Daily Report' },
  { href: '/reports/daily', label: 'Reports', ownerOnly: true },
  { href: '/settings', label: 'Settings', ownerOnly: true },
];

export function AppNav({ user }: { user: AppUser }) {
  const path = usePathname();
  const items = NAV_ITEMS.filter((i) => !i.ownerOnly || user.role === 'OWNER');
  return (
    <>
      <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:p-3 md:gap-1">
        <div className="px-2 py-3 text-sm font-semibold">Super Stockist</div>
        {items.map((i) => (
          <Link key={i.href} href={i.href}
            className={`rounded px-3 py-2 text-sm ${path === i.href ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'}`}>
            {i.label}
          </Link>
        ))}
      </aside>
      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t bg-white py-2 md:hidden">
        {items.slice(0, 5).map((i) => (
          <Link key={i.href} href={i.href}
            className={`px-2 text-xs ${path === i.href ? 'font-semibold text-neutral-900' : 'text-neutral-500'}`}>
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
```

- [ ] **Step 4: Mount it in the app layout**

Replace `src/app/(app)/layout.tsx`:
```tsx
import { requireUser } from '@/server/auth/session';
import { signOut } from '@/app/(auth)/login/actions';
import { AppNav } from '@/components/app-nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-dvh">
      <AppNav user={user} />
      <div className="flex-1 pb-16 md:pb-0">
        <header className="flex items-center justify-between border-b px-4 py-2 text-sm">
          <span className="text-neutral-500">{user.name} · {user.role}</span>
          <form action={signOut}><button className="text-neutral-500 hover:text-neutral-900">Sign out</button></form>
        </header>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add placeholder pages**

Each of the seven pages listed in Files:
```tsx
export default function Page() {
  return <main className="p-6"><h1 className="text-xl font-semibold">TITLE</h1></main>;
}
```
(replace `TITLE`: "Leads", "Pipeline", "Territories", "Today", "Daily Report", "Daily Reports", "Settings").

- [ ] **Step 6: Run the e2e test to verify it passes**

Run: `npm run e2e -- nav`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: role-aware app shell (sidebar + mobile bottom nav), placeholder routes"
```
Append BUILD-LOG.

---

### Task 8: Pipeline domain (`src/domain/pipeline.ts`)

**Files:**
- Create: `src/domain/pipeline.ts`
- Create: `tests/domain/pipeline.test.ts`

**Interfaces:**
- Consumes: `Paise` from `@/domain/money`.
- Produces:
  - `type LeadStage` (the 14-value union from Shared Types).
  - `STAGES: LeadStage[]` — canonical order (index 0..13).
  - `OPEN_STAGES: LeadStage[]` — all except `LOST`, `REPEAT_ORDER`, `ON_HOLD`.
  - `stageRank(stage: LeadStage): number` — index in `STAGES`.
  - `weightedPipelineValue(potential: Paise, probabilityPct: number): Paise` — `round(potential * pct / 100)`.
  - `FUNNEL_STEPS: { key: string; label: string; reaches: LeadStage }[]` — the grouped dashboard funnel (Identified, Contacted, Qualified, Meeting, Commercial Discussion, Negotiation, Appointed, First Order, Activated, Repeat Order).
  - `funnelConversion(leads: { stage: LeadStage }[]): { key: string; label: string; count: number; convFromPrev: number | null }[]` — count of leads whose `stageRank >= step.reachesRank`, and the % vs the previous step (null for the first).

- [ ] **Step 1: Write the failing test**

Create `tests/domain/pipeline.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { STAGES, OPEN_STAGES, stageRank, weightedPipelineValue, funnelConversion } from '@/domain/pipeline';

describe('pipeline domain', () => {
  it('has 14 canonical stages in order', () => {
    expect(STAGES).toHaveLength(14);
    expect(STAGES[0]).toBe('IDENTIFIED');
    expect(STAGES[STAGES.length - 1]).toBe('ON_HOLD');
    expect(stageRank('NEGOTIATION')).toBe(STAGES.indexOf('NEGOTIATION'));
  });
  it('excludes terminal/paused stages from OPEN_STAGES', () => {
    expect(OPEN_STAGES).not.toContain('LOST');
    expect(OPEN_STAGES).not.toContain('REPEAT_ORDER');
    expect(OPEN_STAGES).not.toContain('ON_HOLD');
  });
  it('weights pipeline value by probability', () => {
    expect(weightedPipelineValue(30000000, 50)).toBe(15000000);
    expect(weightedPipelineValue(10000, 33)).toBe(3300);
  });
  it('computes funnel counts and stage-to-stage conversion', () => {
    const leads = [
      { stage: 'IDENTIFIED' as const }, { stage: 'CONTACTED' as const },
      { stage: 'QUALIFIED' as const }, { stage: 'APPOINTED' as const },
      { stage: 'LOST' as const },
    ];
    const rows = funnelConversion(leads);
    const identified = rows.find((r) => r.key === 'identified')!;
    const contacted = rows.find((r) => r.key === 'contacted')!;
    expect(identified.count).toBe(4);           // LOST has rank 12, still "reached identified"? see note
    expect(contacted.convFromPrev).toBeCloseTo((contacted.count / identified.count) * 100);
  });
});
```
> Design decision to encode: `LOST` and `ON_HOLD` are **excluded** from funnel counts entirely (a lost lead did not "progress"). Adjust the test's `identified.count` expectation to `3` and make `funnelConversion` ignore leads whose stage is `LOST` or `ON_HOLD`. Fix the test to match before moving on.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- pipeline`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/pipeline.ts`**

```ts
import type { Paise } from './money';

export type LeadStage =
  | 'IDENTIFIED' | 'CONTACTED' | 'QUALIFIED' | 'MEETING_SCHEDULED'
  | 'PRESENTATION_DONE' | 'COMMERCIAL_DISCUSSION' | 'NEGOTIATION' | 'APPROVED'
  | 'APPOINTED' | 'FIRST_ORDER' | 'ACTIVATED' | 'REPEAT_ORDER' | 'LOST' | 'ON_HOLD';

export const STAGES: LeadStage[] = [
  'IDENTIFIED', 'CONTACTED', 'QUALIFIED', 'MEETING_SCHEDULED', 'PRESENTATION_DONE',
  'COMMERCIAL_DISCUSSION', 'NEGOTIATION', 'APPROVED', 'APPOINTED', 'FIRST_ORDER',
  'ACTIVATED', 'REPEAT_ORDER', 'LOST', 'ON_HOLD',
];

const PAUSED_OR_LOST: LeadStage[] = ['LOST', 'ON_HOLD'];
export const OPEN_STAGES: LeadStage[] = STAGES.filter(
  (s) => !PAUSED_OR_LOST.includes(s) && s !== 'REPEAT_ORDER',
);

export function stageRank(stage: LeadStage): number {
  return STAGES.indexOf(stage);
}

export function weightedPipelineValue(potential: Paise, probabilityPct: number): Paise {
  return Math.round((potential * probabilityPct) / 100);
}

export const FUNNEL_STEPS = [
  { key: 'identified', label: 'Identified', reaches: 'IDENTIFIED' as LeadStage },
  { key: 'contacted', label: 'Contacted', reaches: 'CONTACTED' as LeadStage },
  { key: 'qualified', label: 'Qualified', reaches: 'QUALIFIED' as LeadStage },
  { key: 'meeting', label: 'Meeting', reaches: 'MEETING_SCHEDULED' as LeadStage },
  { key: 'commercial', label: 'Commercial Discussion', reaches: 'COMMERCIAL_DISCUSSION' as LeadStage },
  { key: 'negotiation', label: 'Negotiation', reaches: 'NEGOTIATION' as LeadStage },
  { key: 'appointed', label: 'Appointed', reaches: 'APPOINTED' as LeadStage },
  { key: 'firstOrder', label: 'First Order', reaches: 'FIRST_ORDER' as LeadStage },
  { key: 'activated', label: 'Activated', reaches: 'ACTIVATED' as LeadStage },
  { key: 'repeatOrder', label: 'Repeat Order', reaches: 'REPEAT_ORDER' as LeadStage },
];

export function funnelConversion(leads: { stage: LeadStage }[]) {
  const active = leads.filter((l) => !PAUSED_OR_LOST.includes(l.stage));
  const rows = FUNNEL_STEPS.map((step) => {
    const r = stageRank(step.reaches);
    const count = active.filter((l) => stageRank(l.stage) >= r).length;
    return { key: step.key, label: step.label, count, convFromPrev: null as number | null };
  });
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].count;
    rows[i].convFromPrev = prev === 0 ? 0 : (rows[i].count / prev) * 100;
  }
  return rows;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- pipeline`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: pipeline domain — stages, ranks, weighted value, funnel conversion"
```
Append BUILD-LOG. If Task 6's `pipeline.ts` stub existed, note it is now replaced.

---

### Task 9: Distributor score domain (`src/domain/scoring.ts`)

**Files:**
- Create: `src/domain/scoring.ts`
- Create: `tests/domain/scoring.test.ts`

**Interfaces:**
- Produces:
  - `type ScoreInputs = Record<ScoreKey, number>` where `ScoreKey` is the 9 keys from `CONFIG_DEFAULTS.scoreWeights`; each value is a **0–1 rating**.
  - `type ScoreWeights = Record<ScoreKey, number>` (weights sum to 100).
  - `type Grade = 'A' | 'B' | 'C' | 'REJECT'`.
  - `scoreDistributor(inputs: Partial<ScoreInputs>, weights: ScoreWeights): { score: number; grade: Grade }` — `score = round(Σ clamp01(input[k] ?? 0) * weights[k])`; grade thresholds A ≥ 80, B 65–79, C 50–64, else REJECT.
  - `assertWeightsValid(weights: ScoreWeights): void` — throws if the values don't sum to 100 (±0.001).

- [ ] **Step 1: Write the failing test**

Create `tests/domain/scoring.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { scoreDistributor, assertWeightsValid, type ScoreWeights } from '@/domain/scoring';

const W: ScoreWeights = {
  retailerNetwork: 20, categoryExperience: 15, geoCoverage: 15, salesmen: 10,
  deliveryInfra: 10, workingCapital: 10, brandPortfolio: 10, reputation: 5, willingness: 5,
};

describe('scoreDistributor', () => {
  it('scores a perfect distributor as 100 / grade A', () => {
    const all1 = Object.fromEntries(Object.keys(W).map((k) => [k, 1]));
    expect(scoreDistributor(all1 as any, W)).toEqual({ score: 100, grade: 'A' });
  });
  it('treats missing inputs as 0 and clamps out-of-range', () => {
    expect(scoreDistributor({ retailerNetwork: 5, categoryExperience: 1 }, W))
      .toEqual({ score: 35, grade: 'REJECT' });   // 20 + 15
  });
  it('applies grade thresholds', () => {
    const half = Object.fromEntries(Object.keys(W).map((k) => [k, 0.7]));
    const r = scoreDistributor(half as any, W);   // 70 → B
    expect(r).toEqual({ score: 70, grade: 'B' });
  });
  it('rejects weights that do not sum to 100', () => {
    expect(() => assertWeightsValid({ ...W, willingness: 10 })).toThrow();
    expect(() => assertWeightsValid(W)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- scoring`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/scoring.ts`**

```ts
export type ScoreKey =
  | 'retailerNetwork' | 'categoryExperience' | 'geoCoverage' | 'salesmen'
  | 'deliveryInfra' | 'workingCapital' | 'brandPortfolio' | 'reputation' | 'willingness';

export type ScoreInputs = Record<ScoreKey, number>;
export type ScoreWeights = Record<ScoreKey, number>;
export type Grade = 'A' | 'B' | 'C' | 'REJECT';

const KEYS: ScoreKey[] = [
  'retailerNetwork', 'categoryExperience', 'geoCoverage', 'salesmen',
  'deliveryInfra', 'workingCapital', 'brandPortfolio', 'reputation', 'willingness',
];

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export function assertWeightsValid(weights: ScoreWeights): void {
  const sum = KEYS.reduce((a, k) => a + (weights[k] ?? 0), 0);
  if (Math.abs(sum - 100) > 0.001) throw new Error(`score weights must sum to 100, got ${sum}`);
}

function grade(score: number): Grade {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  return 'REJECT';
}

export function scoreDistributor(inputs: Partial<ScoreInputs>, weights: ScoreWeights): { score: number; grade: Grade } {
  const score = Math.round(KEYS.reduce((a, k) => a + clamp01(inputs[k] ?? 0) * (weights[k] ?? 0), 0));
  return { score, grade: grade(score) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- scoring`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: distributor score domain (weighted 0-1 inputs, A/B/C/REJECT grade)"
```
Append BUILD-LOG.

---

### Task 10: Territory schema + service + screen

**Files:**
- Create: `src/server/db/schema/territory.ts`, `src/server/services/territory.ts`
- Create: `src/app/(app)/territories/page.tsx` (replace placeholder), `src/app/(app)/territories/actions.ts`
- Create: `src/lib/schemas.ts` (start it here — add `territorySchema`)
- Create: `tests/services/territory.test.ts`
- Generate: migration

**Interfaces:**
- Consumes: `db`, `requireUser`, `assertCan`, `seedBase`.
- Produces:
  - `territories` { id, orgId, name, type (text: 'ZONE'|'AREA'|'NEIGHBORHOOD'|'PINCODE'), parentId (uuid, nullable), estimatedMarketPotential (bigint paise, default 0), estimatedDistributorCount (integer, default 0), active (boolean, default true), createdAt, updatedAt, deletedAt (nullable) }
  - `territoryAssignments` { id, orgId, territoryId, employeeId, fromDate (date), toDate (date, nullable), createdAt }
  - Service functions:
    - `listTerritories(orgId): Promise<TerritoryRow[]>` — active, not deleted, ordered by name.
    - `territoryTree(orgId): Promise<TerritoryNode[]>` — nested by `parentId`.
    - `createTerritory(user, input): Promise<TerritoryRow>` — `assertCan(user,'territory.edit')`, validates with `territorySchema`, audited.
    - `updateTerritory(user, id, input): Promise<TerritoryRow>` — audited.
    - `ancestorIds(orgId, territoryId): Promise<string[]>` and `descendantIds(orgId, territoryId): Promise<string[]>` — walk `parentId`.
    - `overlapsExclusive(orgId, territoryId, excludeDistributorId?): Promise<boolean>` — **stub returning `false` in M1** (no `distributors` table yet). `// ponytail:` real check lands in Milestone 2 with the distributors table; logged.

- [ ] **Step 1: Write the failing test**

Create `tests/services/territory.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { createTerritory, listTerritories, territoryTree, descendantIds } from '@/server/services/territory';
import type { AppUser } from '@/server/auth/session';

const owner: AppUser = { id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId: '' };
const sales: AppUser = { id: 's', email: 's', name: 'S', role: 'SALES', employeeId: null, orgId: '' };

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('territory service', () => {
  it('creates a hierarchy and lists/nests it', async () => {
    const { orgId } = await seedBase();
    const east = await createTerritory({ ...owner, orgId }, { name: 'Bangalore East', type: 'ZONE', parentId: null });
    const wf = await createTerritory({ ...owner, orgId }, { name: 'Whitefield', type: 'AREA', parentId: east.id });
    await createTerritory({ ...owner, orgId }, { name: 'Hoodi', type: 'AREA', parentId: east.id });

    expect((await listTerritories(orgId)).map((t) => t.name)).toEqual(['Bangalore East', 'Hoodi', 'Whitefield']);
    const tree = await territoryTree(orgId);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((c) => c.name).sort()).toEqual(['Hoodi', 'Whitefield']);
    expect(await descendantIds(orgId, east.id)).toEqual(expect.arrayContaining([wf.id]));
  });

  it('forbids a sales rep from creating a territory', async () => {
    const { orgId } = await seedBase();
    await expect(createTerritory({ ...sales, orgId }, { name: 'X', type: 'AREA', parentId: null }))
      .rejects.toThrow('forbidden');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- territory`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the schema**

Create `src/server/db/schema/territory.ts`:
```ts
import { pgTable, uuid, text, boolean, integer, bigint, timestamp, date } from 'drizzle-orm/pg-core';

const ts = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const territories = pgTable('territories', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),                       // ZONE | AREA | NEIGHBORHOOD | PINCODE
  parentId: uuid('parent_id'),
  estimatedMarketPotential: bigint('estimated_market_potential', { mode: 'number' }).notNull().default(0),
  estimatedDistributorCount: integer('estimated_distributor_count').notNull().default(0),
  active: boolean('active').notNull().default(true),
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
```
Add `export * from './territory';` to `schema/index.ts`.

- [ ] **Step 4: Start `src/lib/schemas.ts`**

```ts
import { z } from 'zod';

export const TERRITORY_TYPES = ['ZONE', 'AREA', 'NEIGHBORHOOD', 'PINCODE'] as const;

export const territorySchema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(TERRITORY_TYPES),
  parentId: z.string().uuid().nullable(),
  estimatedMarketPotential: z.number().int().min(0).optional(),
  estimatedDistributorCount: z.number().int().min(0).optional(),
});
export type TerritoryInput = z.infer<typeof territorySchema>;
```

- [ ] **Step 5: Implement the audit helper it depends on (thin version)**

If Task 12 (`withAudit`) is not yet done, add a minimal `src/server/services/audit.ts` now and expand it in Task 12:
```ts
import { db } from '@/server/db/client';
import { auditLog } from '@/server/db/schema/audit';
import type { AppUser } from '@/server/auth/session';

export async function writeAudit(user: AppUser, entityType: string, entityId: string, action: string, oldValues: unknown, newValues: unknown) {
  await db.insert(auditLog).values({
    orgId: user.orgId, userId: user.id, entityType, entityId, action,
    oldValues: oldValues ?? null, newValues: newValues ?? null,
  });
}
```
…which needs `src/server/db/schema/audit.ts`:
```ts
import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  userId: uuid('user_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```
Add `export * from './audit';` to `schema/index.ts`.

- [ ] **Step 6: Implement the territory service**

Create `src/server/services/territory.ts`:
```ts
import { and, eq, isNull, asc } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { territories } from '@/server/db/schema/territory';
import { territorySchema, type TerritoryInput } from '@/lib/schemas';
import { assertCan } from '@/server/auth/permissions';
import { writeAudit } from './audit';
import type { AppUser } from '@/server/auth/session';

export type TerritoryRow = typeof territories.$inferSelect;
export interface TerritoryNode extends TerritoryRow { children: TerritoryNode[] }

export async function listTerritories(orgId: string): Promise<TerritoryRow[]> {
  return db.select().from(territories)
    .where(and(eq(territories.orgId, orgId), isNull(territories.deletedAt), eq(territories.active, true)))
    .orderBy(asc(territories.name));
}

export async function territoryTree(orgId: string): Promise<TerritoryNode[]> {
  const rows = await listTerritories(orgId);
  const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] as TerritoryNode[] }]));
  const roots: TerritoryNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function descendantIds(orgId: string, territoryId: string): Promise<string[]> {
  const rows = await listTerritories(orgId);
  const out: string[] = [];
  const stack = [territoryId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const r of rows) if (r.parentId === id) { out.push(r.id); stack.push(r.id); }
  }
  return out;
}

export async function ancestorIds(orgId: string, territoryId: string): Promise<string[]> {
  const rows = await listTerritories(orgId);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: string[] = [];
  let cur = byId.get(territoryId)?.parentId ?? null;
  while (cur && byId.has(cur)) { out.push(cur); cur = byId.get(cur)!.parentId ?? null; }
  return out;
}

export async function createTerritory(user: AppUser, input: TerritoryInput): Promise<TerritoryRow> {
  assertCan(user, 'territory.edit');
  const data = territorySchema.parse(input);
  const [row] = await db.insert(territories).values({ ...data, orgId: user.orgId }).returning();
  await writeAudit(user, 'territory', row.id, 'create', null, row);
  return row;
}

export async function updateTerritory(user: AppUser, id: string, input: Partial<TerritoryInput>): Promise<TerritoryRow> {
  assertCan(user, 'territory.edit');
  const [before] = await db.select().from(territories).where(and(eq(territories.id, id), eq(territories.orgId, user.orgId)));
  if (!before) throw new Error('not found');
  const data = territorySchema.partial().parse(input);
  const [row] = await db.update(territories).set({ ...data, updatedAt: new Date() })
    .where(eq(territories.id, id)).returning();
  await writeAudit(user, 'territory', id, 'update', before, row);
  return row;
}

// ponytail: exclusivity conflict needs the distributors table (Milestone 2). Stub for now.
export async function overlapsExclusive(_orgId: string, _territoryId: string, _excludeDistributorId?: string): Promise<boolean> {
  return false;
}
```

- [ ] **Step 7: Territories screen + actions**

Create `src/app/(app)/territories/actions.ts`:
```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { createTerritory } from '@/server/services/territory';
import { TERRITORY_TYPES } from '@/lib/schemas';

export async function addTerritory(formData: FormData) {
  const user = await requireUser();
  await createTerritory(user, {
    name: String(formData.get('name') ?? ''),
    type: String(formData.get('type') ?? 'AREA') as (typeof TERRITORY_TYPES)[number],
    parentId: (formData.get('parentId') || null) as string | null,
  });
  revalidatePath('/territories');
}
```

Create `src/app/(app)/territories/page.tsx`:
```tsx
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { territoryTree, listTerritories, type TerritoryNode } from '@/server/services/territory';
import { TERRITORY_TYPES } from '@/lib/schemas';
import { addTerritory } from './actions';

function Tree({ nodes, depth = 0 }: { nodes: TerritoryNode[]; depth?: number }) {
  return (
    <ul>
      {nodes.map((n) => (
        <li key={n.id}>
          <div style={{ paddingLeft: depth * 16 }} className="py-1 text-sm">
            {n.name} <span className="text-neutral-400">· {n.type}</span>
          </div>
          {n.children.length > 0 && <Tree nodes={n.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

export default async function TerritoriesPage() {
  const user = await requireUser();
  const [tree, flat] = await Promise.all([territoryTree(user.orgId), listTerritories(user.orgId)]);
  return (
    <main className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Territories</h1>
      <div className="rounded border p-4"><Tree nodes={tree} /></div>
      {can(user, 'territory.edit') && (
        <form action={addTerritory} className="flex flex-wrap items-end gap-2 rounded border p-4">
          <label className="text-sm">Name<input name="name" required className="mt-1 block rounded border px-2 py-1" /></label>
          <label className="text-sm">Type
            <select name="type" className="mt-1 block rounded border px-2 py-1">
              {TERRITORY_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-sm">Parent
            <select name="parentId" className="mt-1 block rounded border px-2 py-1">
              <option value="">(none)</option>
              {flat.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Add</button>
        </form>
      )}
    </main>
  );
}
```

- [ ] **Step 8: Generate + apply migration, run tests**

```bash
npm run db:generate && npm run db:migrate
npm test -- territory
```
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: territory schema, hierarchy service, territories screen; audit + schemas scaffolding"
```
Append BUILD-LOG; log the `overlapsExclusive` stub in PONYTAIL-DEBT.

---

### Task 11: CRM schema — leads, activities, tasks, daily reports

**Files:**
- Create: `src/server/db/schema/crm.ts`
- Modify: `src/server/db/schema/index.ts`
- Modify: `src/lib/schemas.ts` (add lead/activity/task/dailyReport zod schemas)
- Create: `tests/services/crm-schema.test.ts`
- Generate: migration

**Interfaces:**
- Produces (Drizzle tables):
  - `distributorLeads` — columns grouped per spec §4.3. Key ones the later tasks use:
    `id, orgId, businessName, contactPerson, phone, email, address, territoryId (uuid,null), pincode, location, existingBusinessType, yearsInBusiness (int,null), currentCategories (jsonb,null), approxMonthlyTurnover (bigint,null), estimatedCategoryTurnover (bigint,null), expectedFfMonthlyPotential (bigint, default 0), workingCapitalCapability (text,null), expectedCreditRequirement (bigint,null), warehouse (text,null), deliveryVehicles (int, default 0), salesmen (int, default 0), retailerNetwork (int, default 0), geographicCoverage (text,null), scoreInputs (jsonb, default '{}'), score (int, default 0), grade (text, default 'REJECT'), stage (text, default 'IDENTIFIED'), probability (int, default 5), assignedEmployeeId (uuid,null), nextFollowUpAt (timestamptz,null), convertedDistributorId (uuid,null), lostReason (text,null), lostNotes (text,null), onHoldReason (text,null), isDemo (boolean, default false), createdAt, updatedAt, deletedAt`
  - `activities` — `id, orgId, leadId (uuid,null), distributorId (uuid,null), employeeId (uuid,null), type (text), occurredAt (timestamptz), notes (text,null), outcome (text,null), nextAction (text,null), nextFollowUpAt (timestamptz,null), isDemo, createdAt, deletedAt`. A CHECK: `leadId is not null or distributorId is not null` (add via raw SQL in the migration or a `sql` default — see step).
  - `tasks` — `id, orgId, title, type (text), leadId (uuid,null), distributorId (uuid,null), priority (text, default 'NORMAL'), dueDate (date), assignedEmployeeId (uuid,null), status (text, default 'PENDING'), completedAt (timestamptz,null), source (text, default 'MANUAL'), createdBy (uuid,null), isDemo, createdAt, updatedAt, deletedAt`
  - `employeeDailyReports` — `id, orgId, employeeId, reportDate (date), areasVisited (jsonb, default '[]'), notes (text,null), blockers (text,null), submittedAt (timestamptz), createdAt`. UNIQUE `(orgId, employeeId, reportDate)`.
- Enum value lists live in `src/lib/schemas.ts` as `as const` arrays: `ACTIVITY_TYPES`, `TASK_TYPES`, `TASK_PRIORITIES`, `TASK_STATUSES`, `LOST_REASONS`, `WORKING_CAPITAL_LEVELS`.

- [ ] **Step 1: Write the failing test**

Create `tests/services/crm-schema.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { distributorLeads, employeeDailyReports } from '@/server/db/schema/crm';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('crm schema', () => {
  it('inserts a lead with defaulted stage/probability/grade', async () => {
    const { orgId } = await seedBase();
    const [lead] = await testDb.insert(distributorLeads)
      .values({ orgId, businessName: 'Acme Traders', contactPerson: 'R', phone: '9999999999' })
      .returning();
    expect(lead.stage).toBe('IDENTIFIED');
    expect(lead.probability).toBe(5);
    expect(lead.grade).toBe('REJECT');
    expect(lead.expectedFfMonthlyPotential).toBe(0);
  });

  it('enforces one daily report per employee per date', async () => {
    const { orgId } = await seedBase();
    const row = { orgId, employeeId: crypto.randomUUID(), reportDate: '2026-08-31', submittedAt: new Date() };
    await testDb.insert(employeeDailyReports).values(row);
    await expect(testDb.insert(employeeDailyReports).values(row)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- crm-schema`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/server/db/schema/crm.ts`**

Write the four `pgTable` definitions matching the column list in Interfaces. Use:
```ts
import { pgTable, uuid, text, integer, bigint, boolean, jsonb, timestamp, date, uniqueIndex } from 'drizzle-orm/pg-core';
```
- `bigint('...', { mode: 'number' })` for all paise columns.
- `jsonb('score_inputs').notNull().default({})`, `jsonb('areas_visited').notNull().default([])`.
- `employeeDailyReports`: `uniqueIndex('emp_daily_report_uk').on(t.orgId, t.employeeId, t.reportDate)`.
- Add `export * from './crm';` to `schema/index.ts`.

- [ ] **Step 4: Add the CHECK constraint for activities**

After `npm run db:generate`, hand-edit the generated `drizzle/000X_*.sql` to append:
```sql
ALTER TABLE "activities" ADD CONSTRAINT "activities_target_ck"
  CHECK ("lead_id" IS NOT NULL OR "distributor_id" IS NOT NULL);
```
`// ponytail:` hand-edited migration — ceiling: `db:generate` won't reproduce it; upgrade path: move to a Drizzle `check()` once on a version that supports it cleanly. Log it.

- [ ] **Step 5: Extend `src/lib/schemas.ts`**

Add `as const` arrays and zod schemas:
```ts
export const ACTIVITY_TYPES = ['CALL','WHATSAPP','MEETING','PRESENTATION','SAMPLE','QUOTATION','NEGOTIATION','FOLLOW_UP','ORDER','PAYMENT_DISCUSSION','COMPLAINT','OTHER'] as const;
export const TASK_TYPES = ['FOLLOW_UP','MEETING','CALL','QUOTATION_CHASE','DISTRIBUTOR_REVIEW','REORDER_NUDGE','COLLECTION','OTHER'] as const;
export const TASK_PRIORITIES = ['CRITICAL','HIGH','NORMAL','LOW'] as const;
export const TASK_STATUSES = ['PENDING','IN_PROGRESS','COMPLETED','CANCELLED'] as const;
export const LOST_REASONS = ['MARGIN','PRICE','EXISTING_COMPETITOR','CREDIT_TERMS','PRODUCT_RANGE','BRAND_AWARENESS','TERRITORY_CONFLICT','MOQ','NOT_INTERESTED','RETAILER_DEMAND_CONCERN','STOCK_AVAILABILITY','OTHER'] as const;
export const WORKING_CAPITAL_LEVELS = ['LOW','MEDIUM','HIGH'] as const;

export const leadSchema = z.object({
  businessName: z.string().min(2).max(160),
  contactPerson: z.string().min(2).max(120),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().max(400).optional().or(z.literal('')),
  territoryId: z.string().uuid().nullable().optional(),
  pincode: z.string().regex(/^\d{6}$/).optional().or(z.literal('')),
  location: z.string().max(400).optional().or(z.literal('')),
  existingBusinessType: z.string().max(160).optional().or(z.literal('')),
  yearsInBusiness: z.coerce.number().int().min(0).max(200).optional(),
  expectedFfMonthlyPotential: z.coerce.number().int().min(0).default(0),
  expectedCreditRequirement: z.coerce.number().int().min(0).optional(),
  workingCapitalCapability: z.enum(WORKING_CAPITAL_LEVELS).optional(),
  deliveryVehicles: z.coerce.number().int().min(0).default(0),
  salesmen: z.coerce.number().int().min(0).default(0),
  retailerNetwork: z.coerce.number().int().min(0).default(0),
  geographicCoverage: z.string().max(240).optional().or(z.literal('')),
  assignedEmployeeId: z.string().uuid().nullable().optional(),
});
export type LeadInput = z.infer<typeof leadSchema>;

export const scoreInputsSchema = z.object({
  retailerNetwork: z.number().min(0).max(1), categoryExperience: z.number().min(0).max(1),
  geoCoverage: z.number().min(0).max(1), salesmen: z.number().min(0).max(1),
  deliveryInfra: z.number().min(0).max(1), workingCapital: z.number().min(0).max(1),
  brandPortfolio: z.number().min(0).max(1), reputation: z.number().min(0).max(1),
  willingness: z.number().min(0).max(1),
}).partial();

export const activitySchema = z.object({
  leadId: z.string().uuid().nullable().optional(),
  distributorId: z.string().uuid().nullable().optional(),
  type: z.enum(ACTIVITY_TYPES),
  occurredAt: z.coerce.date().default(() => new Date()),
  notes: z.string().max(2000).optional().or(z.literal('')),
  outcome: z.string().max(500).optional().or(z.literal('')),
  nextAction: z.string().max(500).optional().or(z.literal('')),
  nextFollowUpAt: z.coerce.date().nullable().optional(),
}).refine((v) => v.leadId || v.distributorId, { message: 'lead or distributor required' });
export type ActivityInput = z.infer<typeof activitySchema>;

export const taskSchema = z.object({
  title: z.string().min(2).max(200),
  type: z.enum(TASK_TYPES),
  leadId: z.string().uuid().nullable().optional(),
  distributorId: z.string().uuid().nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).default('NORMAL'),
  dueDate: z.coerce.date(),
  assignedEmployeeId: z.string().uuid().nullable().optional(),
});
export type TaskInput = z.infer<typeof taskSchema>;

export const dailyReportSchema = z.object({
  reportDate: z.coerce.date(),
  areasVisited: z.array(z.string().max(120)).default([]),
  notes: z.string().max(4000).optional().or(z.literal('')),
  blockers: z.string().max(2000).optional().or(z.literal('')),
});
export type DailyReportInput = z.infer<typeof dailyReportSchema>;
```

- [ ] **Step 6: Generate + apply migration (with the manual CHECK), run tests**

```bash
npm run db:generate
# hand-append the activities CHECK constraint to the new SQL file (Step 4)
npm run db:migrate
npm test -- crm-schema
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: CRM schema (leads, activities, tasks, daily reports) + zod schemas"
```
Append BUILD-LOG; log the hand-edited migration in PONYTAIL-DEBT.

---

### Task 12: Lead service + Leads list/create screen

**Files:**
- Create: `src/server/services/lead.ts`
- Create: `src/app/(app)/leads/actions.ts`
- Modify: `src/app/(app)/leads/page.tsx` (replace placeholder)
- Create: `src/components/grade-badge.tsx`, `src/components/stage-badge.tsx`
- Create: `tests/services/lead.test.ts`

**Interfaces:**
- Consumes: `db`, `assertCan`, `writeAudit`, `getConfig`, `scoreDistributor`, `assertWeightsValid`, `leadSchema`, `scoreInputsSchema`.
- Produces:
  - `type LeadRow = typeof distributorLeads.$inferSelect`.
  - `createLead(user, input: LeadInput): Promise<LeadRow>` — `assertCan(user,'lead.create')`; parses `leadSchema`; sets `orgId`; new leads default `assignedEmployeeId` to `user.employeeId` when the caller is SALES and left blank; audited.
  - `updateLead(user, id, input: Partial<LeadInput>): Promise<LeadRow>` — `assertCan(user,'lead.update')` for OWNER, `'lead.setStage'`? no — SALES uses `'lead.update'` (in matrix). Audited with before/after.
  - `rescoreLead(user, id, scoreInputs): Promise<LeadRow>` — validates `scoreInputsSchema`; loads `scoreWeights` config; `assertWeightsValid`; writes `scoreInputs`, `score`, `grade`; audited (`action: 'rescore'`).
  - `listLeads(orgId, opts?: { stage?: LeadStage; assignedEmployeeId?: string; q?: string; limit?: number; offset?: number }): Promise<LeadRow[]>` — not deleted; filter by stage/assignee; `q` matches `businessName`/`contactPerson`/`phone` ILIKE; order by `updatedAt desc`; default limit 50.
  - `getLead(orgId, id): Promise<LeadRow | null>`.

- [ ] **Step 1: Write the failing test**

Create `tests/services/lead.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { createLead, updateLead, rescoreLead, listLeads } from '@/server/services/lead';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });
const sales = (orgId: string, employeeId: string): AppUser => ({ id: 's', email: 's', name: 'S', role: 'SALES', employeeId, orgId });

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('lead service', () => {
  it('creates a lead and defaults the assignee to the SALES caller', async () => {
    const { orgId } = await seedBase();
    const emp = crypto.randomUUID();
    const lead = await createLead(sales(orgId, emp), {
      businessName: 'Acme Traders', contactPerson: 'Ravi', phone: '9876543210',
      expectedFfMonthlyPotential: 30000000,
    });
    expect(lead.assignedEmployeeId).toBe(emp);
    expect(lead.stage).toBe('IDENTIFIED');
  });

  it('rejects a bad phone number', async () => {
    const { orgId } = await seedBase();
    await expect(createLead(owner(orgId), { businessName: 'X Co', contactPerson: 'Y', phone: '12345' } as any))
      .rejects.toThrow();
  });

  it('rescores a lead using the org score weights', async () => {
    const { orgId } = await seedBase();
    const lead = await createLead(owner(orgId), { businessName: 'Big Distributor', contactPerson: 'A', phone: '9000000000' });
    const updated = await rescoreLead(owner(orgId), lead.id, {
      retailerNetwork: 1, categoryExperience: 1, geoCoverage: 1, salesmen: 1,
      deliveryInfra: 1, workingCapital: 1, brandPortfolio: 1, reputation: 1, willingness: 1,
    });
    expect(updated.score).toBe(100);
    expect(updated.grade).toBe('A');
  });

  it('filters the list by stage and search text', async () => {
    const { orgId } = await seedBase();
    await createLead(owner(orgId), { businessName: 'Alpha Foods', contactPerson: 'A', phone: '9111111111' });
    const beta = await createLead(owner(orgId), { businessName: 'Beta Mart', contactPerson: 'B', phone: '9222222222' });
    await updateLead(owner(orgId), beta.id, { businessName: 'Beta Mart' });
    expect((await listLeads(orgId, { q: 'beta' })).map((l) => l.businessName)).toEqual(['Beta Mart']);
    expect(await listLeads(orgId, { stage: 'CONTACTED' })).toHaveLength(0);
  });

  it('forbids a sales rep from deleting', async () => {
    const { orgId } = await seedBase();
    const s = sales(orgId, crypto.randomUUID());
    // no delete in M1 UI; assert the matrix denies it
    const { can } = await import('@/server/auth/permissions');
    expect(can(s, 'lead.delete')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- services/lead`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/server/services/lead.ts`**

```ts
import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { distributorLeads } from '@/server/db/schema/crm';
import { leadSchema, scoreInputsSchema, type LeadInput } from '@/lib/schemas';
import { assertCan } from '@/server/auth/permissions';
import { getConfig } from './config';
import { scoreDistributor, assertWeightsValid, type ScoreWeights } from '@/domain/scoring';
import { writeAudit } from './audit';
import type { AppUser } from '@/server/auth/session';
import type { LeadStage } from '@/domain/pipeline';

export type LeadRow = typeof distributorLeads.$inferSelect;

function clean(input: Partial<LeadInput>) {
  // drop empty-string optionals so they store as null
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
  return out;
}

export async function createLead(user: AppUser, input: LeadInput): Promise<LeadRow> {
  assertCan(user, 'lead.create');
  const data = leadSchema.parse(input);
  const assignedEmployeeId = data.assignedEmployeeId
    ?? (user.role === 'SALES' ? user.employeeId : null);
  const [row] = await db.insert(distributorLeads)
    .values({ ...clean(data), assignedEmployeeId, orgId: user.orgId })
    .returning();
  await writeAudit(user, 'lead', row.id, 'create', null, row);
  return row;
}

export async function updateLead(user: AppUser, id: string, input: Partial<LeadInput>): Promise<LeadRow> {
  assertCan(user, 'lead.update');
  const [before] = await db.select().from(distributorLeads)
    .where(and(eq(distributorLeads.id, id), eq(distributorLeads.orgId, user.orgId)));
  if (!before) throw new Error('not found');
  const data = leadSchema.partial().parse(input);
  const [row] = await db.update(distributorLeads)
    .set({ ...clean(data), updatedAt: new Date() })
    .where(eq(distributorLeads.id, id)).returning();
  await writeAudit(user, 'lead', id, 'update', before, row);
  return row;
}

export async function rescoreLead(user: AppUser, id: string, scoreInputs: unknown): Promise<LeadRow> {
  assertCan(user, 'lead.update');
  const inputs = scoreInputsSchema.parse(scoreInputs);
  const weights = (await getConfig(user.orgId, 'scoreWeights')) as ScoreWeights;
  assertWeightsValid(weights);
  const { score, grade } = scoreDistributor(inputs, weights);
  const [before] = await db.select().from(distributorLeads)
    .where(and(eq(distributorLeads.id, id), eq(distributorLeads.orgId, user.orgId)));
  if (!before) throw new Error('not found');
  const [row] = await db.update(distributorLeads)
    .set({ scoreInputs: inputs, score, grade, updatedAt: new Date() })
    .where(eq(distributorLeads.id, id)).returning();
  await writeAudit(user, 'lead', id, 'rescore', { score: before.score, grade: before.grade }, { score, grade });
  return row;
}

export async function listLeads(orgId: string, opts: {
  stage?: LeadStage; assignedEmployeeId?: string; q?: string; limit?: number; offset?: number;
} = {}): Promise<LeadRow[]> {
  const conds = [eq(distributorLeads.orgId, orgId), isNull(distributorLeads.deletedAt)];
  if (opts.stage) conds.push(eq(distributorLeads.stage, opts.stage));
  if (opts.assignedEmployeeId) conds.push(eq(distributorLeads.assignedEmployeeId, opts.assignedEmployeeId));
  if (opts.q) {
    const like = `%${opts.q}%`;
    conds.push(or(ilike(distributorLeads.businessName, like), ilike(distributorLeads.contactPerson, like), ilike(distributorLeads.phone, like))!);
  }
  return db.select().from(distributorLeads).where(and(...conds))
    .orderBy(desc(distributorLeads.updatedAt))
    .limit(opts.limit ?? 50).offset(opts.offset ?? 0);
}

export async function getLead(orgId: string, id: string): Promise<LeadRow | null> {
  const [row] = await db.select().from(distributorLeads)
    .where(and(eq(distributorLeads.id, id), eq(distributorLeads.orgId, orgId)));
  return row ?? null;
}
```

- [ ] **Step 4: Badges**

Create `src/components/grade-badge.tsx`:
```tsx
const CLASS: Record<string, string> = {
  A: 'bg-green-100 text-green-800', B: 'bg-blue-100 text-blue-800',
  C: 'bg-amber-100 text-amber-800', REJECT: 'bg-neutral-200 text-neutral-600',
};
export function GradeBadge({ grade }: { grade: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${CLASS[grade] ?? CLASS.REJECT}`}>{grade}</span>;
}
```
Create `src/components/stage-badge.tsx`:
```tsx
export function StageBadge({ stage }: { stage: string }) {
  const label = stage.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700">{label}</span>;
}
```

- [ ] **Step 5: Leads screen + actions**

Create `src/app/(app)/leads/actions.ts`:
```ts
'use server';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { createLead } from '@/server/services/lead';

export async function createLeadAction(formData: FormData) {
  const user = await requireUser();
  const lead = await createLead(user, {
    businessName: String(formData.get('businessName') ?? ''),
    contactPerson: String(formData.get('contactPerson') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    expectedFfMonthlyPotential: Number(formData.get('expectedFfMonthlyPotential') ?? 0),
  } as any);
  redirect(`/leads/${lead.id}`);
}
```

Replace `src/app/(app)/leads/page.tsx`:
```tsx
import Link from 'next/link';
import { requireUser } from '@/server/auth/session';
import { listLeads } from '@/server/services/lead';
import { GradeBadge } from '@/components/grade-badge';
import { StageBadge } from '@/components/stage-badge';
import { formatINR } from '@/domain/money';
import { createLeadAction } from './actions';

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const leads = await listLeads(user.orgId, { q });
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Leads</h1>
      <form className="flex gap-2" action="/leads">
        <input name="q" defaultValue={q} placeholder="Search name / phone" className="rounded border px-3 py-1.5 text-sm" />
        <button className="rounded border px-3 py-1.5 text-sm">Search</button>
      </form>
      <details className="rounded border p-4">
        <summary className="cursor-pointer text-sm font-medium">New lead</summary>
        <form action={createLeadAction} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm">Business<input name="businessName" required className="mt-1 block rounded border px-2 py-1" /></label>
          <label className="text-sm">Contact<input name="contactPerson" required className="mt-1 block rounded border px-2 py-1" /></label>
          <label className="text-sm">Phone<input name="phone" required pattern="[6-9][0-9]{9}" className="mt-1 block rounded border px-2 py-1" /></label>
          <label className="text-sm">Monthly potential (₹)<input name="expectedFfMonthlyPotential" type="number" min="0" className="mt-1 block rounded border px-2 py-1" /></label>
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Create</button>
        </form>
      </details>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-neutral-500">
          <th className="py-2">Business</th><th>Stage</th><th>Grade</th><th>Potential</th><th>Next follow-up</th>
        </tr></thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className="border-b">
              <td className="py-2"><Link href={`/leads/${l.id}`} className="text-blue-700 hover:underline">{l.businessName}</Link><div className="text-neutral-400">{l.contactPerson} · {l.phone}</div></td>
              <td><StageBadge stage={l.stage} /></td>
              <td><GradeBadge grade={l.grade} /></td>
              <td>{formatINR(l.expectedFfMonthlyPotential)}</td>
              <td className="text-neutral-500">{l.nextFollowUpAt ? new Date(l.nextFollowUpAt).toLocaleDateString('en-IN') : <span className="text-red-600">none</span>}</td>
            </tr>
          ))}
          {leads.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-neutral-400">No leads yet.</td></tr>}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- services/lead`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: lead service (create/update/rescore/list) + Leads screen"
```
Append BUILD-LOG.

---

### Task 13: Lead detail — fields, score panel, stage change

**Files:**
- Modify: `src/server/services/lead.ts` (add `setStage`)
- Create: `src/app/(app)/leads/[id]/page.tsx`
- Create: `src/app/(app)/leads/[id]/actions.ts`
- Create: `tests/services/lead-stage.test.ts`

**Interfaces:**
- Consumes: `getConfig('stageProbability')`, `STAGES`, `LOST_REASONS`.
- Produces:
  - `setStage(user, id, stage: LeadStage, opts?: { probability?: number; lostReason?: string; lostNotes?: string; onHoldReason?: string }): Promise<LeadRow>`:
    - `assertCan(user, 'lead.setStage')`.
    - When `stage === 'LOST'`, `lostReason` is **required** (throw `Error('lostReason required')` otherwise).
    - If `opts.probability` is given, use it; else set `probability` to `stageProbability[stage]` from config.
    - Writes an `activities` row (`type: 'FOLLOW_UP'`? no — `type: 'OTHER'`, `outcome: 'stage → <stage>'`) so the timeline records the move. Use `addActivity` from Task 14 if available; if Task 14 not done yet, inline a direct insert and refactor in Task 14 (note it).
    - Audited (`action: 'setStage'`, old/new stage+probability).

- [ ] **Step 1: Write the failing test**

Create `tests/services/lead-stage.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { createLead, setStage } from '@/server/services/lead';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('setStage', () => {
  it('moves stage and syncs probability from config defaults', async () => {
    const { orgId } = await seedBase();
    const lead = await createLead(owner(orgId), { businessName: 'A Co', contactPerson: 'A', phone: '9000000001' });
    const moved = await setStage(owner(orgId), lead.id, 'NEGOTIATION');
    expect(moved.stage).toBe('NEGOTIATION');
    expect(moved.probability).toBe(60);
  });
  it('requires a lost reason when moving to LOST', async () => {
    const { orgId } = await seedBase();
    const lead = await createLead(owner(orgId), { businessName: 'B Co', contactPerson: 'B', phone: '9000000002' });
    await expect(setStage(owner(orgId), lead.id, 'LOST')).rejects.toThrow('lostReason required');
    const lost = await setStage(owner(orgId), lead.id, 'LOST', { lostReason: 'PRICE', lostNotes: 'too high' });
    expect(lost.stage).toBe('LOST');
    expect(lost.lostReason).toBe('PRICE');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- lead-stage`
Expected: FAIL — `setStage` is not exported.

- [ ] **Step 3: Implement `setStage` in `src/server/services/lead.ts`**

```ts
import { activities } from '@/server/db/schema/crm';
import type { LeadStage } from '@/domain/pipeline';
// getConfig already imported

export async function setStage(
  user: AppUser, id: string, stage: LeadStage,
  opts: { probability?: number; lostReason?: string; lostNotes?: string; onHoldReason?: string } = {},
): Promise<LeadRow> {
  assertCan(user, 'lead.setStage');
  if (stage === 'LOST' && !opts.lostReason) throw new Error('lostReason required');
  const [before] = await db.select().from(distributorLeads)
    .where(and(eq(distributorLeads.id, id), eq(distributorLeads.orgId, user.orgId)));
  if (!before) throw new Error('not found');
  const probMap = await getConfig(user.orgId, 'stageProbability');
  const probability = opts.probability ?? probMap[stage];
  const [row] = await db.update(distributorLeads).set({
    stage, probability,
    lostReason: stage === 'LOST' ? opts.lostReason ?? null : null,
    lostNotes: stage === 'LOST' ? opts.lostNotes ?? null : null,
    onHoldReason: stage === 'ON_HOLD' ? opts.onHoldReason ?? null : null,
    updatedAt: new Date(),
  }).where(eq(distributorLeads.id, id)).returning();
  await db.insert(activities).values({
    orgId: user.orgId, leadId: id, employeeId: user.employeeId,
    type: 'OTHER', occurredAt: new Date(),
    outcome: `Stage: ${before.stage} → ${stage}`,
  });
  await writeAudit(user, 'lead', id, 'setStage',
    { stage: before.stage, probability: before.probability }, { stage, probability });
  return row;
}
```
> `// ponytail:` the timeline insert is duplicated logic with Task 14's `addActivity`. Task 14 refactors this to call `addActivity`. Log it.

- [ ] **Step 4: Lead detail page + actions**

Create `src/app/(app)/leads/[id]/actions.ts`:
```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { updateLead, rescoreLead, setStage } from '@/server/services/lead';
import type { LeadStage } from '@/domain/pipeline';

export async function saveLeadFields(id: string, formData: FormData) {
  const user = await requireUser();
  await updateLead(user, id, {
    businessName: String(formData.get('businessName') ?? ''),
    contactPerson: String(formData.get('contactPerson') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    email: String(formData.get('email') ?? ''),
    address: String(formData.get('address') ?? ''),
    expectedFfMonthlyPotential: Number(formData.get('expectedFfMonthlyPotential') ?? 0),
  } as any);
  revalidatePath(`/leads/${id}`);
}

export async function saveScore(id: string, formData: FormData) {
  const user = await requireUser();
  const keys = ['retailerNetwork','categoryExperience','geoCoverage','salesmen','deliveryInfra','workingCapital','brandPortfolio','reputation','willingness'];
  const inputs = Object.fromEntries(keys.map((k) => [k, Number(formData.get(k) ?? 0)]));
  await rescoreLead(user, id, inputs);
  revalidatePath(`/leads/${id}`);
}

export async function changeStage(id: string, formData: FormData) {
  const user = await requireUser();
  await setStage(user, id, String(formData.get('stage')) as LeadStage, {
    lostReason: (formData.get('lostReason') || undefined) as string | undefined,
    lostNotes: (formData.get('lostNotes') || undefined) as string | undefined,
  });
  revalidatePath(`/leads/${id}`);
}
```

Create `src/app/(app)/leads/[id]/page.tsx` — server component that:
- `requireUser()`, `getLead(user.orgId, id)`, 404 if null.
- Renders three cards: **Fields** (`saveLeadFields` bound with `id`), **Qualification score** (9 range inputs 0–1 step 0.1 defaulted from `lead.scoreInputs`, shows `score` + `<GradeBadge>`), **Stage** (`<select>` of `STAGES`, conditional `lostReason` select from `LOST_REASONS` + notes, submits `changeStage`).
- Leaves a `<section id="timeline">` placeholder — Task 14 fills it.
Bind actions with `.bind(null, id)` or `action={changeStage.bind(null, params.id)}`.

- [ ] **Step 5: Run tests + boot check**

Run: `npm test -- lead-stage` → PASS.
Run: `npm run dev`, create a lead, open its detail, move stage, set a score. Confirm grade badge updates.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: lead detail page — edit fields, qualification score, stage change with lost reason"
```
Append BUILD-LOG; log the duplicated timeline insert in PONYTAIL-DEBT.

---

### Task 14: Activity service + timeline on the lead detail

**Files:**
- Create: `src/server/services/activity.ts`
- Modify: `src/server/services/lead.ts` (`setStage` now calls `addActivity`)
- Modify: `src/app/(app)/leads/[id]/page.tsx` (render the timeline + add-activity form)
- Modify: `src/app/(app)/leads/[id]/actions.ts` (`logActivity`)
- Create: `tests/services/activity.test.ts`

**Interfaces:**
- Consumes: `activitySchema`, `distributorLeads`, `activities`.
- Produces:
  - `addActivity(user, input: ActivityInput): Promise<ActivityRow>`:
    - `assertCan(user, 'activity.create')`.
    - Parse `activitySchema`. Require `leadId` or `distributorId`.
    - Insert the activity (immutable — no update/delete method).
    - **If `leadId` set and `nextFollowUpAt` provided**, update `distributorLeads.nextFollowUpAt` to that value (the lead row is the single source of truth per spec §4.3).
    - Return the inserted row. Not audited (activities are themselves the log) — but stage-change activities still get a lead audit via `setStage`.
  - `listActivities(orgId, leadId): Promise<ActivityRow[]>` — not deleted, newest `occurredAt` first.

- [ ] **Step 1: Write the failing test**

Create `tests/services/activity.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { createLead } from '@/server/services/lead';
import { addActivity, listActivities } from '@/server/services/activity';
import { distributorLeads } from '@/server/db/schema/crm';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('activity service', () => {
  it('appends an activity and pushes nextFollowUpAt onto the lead', async () => {
    const { orgId } = await seedBase();
    const lead = await createLead(owner(orgId), { businessName: 'C Co', contactPerson: 'C', phone: '9000000003' });
    const due = new Date('2026-09-07T04:30:00Z');
    await addActivity(owner(orgId), { leadId: lead.id, type: 'CALL', notes: 'spoke to owner', nextFollowUpAt: due });
    const [row] = await testDb.select().from(distributorLeads).where(eq(distributorLeads.id, lead.id));
    expect(row.nextFollowUpAt?.toISOString()).toBe(due.toISOString());
    expect(await listActivities(orgId, lead.id)).toHaveLength(1);
  });

  it('rejects an activity with neither lead nor distributor', async () => {
    const { orgId } = await seedBase();
    await expect(addActivity(owner(orgId), { type: 'CALL' } as any)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- services/activity`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/server/services/activity.ts`**

```ts
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { activities, distributorLeads } from '@/server/db/schema/crm';
import { activitySchema, type ActivityInput } from '@/lib/schemas';
import { assertCan } from '@/server/auth/permissions';
import type { AppUser } from '@/server/auth/session';

export type ActivityRow = typeof activities.$inferSelect;

export async function addActivity(user: AppUser, input: ActivityInput): Promise<ActivityRow> {
  assertCan(user, 'activity.create');
  const data = activitySchema.parse(input);
  const [row] = await db.insert(activities).values({
    orgId: user.orgId,
    leadId: data.leadId ?? null,
    distributorId: data.distributorId ?? null,
    employeeId: user.employeeId,
    type: data.type,
    occurredAt: data.occurredAt,
    notes: data.notes || null,
    outcome: data.outcome || null,
    nextAction: data.nextAction || null,
    nextFollowUpAt: data.nextFollowUpAt ?? null,
  }).returning();
  if (data.leadId && data.nextFollowUpAt) {
    await db.update(distributorLeads)
      .set({ nextFollowUpAt: data.nextFollowUpAt, updatedAt: new Date() })
      .where(eq(distributorLeads.id, data.leadId));
  }
  return row;
}

export async function listActivities(orgId: string, leadId: string): Promise<ActivityRow[]> {
  return db.select().from(activities)
    .where(and(eq(activities.orgId, orgId), eq(activities.leadId, leadId), isNull(activities.deletedAt)))
    .orderBy(desc(activities.occurredAt));
}
```

- [ ] **Step 4: Refactor `setStage` to use `addActivity`**

In `src/server/services/lead.ts`, replace the inline `db.insert(activities)` in `setStage` with:
```ts
import { addActivity } from './activity';
// ...
await addActivity(user, { leadId: id, type: 'OTHER', outcome: `Stage: ${before.stage} → ${stage}` });
```
Remove the now-unused `activities` import if nothing else uses it. Re-run `npm test -- lead-stage` — still PASS.

- [ ] **Step 5: Timeline UI on the lead detail**

In `src/app/(app)/leads/[id]/actions.ts` add:
```ts
import { addActivity } from '@/server/services/activity';
import { ACTIVITY_TYPES } from '@/lib/schemas';

export async function logActivity(id: string, formData: FormData) {
  const user = await requireUser();
  const next = formData.get('nextFollowUpAt');
  await addActivity(user, {
    leadId: id,
    type: String(formData.get('type') ?? 'CALL') as (typeof ACTIVITY_TYPES)[number],
    notes: String(formData.get('notes') ?? ''),
    outcome: String(formData.get('outcome') ?? ''),
    nextAction: String(formData.get('nextAction') ?? ''),
    nextFollowUpAt: next ? new Date(String(next)) : null,
  });
  revalidatePath(`/leads/${id}`);
}
```
In `src/app/(app)/leads/[id]/page.tsx`, replace the `#timeline` placeholder with:
- a form (`action={logActivity.bind(null, id)}`) with: type `<select>` (`ACTIVITY_TYPES`), `notes` textarea, `outcome` input, `nextAction` input, `nextFollowUpAt` `<input type="date">`, submit.
- a `<ol>` of `await listActivities(user.orgId, id)` rows: `occurredAt` (`toLocaleString('en-IN')`), type, notes, outcome, "next: …", and the follow-up date if any.

- [ ] **Step 6: Run tests + boot check**

Run: `npm test` (full suite) → all PASS.
`npm run dev`: on a lead, log a CALL with a next follow-up date; confirm it appears in the timeline and the lead's "Next follow-up" column on `/leads` updates.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: activity service + lead timeline; setStage now records via addActivity"
```
Append BUILD-LOG; tick the duplicated-insert item in PONYTAIL-DEBT as cleared.

---

### Task 15: Pipeline Kanban screen

**Files:**
- Create: `src/app/(app)/pipeline/page.tsx` (replace placeholder)
- Create: `src/app/(app)/pipeline/board.tsx` (client component with dnd-kit)
- Create: `src/app/(app)/pipeline/actions.ts`
- Create: `tests/e2e/lead-pipeline.spec.ts`

**Interfaces:**
- Consumes: `listLeads`, `setStage`, `STAGES`, `weightedPipelineValue`, `formatINR`.
- Produces:
  - `moveLeadAction(leadId: string, stage: LeadStage): Promise<{ ok: true } | { error: string }>` — server action; `requireUser()`, `setStage`. On `LOST`, returns `{ error: 'lost-reason-required' }` so the board can prompt (M1: board just routes `LOST`/`ON_HOLD` moves to the lead detail page instead of dropping — simpler; `// ponytail:` inline lost-reason modal deferred).
  - `<Board columns={...} />` — renders one column per `STAGES` entry (excluding `LOST`/`ON_HOLD`, shown as a separate "Closed" strip), each column header showing lead count + `Σ weightedPipelineValue(potential, probability)` via `formatINR`. Cards show business name, area/territory name, potential, `score`+grade, probability, next follow-up date (red if none/overdue), assignee. Drag a card to another column → optimistic move + `moveLeadAction`; revert on error.

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/lead-pipeline.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test('a lead created via UI appears on the pipeline board in Identified', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/leads');
  await page.getByText('New lead').click();
  const name = `E2E Distributor ${Date.now()}`;
  await page.getByLabel('Business').fill(name);
  await page.getByLabel('Contact').fill('Test Person');
  await page.getByLabel('Phone').fill('9812345678');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);

  await page.goto('/pipeline');
  const identified = page.getByRole('region', { name: /identified/i });
  await expect(identified.getByText(name)).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run e2e -- lead-pipeline`
Expected: FAIL — `/pipeline` is a placeholder.

- [ ] **Step 3: Implement the move action**

Create `src/app/(app)/pipeline/actions.ts`:
```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { setStage } from '@/server/services/lead';
import type { LeadStage } from '@/domain/pipeline';

export async function moveLeadAction(leadId: string, stage: LeadStage) {
  const user = await requireUser();
  if (stage === 'LOST' || stage === 'ON_HOLD') return { error: 'open-detail' as const };
  try {
    await setStage(user, leadId, stage);
    revalidatePath('/pipeline');
    return { ok: true as const };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
```

- [ ] **Step 4: Implement the board (client) + page (server)**

Create `src/app/(app)/pipeline/board.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { moveLeadAction } from './actions';
import { formatINR } from '@/domain/money';
import { weightedPipelineValue, type LeadStage } from '@/domain/pipeline';

export type BoardLead = {
  id: string; businessName: string; territoryName: string | null;
  expectedFfMonthlyPotential: number; score: number; grade: string;
  probability: number; stage: LeadStage; nextFollowUpAt: string | null; assignee: string | null;
};

export function Board({ stages, leads }: { stages: LeadStage[]; leads: BoardLead[] }) {
  const router = useRouter();
  const [items, setItems] = useState(leads);

  async function onDragEnd(e: DragEndEvent) {
    const leadId = String(e.active.id);
    const target = e.over?.id as LeadStage | undefined;
    if (!target) return;
    const prev = items;
    setItems((xs) => xs.map((l) => (l.id === leadId ? { ...l, stage: target } : l)));
    const res = await moveLeadAction(leadId, target);
    if ('error' in res) {
      setItems(prev);
      if (res.error === 'open-detail') router.push(`/leads/${leadId}`);
    }
  }

  return (
    <DndContext onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const col = items.filter((l) => l.stage === stage);
          const weighted = col.reduce((a, l) => a + weightedPipelineValue(l.expectedFfMonthlyPotential, l.probability), 0);
          return (
            <section key={stage} aria-label={stage.replace(/_/g, ' ')} data-stage={stage}
              className="min-w-[220px] shrink-0 rounded border bg-neutral-50 p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {/* dnd-kit handles via context; native fallback no-op */}}>
              <header className="mb-2 flex items-baseline justify-between px-1">
                <span className="text-xs font-semibold uppercase text-neutral-600">{stage.replace(/_/g, ' ')}</span>
                <span className="text-[11px] text-neutral-400">{col.length} · {formatINR(weighted)}</span>
              </header>
              <DropColumn stage={stage} />
              <ul className="space-y-2">
                {col.map((l) => <Card key={l.id} lead={l} />)}
              </ul>
            </section>
          );
        })}
      </div>
    </DndContext>
  );
}
```
> Use `@dnd-kit/core`'s `useDraggable` for `Card` and `useDroppable` for `DropColumn` (small wrappers). Keep them in the same file. `Card` links its title to `/leads/{id}`. Show potential, `score` + grade, `probability%`, and `nextFollowUpAt` (red when null or past).

Create `src/app/(app)/pipeline/page.tsx`:
```tsx
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { and, eq, isNull } from 'drizzle-orm';
import { distributorLeads } from '@/server/db/schema/crm';
import { territories } from '@/server/db/schema/territory';
import { employees } from '@/server/db/schema/identity';
import { STAGES } from '@/domain/pipeline';
import { Board, type BoardLead } from './board';

const OPEN = STAGES.filter((s) => s !== 'LOST' && s !== 'ON_HOLD');

export default async function PipelinePage() {
  const user = await requireUser();
  const rows = await db.select({
    id: distributorLeads.id, businessName: distributorLeads.businessName,
    territoryName: territories.name, expectedFfMonthlyPotential: distributorLeads.expectedFfMonthlyPotential,
    score: distributorLeads.score, grade: distributorLeads.grade, probability: distributorLeads.probability,
    stage: distributorLeads.stage, nextFollowUpAt: distributorLeads.nextFollowUpAt, assignee: employees.name,
  }).from(distributorLeads)
    .leftJoin(territories, eq(territories.id, distributorLeads.territoryId))
    .leftJoin(employees, eq(employees.id, distributorLeads.assignedEmployeeId))
    .where(and(eq(distributorLeads.orgId, user.orgId), isNull(distributorLeads.deletedAt)));

  const leads: BoardLead[] = rows.map((r) => ({
    ...r, stage: r.stage as BoardLead['stage'],
    nextFollowUpAt: r.nextFollowUpAt ? r.nextFollowUpAt.toISOString() : null,
  }));

  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Distributor Pipeline</h1>
      <Board stages={OPEN} leads={leads} />
    </main>
  );
}
```

- [ ] **Step 5: Run the e2e test**

Run: `npm run e2e -- lead-pipeline`
Expected: PASS.

- [ ] **Step 6: Manual drag check + commit**

`npm run dev` → `/pipeline`: drag a card from Identified to Contacted; refresh; it stays. Drag to (a hidden) LOST is not possible since LOST column isn't rendered — moving to LOST happens on the lead detail page.
```bash
git add -A
git commit -m "feat: pipeline Kanban board with drag-to-restage and weighted column totals"
```
Append BUILD-LOG; log the deferred inline lost-reason modal in PONYTAIL-DEBT.

---

### Task 16: Follow-up domain + follow-up service

**Files:**
- Create: `src/domain/followup.ts`, `tests/domain/followup.test.ts`
- Create: `src/server/services/followup.ts`, `tests/services/followup.test.ts`

**Interfaces:**
- `src/domain/followup.ts` (pure):
  - `type FollowUpBucket = 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'NONE'`.
  - `classifyFollowUp(nextFollowUpAt: Date | null, now: Date): FollowUpBucket` — `NONE` if null; `OVERDUE` if before start-of-today; `TODAY` if same calendar day (Asia/Kolkata); `UPCOMING` if within the next 7 days; else `UPCOMING` too (anything future is upcoming, but `getFollowUpBuckets` only surfaces ≤7 days — see service). Use a `startOfDayIST(date)` helper.
  - `isHotLead(args: { grade: string; probability: number; stage: LeadStage; hotThreshold: number }): boolean` — `true` when `stage` is in `OPEN_STAGES` and (`grade === 'A'` or `probability >= hotThreshold`).
  - `needsNextAction(args: { stage: LeadStage; nextFollowUpAt: Date | null }): boolean` — `true` when `stage` in `OPEN_STAGES` and `nextFollowUpAt` is null.
- `src/server/services/followup.ts`:
  - `getFollowUpBuckets(orgId, opts?: { assignedEmployeeId?: string; now?: Date }): Promise<{ overdue: LeadLite[]; today: LeadLite[]; next7: LeadLite[]; noAction: LeadLite[]; hotNoAction: LeadLite[] }>` where `LeadLite = { id; businessName; stage; grade; probability; nextFollowUpAt: string | null; assignee: string | null }`. Query open, non-deleted leads; bucket with the domain helpers; `next7` = `UPCOMING` limited to ≤7 days out; `hotNoAction` = `noAction ∩ isHotLead`.

- [ ] **Step 1: Write the failing domain test**

Create `tests/domain/followup.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { classifyFollowUp, isHotLead, needsNextAction } from '@/domain/followup';

const now = new Date('2026-08-31T09:00:00+05:30');

describe('followup domain', () => {
  it('classifies buckets relative to IST today', () => {
    expect(classifyFollowUp(null, now)).toBe('NONE');
    expect(classifyFollowUp(new Date('2026-08-30T18:00:00+05:30'), now)).toBe('OVERDUE');
    expect(classifyFollowUp(new Date('2026-08-31T20:00:00+05:30'), now)).toBe('TODAY');
    expect(classifyFollowUp(new Date('2026-09-03T10:00:00+05:30'), now)).toBe('UPCOMING');
  });
  it('flags hot leads by grade or probability', () => {
    expect(isHotLead({ grade: 'A', probability: 10, stage: 'QUALIFIED', hotThreshold: 60 })).toBe(true);
    expect(isHotLead({ grade: 'C', probability: 70, stage: 'NEGOTIATION', hotThreshold: 60 })).toBe(true);
    expect(isHotLead({ grade: 'C', probability: 10, stage: 'NEGOTIATION', hotThreshold: 60 })).toBe(false);
    expect(isHotLead({ grade: 'A', probability: 99, stage: 'LOST', hotThreshold: 60 })).toBe(false);
  });
  it('detects open leads with no next action', () => {
    expect(needsNextAction({ stage: 'CONTACTED', nextFollowUpAt: null })).toBe(true);
    expect(needsNextAction({ stage: 'CONTACTED', nextFollowUpAt: now })).toBe(false);
    expect(needsNextAction({ stage: 'ON_HOLD', nextFollowUpAt: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- domain/followup`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/followup.ts`**

```ts
import { OPEN_STAGES, type LeadStage } from './pipeline';

export type FollowUpBucket = 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'NONE';

const IST_OFFSET_MIN = 330;

function istParts(d: Date) {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

export function classifyFollowUp(nextFollowUpAt: Date | null, now: Date): FollowUpBucket {
  if (!nextFollowUpAt) return 'NONE';
  const a = istParts(nextFollowUpAt);
  const b = istParts(now);
  const aKey = a.y * 10000 + a.m * 100 + a.day;
  const bKey = b.y * 10000 + b.m * 100 + b.day;
  if (aKey < bKey) return 'OVERDUE';
  if (aKey === bKey) return 'TODAY';
  return 'UPCOMING';
}

export function isHotLead(a: { grade: string; probability: number; stage: LeadStage; hotThreshold: number }): boolean {
  if (!OPEN_STAGES.includes(a.stage)) return false;
  return a.grade === 'A' || a.probability >= a.hotThreshold;
}

export function needsNextAction(a: { stage: LeadStage; nextFollowUpAt: Date | null }): boolean {
  return OPEN_STAGES.includes(a.stage) && a.nextFollowUpAt == null;
}
```

- [ ] **Step 4: Write the failing service test**

Create `tests/services/followup.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { createLead, setStage } from '@/server/services/lead';
import { addActivity } from '@/server/services/activity';
import { getFollowUpBuckets } from '@/server/services/followup';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });
const NOW = new Date('2026-08-31T09:00:00+05:30');

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('getFollowUpBuckets', () => {
  it('sorts leads into overdue / today / next7 / noAction', async () => {
    const { orgId } = await seedBase();
    const u = owner(orgId);
    const a = await createLead(u, { businessName: 'Overdue Co', contactPerson: 'A', phone: '9000000010' });
    await addActivity(u, { leadId: a.id, type: 'CALL', nextFollowUpAt: new Date('2026-08-29T10:00:00+05:30') });
    const b = await createLead(u, { businessName: 'Today Co', contactPerson: 'B', phone: '9000000011' });
    await addActivity(u, { leadId: b.id, type: 'CALL', nextFollowUpAt: new Date('2026-08-31T17:00:00+05:30') });
    const c = await createLead(u, { businessName: 'Soon Co', contactPerson: 'C', phone: '9000000012' });
    await addActivity(u, { leadId: c.id, type: 'CALL', nextFollowUpAt: new Date('2026-09-04T10:00:00+05:30') });
    const d = await createLead(u, { businessName: 'NoAction Co', contactPerson: 'D', phone: '9000000013' });
    await setStage(u, d.id, 'QUALIFIED');

    const buckets = await getFollowUpBuckets(orgId, { now: NOW });
    expect(buckets.overdue.map((l) => l.businessName)).toEqual(['Overdue Co']);
    expect(buckets.today.map((l) => l.businessName)).toEqual(['Today Co']);
    expect(buckets.next7.map((l) => l.businessName)).toEqual(['Soon Co']);
    expect(buckets.noAction.map((l) => l.businessName)).toContain('NoAction Co');
  });
});
```

- [ ] **Step 5: Implement `src/server/services/followup.ts`**

```ts
import { and, eq, isNull, inArray } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { distributorLeads } from '@/server/db/schema/crm';
import { employees } from '@/server/db/schema/identity';
import { OPEN_STAGES } from '@/domain/pipeline';
import { classifyFollowUp, isHotLead, needsNextAction } from '@/domain/followup';
import { getConfig } from './config';

export type LeadLite = {
  id: string; businessName: string; stage: string; grade: string; probability: number;
  nextFollowUpAt: string | null; assignee: string | null;
};

export async function getFollowUpBuckets(orgId: string, opts: { assignedEmployeeId?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const hotThreshold = await getConfig(orgId, 'hotLeadProbabilityThreshold');
  const conds = [
    eq(distributorLeads.orgId, orgId),
    isNull(distributorLeads.deletedAt),
    inArray(distributorLeads.stage, OPEN_STAGES),
  ];
  if (opts.assignedEmployeeId) conds.push(eq(distributorLeads.assignedEmployeeId, opts.assignedEmployeeId));

  const rows = await db.select({
    id: distributorLeads.id, businessName: distributorLeads.businessName, stage: distributorLeads.stage,
    grade: distributorLeads.grade, probability: distributorLeads.probability,
    nextFollowUpAt: distributorLeads.nextFollowUpAt, assignee: employees.name,
  }).from(distributorLeads)
    .leftJoin(employees, eq(employees.id, distributorLeads.assignedEmployeeId))
    .where(and(...conds));

  const lite = (r: typeof rows[number]): LeadLite => ({
    ...r, nextFollowUpAt: r.nextFollowUpAt ? r.nextFollowUpAt.toISOString() : null,
  });

  const overdue: LeadLite[] = [], today: LeadLite[] = [], next7: LeadLite[] = [], noAction: LeadLite[] = [], hotNoAction: LeadLite[] = [];
  const in7 = new Date(now.getTime() + 7 * 86400_000);
  for (const r of rows) {
    const bucket = classifyFollowUp(r.nextFollowUpAt, now);
    if (bucket === 'OVERDUE') overdue.push(lite(r));
    else if (bucket === 'TODAY') today.push(lite(r));
    else if (bucket === 'UPCOMING' && r.nextFollowUpAt && r.nextFollowUpAt <= in7) next7.push(lite(r));
    if (needsNextAction({ stage: r.stage as never, nextFollowUpAt: r.nextFollowUpAt })) {
      noAction.push(lite(r));
      if (isHotLead({ grade: r.grade, probability: r.probability, stage: r.stage as never, hotThreshold })) hotNoAction.push(lite(r));
    }
  }
  return { overdue, today, next7, noAction, hotNoAction };
}
```

- [ ] **Step 6: Run both test files**

Run: `npm test -- followup`
Expected: PASS (domain + service).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: follow-up domain (buckets, hot-lead, needs-next-action) + follow-up service"
```
Append BUILD-LOG.

---

### Task 17: Task service + Today's Tasks screen

**Files:**
- Create: `src/server/services/task.ts`
- Create: `src/app/(app)/today/page.tsx` (replace placeholder), `src/app/(app)/today/actions.ts`
- Create: `tests/services/task.test.ts`

**Interfaces:**
- Consumes: `taskSchema`, `tasks` table, `getFollowUpBuckets`.
- Produces:
  - `type TaskRow = typeof tasks.$inferSelect`.
  - `createTask(user, input: TaskInput): Promise<TaskRow>` — `assertCan(user,'task.create')`; parse; `createdBy = user.id`; default `assignedEmployeeId` to `user.employeeId` for SALES.
  - `updateTask(user, id, input: Partial<TaskInput> & { status?: TaskStatus }): Promise<TaskRow>` — `assertCan(user,'task.update')`.
  - `completeTask(user, id): Promise<TaskRow>` — `assertCan(user,'task.complete')`; sets `status='COMPLETED'`, `completedAt=now`.
  - `listOpenTasks(orgId, opts?: { assignedEmployeeId?: string }): Promise<TaskRow[]>` — status in (`PENDING`,`IN_PROGRESS`), not deleted, order by `dueDate asc`.
  - `getTodayView(orgId, opts?: { assignedEmployeeId?: string; now?: Date }): Promise<{ tasks: { overdue: TaskRow[]; today: TaskRow[]; upcoming: TaskRow[] }; followUps: Awaited<ReturnType<typeof getFollowUpBuckets>> }>` — union view per spec §4.3: open tasks bucketed by `dueDate` vs IST today, plus the follow-up buckets. A due follow-up does **not** create a task row.

- [ ] **Step 1: Write the failing test**

Create `tests/services/task.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { createTask, completeTask, listOpenTasks, getTodayView } from '@/server/services/task';
import { createLead } from '@/server/services/lead';
import { addActivity } from '@/server/services/activity';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });
const NOW = new Date('2026-08-31T09:00:00+05:30');

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('task service', () => {
  it('creates, lists open, and completes a task', async () => {
    const { orgId } = await seedBase();
    const u = owner(orgId);
    const t = await createTask(u, { title: 'Call Acme', type: 'CALL', dueDate: new Date('2026-08-31') });
    expect((await listOpenTasks(orgId)).map((x) => x.title)).toEqual(['Call Acme']);
    const done = await completeTask(u, t.id);
    expect(done.status).toBe('COMPLETED');
    expect(await listOpenTasks(orgId)).toHaveLength(0);
  });

  it('today view unions open tasks with due follow-ups, without creating task rows', async () => {
    const { orgId } = await seedBase();
    const u = owner(orgId);
    await createTask(u, { title: 'Overdue meeting', type: 'MEETING', dueDate: new Date('2026-08-29') });
    const lead = await createLead(u, { businessName: 'FollowUp Co', contactPerson: 'F', phone: '9000000020' });
    await addActivity(u, { leadId: lead.id, type: 'CALL', nextFollowUpAt: new Date('2026-08-31T17:00:00+05:30') });

    const view = await getTodayView(orgId, { now: NOW });
    expect(view.tasks.overdue.map((t) => t.title)).toEqual(['Overdue meeting']);
    expect(view.followUps.today.map((l) => l.businessName)).toEqual(['FollowUp Co']);
    expect(await listOpenTasks(orgId)).toHaveLength(1);   // still just the manual task
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- services/task`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/server/services/task.ts`**

```ts
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { tasks } from '@/server/db/schema/crm';
import { taskSchema, type TaskInput, TASK_STATUSES } from '@/lib/schemas';
import { assertCan } from '@/server/auth/permissions';
import { getFollowUpBuckets } from './followup';
import { classifyFollowUp } from '@/domain/followup';
import type { AppUser } from '@/server/auth/session';

export type TaskRow = typeof tasks.$inferSelect;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export async function createTask(user: AppUser, input: TaskInput): Promise<TaskRow> {
  assertCan(user, 'task.create');
  const d = taskSchema.parse(input);
  const [row] = await db.insert(tasks).values({
    orgId: user.orgId, title: d.title, type: d.type,
    leadId: d.leadId ?? null, distributorId: d.distributorId ?? null,
    priority: d.priority, dueDate: d.dueDate.toISOString().slice(0, 10),
    assignedEmployeeId: d.assignedEmployeeId ?? (user.role === 'SALES' ? user.employeeId : null),
    createdBy: user.id,
  }).returning();
  return row;
}

export async function updateTask(user: AppUser, id: string, input: Partial<TaskInput> & { status?: TaskStatus }): Promise<TaskRow> {
  assertCan(user, 'task.update');
  const patch = taskSchema.partial().parse(input);
  const [row] = await db.update(tasks).set({
    ...patch,
    dueDate: patch.dueDate ? patch.dueDate.toISOString().slice(0, 10) : undefined,
    status: input.status,
    updatedAt: new Date(),
  }).where(and(eq(tasks.id, id), eq(tasks.orgId, user.orgId))).returning();
  return row;
}

export async function completeTask(user: AppUser, id: string): Promise<TaskRow> {
  assertCan(user, 'task.complete');
  const [row] = await db.update(tasks)
    .set({ status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.orgId, user.orgId))).returning();
  return row;
}

export async function listOpenTasks(orgId: string, opts: { assignedEmployeeId?: string } = {}): Promise<TaskRow[]> {
  const conds = [eq(tasks.orgId, orgId), isNull(tasks.deletedAt), inArray(tasks.status, ['PENDING', 'IN_PROGRESS'])];
  if (opts.assignedEmployeeId) conds.push(eq(tasks.assignedEmployeeId, opts.assignedEmployeeId));
  return db.select().from(tasks).where(and(...conds)).orderBy(asc(tasks.dueDate));
}

export async function getTodayView(orgId: string, opts: { assignedEmployeeId?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const open = await listOpenTasks(orgId, opts);
  const overdue: TaskRow[] = [], today: TaskRow[] = [], upcoming: TaskRow[] = [];
  for (const t of open) {
    const b = classifyFollowUp(new Date(`${t.dueDate}T12:00:00+05:30`), now);
    if (b === 'OVERDUE') overdue.push(t);
    else if (b === 'TODAY') today.push(t);
    else upcoming.push(t);
  }
  const followUps = await getFollowUpBuckets(orgId, opts);
  return { tasks: { overdue, today, upcoming }, followUps };
}
```

- [ ] **Step 4: Today screen + actions**

Create `src/app/(app)/today/actions.ts`:
```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { createTask, completeTask } from '@/server/services/task';
import { TASK_TYPES } from '@/lib/schemas';

export async function addTask(formData: FormData) {
  const user = await requireUser();
  await createTask(user, {
    title: String(formData.get('title') ?? ''),
    type: String(formData.get('type') ?? 'OTHER') as (typeof TASK_TYPES)[number],
    dueDate: new Date(String(formData.get('dueDate') ?? new Date().toISOString().slice(0, 10))),
  });
  revalidatePath('/today');
}

export async function finishTask(id: string) {
  const user = await requireUser();
  await completeTask(user, id);
  revalidatePath('/today');
}
```

Create `src/app/(app)/today/page.tsx`:
```tsx
import Link from 'next/link';
import { requireUser } from '@/server/auth/session';
import { getTodayView } from '@/server/services/task';
import { TASK_TYPES } from '@/lib/schemas';
import { addTask, finishTask } from './actions';

export default async function TodayPage() {
  const user = await requireUser();
  const scope = user.role === 'SALES' && user.employeeId ? { assignedEmployeeId: user.employeeId } : {};
  const view = await getTodayView(user.orgId, scope);

  const TaskList = ({ label, items }: { label: string; items: typeof view.tasks.overdue }) => (
    <div>
      <h3 className="text-sm font-semibold text-neutral-600">{label} ({items.length})</h3>
      <ul className="mt-1 space-y-1">
        {items.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
            <span>{t.title} <span className="text-neutral-400">· {t.type} · due {t.dueDate}</span></span>
            <form action={finishTask.bind(null, t.id)}><button className="text-xs text-blue-700 hover:underline">Done</button></form>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-neutral-400">Nothing here.</li>}
      </ul>
    </div>
  );

  const FollowUps = ({ label, items }: { label: string; items: typeof view.followUps.overdue }) => (
    <div>
      <h3 className="text-sm font-semibold text-neutral-600">{label} ({items.length})</h3>
      <ul className="mt-1 space-y-1">
        {items.map((l) => (
          <li key={l.id} className="rounded border px-3 py-2 text-sm">
            <Link href={`/leads/${l.id}`} className="text-blue-700 hover:underline">{l.businessName}</Link>
            <span className="text-neutral-400"> · {l.stage} · {l.nextFollowUpAt ? new Date(l.nextFollowUpAt).toLocaleDateString('en-IN') : 'no date'}</span>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-neutral-400">Nothing here.</li>}
      </ul>
    </div>
  );

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Today's Tasks</h1>
      <form action={addTask} className="flex flex-wrap items-end gap-2 rounded border p-3">
        <label className="text-sm">Task<input name="title" required className="mt-1 block rounded border px-2 py-1" /></label>
        <label className="text-sm">Type<select name="type" className="mt-1 block rounded border px-2 py-1">{TASK_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="text-sm">Due<input name="dueDate" type="date" required className="mt-1 block rounded border px-2 py-1" /></label>
        <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Add</button>
      </form>
      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h2 className="font-semibold">Tasks</h2>
          <TaskList label="Overdue" items={view.tasks.overdue} />
          <TaskList label="Today" items={view.tasks.today} />
          <TaskList label="Upcoming" items={view.tasks.upcoming} />
        </div>
        <div className="space-y-4">
          <h2 className="font-semibold">Follow-ups</h2>
          <FollowUps label="Overdue" items={view.followUps.overdue} />
          <FollowUps label="Today" items={view.followUps.today} />
          <FollowUps label="Next 7 days" items={view.followUps.next7} />
          <FollowUps label="Hot — no next action" items={view.followUps.hotNoAction} />
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Run tests + boot check**

Run: `npm test -- services/task` → PASS.
`npm run dev` → `/today`: add a task; mark it done; confirm a lead with an overdue follow-up shows under Follow-ups → Overdue.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: task service + Today's Tasks (tasks + due follow-ups union view)"
```
Append BUILD-LOG.

---

### Task 18: Daily employee report — service + submit + owner list

**Files:**
- Create: `src/server/services/dailyReport.ts`
- Create: `src/app/(app)/daily-report/page.tsx` (replace placeholder), `src/app/(app)/daily-report/actions.ts`
- Create: `src/app/(app)/reports/daily/page.tsx` (replace placeholder)
- Create: `tests/services/dailyReport.test.ts`

**Interfaces:**
- Consumes: `dailyReportSchema`, `employeeDailyReports`, `activities`, `tasks`, `distributorLeads`.
- Produces:
  - `submitReport(user, input: DailyReportInput): Promise<ReportRow>` — `assertCan(user,'dailyReport.submit')`; requires `user.employeeId` (throw `Error('no employee record')` if null); upsert on `(orgId, employeeId, reportDate)`; sets `submittedAt=now`.
  - `deriveCounts(orgId, employeeId, date: Date): Promise<{ activity: Record<string, number>; funnel: Record<string, number> }>`:
    - `activity`: `calls` (activities type CALL that day), `meetings` (MEETING), `presentations` (PRESENTATION), `followUpsCompleted` (activities type FOLLOW_UP that day), `quotations` (QUOTATION).
    - `funnel`: `newLeads` (leads created that day by this employee), `qualifiedLeads` (leads whose stage reached QUALIFIED via a setStage audit that day — M1 simplification: count leads with `stage` rank ≥ QUALIFIED and `updatedAt` that day), `appointments` (stage APPOINTED, updatedAt that day), `firstOrders` (stage FIRST_ORDER, updatedAt that day).
    - `// ponytail:` funnel counts use `updatedAt`-on-that-day as a proxy for "moved that day"; ceiling: a lead edited for another reason double-counts; upgrade path: derive from `audit_log` setStage rows. Log it.
  - `listReports(orgId, opts?: { employeeId?: string; from?: Date; to?: Date }): Promise<(ReportRow & { counts: Awaited<ReturnType<typeof deriveCounts>> })[]>` — newest first, each row enriched with `deriveCounts`.

- [ ] **Step 1: Write the failing test**

Create `tests/services/dailyReport.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { db } from '@/server/db/client';
import { employees } from '@/server/db/schema/identity';
import { createLead } from '@/server/services/lead';
import { addActivity } from '@/server/services/activity';
import { submitReport, deriveCounts, listReports } from '@/server/services/dailyReport';
import type { AppUser } from '@/server/auth/session';

beforeAll(migrateTestDb);
beforeEach(resetDb);

async function salesUser(orgId: string): Promise<AppUser> {
  const [emp] = await db.insert(employees).values({ orgId, name: 'Rep', phone: '9000000099' }).returning();
  return { id: 'u-rep', email: 'rep', name: 'Rep', role: 'SALES', employeeId: emp.id, orgId };
}

describe('daily report service', () => {
  it('requires an employee record and upserts one row per day', async () => {
    const { orgId } = await seedBase();
    const owner: AppUser = { id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId };
    await expect(submitReport(owner, { reportDate: new Date('2026-08-31'), areasVisited: [] } as any))
      .rejects.toThrow('no employee record');

    const rep = await salesUser(orgId);
    await submitReport(rep, { reportDate: new Date('2026-08-31'), areasVisited: ['Whitefield'], notes: 'ok' });
    await submitReport(rep, { reportDate: new Date('2026-08-31'), areasVisited: ['Hoodi'], notes: 'revised' });
    const reports = await listReports(orgId);
    expect(reports).toHaveLength(1);
    expect(reports[0].areasVisited).toEqual(['Hoodi']);
  });

  it('derives activity counts for the day', async () => {
    const { orgId } = await seedBase();
    const rep = await salesUser(orgId);
    const lead = await createLead(rep, { businessName: 'D Co', contactPerson: 'D', phone: '9000000030' });
    await addActivity(rep, { leadId: lead.id, type: 'CALL', occurredAt: new Date('2026-08-31T10:00:00+05:30') });
    await addActivity(rep, { leadId: lead.id, type: 'MEETING', occurredAt: new Date('2026-08-31T12:00:00+05:30') });
    const counts = await deriveCounts(orgId, rep.employeeId!, new Date('2026-08-31T09:00:00+05:30'));
    expect(counts.activity.calls).toBe(1);
    expect(counts.activity.meetings).toBe(1);
    expect(counts.funnel.newLeads).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- dailyReport`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/server/services/dailyReport.ts`**

Implement `submitReport` (upsert via `onConflictDoUpdate` on the unique index), `deriveCounts` (use `sql` date-range filters `occurred_at >= $start and < $end` where start/end are the IST day bounds converted to UTC — reuse a small `istDayBounds(date)` helper defined in this file), and `listReports` (select reports, then `Promise.all` map through `deriveCounts`). `assertCan` on submit.

- [ ] **Step 4: Submit page + actions + owner list**

Create `src/app/(app)/daily-report/actions.ts` — `submitDailyReport(formData)`: `requireUser`, build `areasVisited` from a comma-split text field, call `submitReport`, `redirect('/daily-report?done=1')`.

Create `src/app/(app)/daily-report/page.tsx` — server component: `requireUser`; if `!user.employeeId` show "No employee record linked — ask the owner." Otherwise a form: date (default today), areas visited (text, comma-separated), notes, blockers; on `?done=1` show a success note; below, show today's `deriveCounts` as read-only Activity / Funnel tiles (spec §5.7 — keep the two groups visually separate, never summed).

Create `src/app/(app)/reports/daily/page.tsx` — `requireUser`; `assertCan(user,'dailyReport.viewAll')` (redirect if not); `listReports(user.orgId)`; table: date, employee, areas, Activity block (calls/meetings/presentations/follow-ups/quotations), Funnel block (new/qualified/appointments/first orders), notes, blockers.

- [ ] **Step 5: Run tests + boot check**

Run: `npm test -- dailyReport` → PASS.
`npm run dev`: as the sales rep, submit a report; as the owner, see it at `/reports/daily`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: daily employee report — submit, derived activity/funnel counts, owner review list"
```
Append BUILD-LOG; log the `updatedAt`-proxy funnel counting in PONYTAIL-DEBT.

---

### Task 19: Settings — score weights + follow-up threshold

**Files:**
- Create: `src/app/(app)/settings/page.tsx` (replace placeholder), `src/app/(app)/settings/actions.ts`
- Create: `tests/e2e/settings.spec.ts`

**Interfaces:**
- Consumes: `getConfig`, `setConfig`, `assertCan`, `assertWeightsValid`.
- Produces:
  - `saveScoreWeights(formData): Promise<void>` — `requireUser`; `assertCan(user,'config.edit')`; read the 9 integer weight fields; `assertWeightsValid` (surfaces the sum≠100 error); `setConfig(orgId,'scoreWeights',...)`.
  - `saveThresholds(formData): Promise<void>` — `setConfig(orgId,'hotLeadProbabilityThreshold', int)`.
  - Settings page (OWNER only — `assertCan` or redirect): two forms pre-filled from `getConfig`, and a read-only display of `stageProbability` (editing that map is deferred to M2 — `// ponytail:` note).

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/settings.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test('owner can change the hot-lead probability threshold', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: /sign in/i }).click();

  await page.goto('/settings');
  const field = page.getByLabel('Hot-lead probability threshold (%)');
  await field.fill('55');
  await page.getByRole('button', { name: 'Save thresholds' }).click();
  await expect(page.getByText(/saved/i)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Hot-lead probability threshold (%)')).toHaveValue('55');
});

test('sales rep cannot open settings', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('sales@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.goto('/settings');
  await expect(page).not.toHaveURL(/\/settings$/);   // redirected away
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run e2e -- settings`
Expected: FAIL — `/settings` is a placeholder.

- [ ] **Step 3: Implement actions**

Create `src/app/(app)/settings/actions.ts`:
```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { assertCan } from '@/server/auth/permissions';
import { getConfig, setConfig } from '@/server/services/config';
import { assertWeightsValid, type ScoreWeights } from '@/domain/scoring';

const WEIGHT_KEYS = ['retailerNetwork','categoryExperience','geoCoverage','salesmen','deliveryInfra','workingCapital','brandPortfolio','reputation','willingness'] as const;

export async function saveScoreWeights(_prev: unknown, formData: FormData) {
  const user = await requireUser();
  assertCan(user, 'config.edit');
  const weights = Object.fromEntries(WEIGHT_KEYS.map((k) => [k, Number(formData.get(k) ?? 0)])) as ScoreWeights;
  try { assertWeightsValid(weights); } catch (e) { return { error: (e as Error).message }; }
  await setConfig(user.orgId, 'scoreWeights', weights);
  revalidatePath('/settings');
  return { ok: true as const };
}

export async function saveThresholds(_prev: unknown, formData: FormData) {
  const user = await requireUser();
  assertCan(user, 'config.edit');
  const n = Number(formData.get('hotLeadProbabilityThreshold') ?? 60);
  if (!Number.isInteger(n) || n < 0 || n > 100) return { error: 'threshold must be 0–100' };
  await setConfig(user.orgId, 'hotLeadProbabilityThreshold', n);
  revalidatePath('/settings');
  return { ok: true as const };
}
```

- [ ] **Step 4: Implement the page**

Create `src/app/(app)/settings/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { getConfig, CONFIG_DEFAULTS } from '@/server/services/config';
import { SettingsForms } from './forms';

export default async function SettingsPage() {
  const user = await requireUser();
  if (!can(user, 'config.edit')) redirect('/');
  const [weights, threshold] = await Promise.all([
    getConfig(user.orgId, 'scoreWeights'),
    getConfig(user.orgId, 'hotLeadProbabilityThreshold'),
  ]);
  return (
    <main className="p-6 space-y-8">
      <h1 className="text-xl font-semibold">Settings</h1>
      <SettingsForms weights={weights} threshold={threshold} />
      <section>
        <h2 className="text-sm font-semibold text-neutral-600">Stage probabilities (read-only in M1)</h2>
        <pre className="mt-2 rounded border bg-neutral-50 p-3 text-xs">{JSON.stringify(CONFIG_DEFAULTS.stageProbability, null, 2)}</pre>
      </section>
    </main>
  );
}
```
Create `src/app/(app)/settings/forms.tsx` — a `'use client'` component using `useActionState` for both `saveScoreWeights` and `saveThresholds`; render the 9 weight number inputs (labelled by key), a live sum, an error line, and a separate "Hot-lead probability threshold (%)" number input with a "Save thresholds" button. Show "Saved" on `ok`.

- [ ] **Step 5: Run the e2e test**

Run: `npm run e2e -- settings`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Settings — editable score weights (sum-100 validated) + hot-lead threshold"
```
Append BUILD-LOG; note the deferred stage-probability editor in PONYTAIL-DEBT.

---

### Task 20: Seed demo data + purge

**Files:**
- Modify: `src/server/db/seed.ts` (add `seedDemo()`, `purgeDemo()`, wire the CLI)
- Create: `src/app/(app)/settings/actions.ts` → add `purgeDemoAction`
- Modify: `src/app/(app)/settings/page.tsx` (add a "Purge demo data" button)
- Modify: `src/app/(app)/layout.tsx` (show a "Demo data present" banner when any `is_demo` row exists)
- Create: `tests/services/seed.test.ts`

**Interfaces:**
- Produces:
  - `seedDemo(): Promise<void>` — idempotent-ish (skips if demo leads already present). Creates, all with `isDemo: true`:
    - the two logins are **not** created here (that's `scripts/create-user.ts`); instead ensure one `employees` row "Field Rep (Demo)" linked to the `sales@example.com` user if it exists.
    - ~12 Bangalore East territories (Whitefield, Mahadevapura, KR Puram, Marathahalli, Hoodi, Brookefield, Varthur, Kadugodi, ITPL, Indiranagar, Domlur, Bellandur) under one "Bangalore East" ZONE.
    - 20 `distributor_leads` spread across stages (2–3 per open stage, 1 LOST with reason, 1 ON_HOLD), realistic FMCG business names, `expectedFfMonthlyPotential` ₹1.5L–₹6L in paise, `scoreInputs` + computed `score`/`grade`, some with `nextFollowUpAt` (a few overdue, a few today, a few within 7 days, a few null).
    - ~40 `activities` across those leads (calls, meetings, one presentation each for mid-funnel).
    - ~8 `tasks` (mix of overdue/today/upcoming, priorities).
    - 3 `employee_daily_reports` for the demo rep (last 3 weekdays).
  - `purgeDemo(): Promise<void>` — deletes rows where `is_demo = true` from activities, tasks, distributor_leads, employee_daily_reports, territories (demo ones), in FK-safe order.
  - `hasDemoData(orgId): Promise<boolean>`.
- CLI: `npm run db:seed` runs `seedBase()` then `seedDemo()`. `npm run db:seed -- --purge` runs `purgeDemo()`.

- [ ] **Step 1: Write the failing test**

Create `tests/services/seed.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase, seedDemo, purgeDemo, hasDemoData } from '@/server/db/seed';
import { distributorLeads } from '@/server/db/schema/crm';
import { STAGES } from '@/domain/pipeline';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('demo seed', () => {
  it('creates ~20 leads across multiple stages, all flagged is_demo', async () => {
    const { orgId } = await seedBase();
    await seedDemo();
    const leads = await testDb.select().from(distributorLeads);
    expect(leads.length).toBeGreaterThanOrEqual(18);
    expect(leads.every((l) => l.isDemo)).toBe(true);
    const stages = new Set(leads.map((l) => l.stage));
    expect(stages.size).toBeGreaterThanOrEqual(6);
    expect([...stages].every((s) => STAGES.includes(s as never))).toBe(true);
    expect(await hasDemoData(orgId)).toBe(true);
  });

  it('purge removes every demo row', async () => {
    const { orgId } = await seedBase();
    await seedDemo();
    await purgeDemo();
    expect(await testDb.select().from(distributorLeads)).toHaveLength(0);
    expect(await hasDemoData(orgId)).toBe(false);
  });

  it('seedDemo is safe to run twice', async () => {
    await seedBase();
    await seedDemo();
    await seedDemo();
    const leads = await testDb.select().from(distributorLeads);
    expect(leads.length).toBeLessThanOrEqual(24);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- services/seed`
Expected: FAIL — `seedDemo` not exported.

- [ ] **Step 3: Implement the demo seed**

In `src/server/db/seed.ts` add `seedDemo`, `purgeDemo`, `hasDemoData`. Use `scoreDistributor` with `CONFIG_DEFAULTS.scoreWeights` to compute score/grade. Keep names generic ("Sri Balaji Distributors", "Green Valley Traders", …) — no real people. Build lead rows with a small deterministic helper rather than a faker dependency (`// ponytail:` no faker — a fixed array of 20 seed objects is simpler and reviewable). Wire the CLI:
```ts
if (process.argv[1]?.endsWith('seed.ts')) {
  const purge = process.argv.includes('--purge');
  (purge ? purgeDemo() : seedBase().then(seedDemo)).then(() => process.exit(0));
}
```

- [ ] **Step 4: Purge action + banner**

Add to `src/app/(app)/settings/actions.ts`:
```ts
import { purgeDemo } from '@/server/db/seed';
export async function purgeDemoAction() {
  const user = await requireUser();
  assertCan(user, 'config.edit');
  await purgeDemo();
  revalidatePath('/', 'layout');
}
```
Add a confirming `<form action={purgeDemoAction}>` button to the Settings page. In `src/app/(app)/layout.tsx`, call `hasDemoData(user.orgId)` and render a thin amber banner "Demo data is loaded" when true.

- [ ] **Step 5: Run tests + seed locally**

Run: `npm test -- services/seed` → PASS.
Run: `npm run db:seed` → then `npm run dev` and confirm `/pipeline`, `/today`, `/leads` are populated; the demo banner shows.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: demo seed (territories, 20 leads, activities, tasks, reports) + purge + banner"
```
Append BUILD-LOG.

---

### Task 21: Minimal dashboard (M1)

**Files:**
- Modify: `src/app/(app)/page.tsx` (replace the scaffold placeholder)
- Create: `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `getFollowUpBuckets`, `getTodayView`, `listLeads`, `funnelConversion`, `weightedPipelineValue`, `formatINR`.
- Produces: a server-rendered dashboard for both roles (SALES scoped to `employeeId`). Sections:
  1. **Today** — counts: follow-ups overdue / today / next-7, open tasks overdue / today, hot leads with no next action (links to `/today`).
  2. **Pipeline funnel** — `funnelConversion(openLeads)` rendered as a simple bar list with count + `convFromPrev%`.
  3. **Weighted pipeline value** — `Σ weightedPipelineValue` across open leads, `formatINR`.
  4. **Leads needing attention** — `hotNoAction` list (top 5), each linking to the lead.
  > Full Command Center (six blocks, morning/eod) is Milestone 3 — this is a deliberately thin M1 landing page. `// ponytail:` note it.

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/dashboard.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test('owner dashboard shows the pipeline funnel and today counts after seeding', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: /today/i })).toBeVisible();
  await expect(page.getByText(/pipeline funnel/i)).toBeVisible();
  await expect(page.getByText(/weighted pipeline/i)).toBeVisible();
});
```
> Prerequisite: `npm run db:seed` has been run so the funnel is non-empty.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run e2e -- dashboard`
Expected: FAIL — placeholder page.

- [ ] **Step 3: Implement `src/app/(app)/page.tsx`**

Server component: `requireUser()`; `scope = SALES ? { assignedEmployeeId: user.employeeId } : {}`. Load open leads via `listLeads(orgId, { limit: 500 })` filtered to `OPEN_STAGES`, `getTodayView(orgId, scope)`. Compute funnel + weighted value with the domain fns. Render the four sections with Tailwind cards. Keep it under ~120 lines.

- [ ] **Step 4: Run the e2e test**

Run: `npm run e2e -- dashboard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: minimal M1 dashboard — today counts, pipeline funnel, weighted value, attention list"
```
Append BUILD-LOG; note the deferred full Command Center in PONYTAIL-DEBT.

---

### Task 22: Deploy to Cloudflare + finalize docs

**Files:**
- Modify: `wrangler.toml`, `open-next.config.ts` (as needed), `README.md`
- Create: `docs/DEPLOY.md`
- Create: `.github/` — skip (logged as debt in Task 1)

**Interfaces:**
- Produces: a live URL on `*.workers.dev` (or a custom domain), with the schema migrated on the Supabase cloud project and the two logins created.

- [ ] **Step 1: Create the cloud Supabase project + apply schema**

- Create a Supabase project (region closest to Bangalore). From its dashboard collect: Project URL, `anon` key, `service_role` key, and the **pooler** connection string (Settings → Database → Connection pooling, mode **Transaction**, port 6543).
- Locally, set `DATABASE_URL` to that pooler string and run `npm run db:migrate`.
- Run `npx tsx scripts/create-user.ts owner@<domain> '<pw>' "Owner" OWNER` and `... sales@<domain> '<pw>' "Field Rep" SALES` against the cloud project.
- Optionally `npm run db:seed` for a demo-populated launch (or skip for a clean start; the owner can seed later from Settings? — M1 has no seed button, only purge; `// ponytail:` add a "load demo data" button post-M1 if wanted).

- [ ] **Step 2: Configure Cloudflare**

```bash
npx wrangler login
npx wrangler secret put DATABASE_URL           # the transaction pooler string
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
npx wrangler secret put CRON_SECRET             # any random string; used from Milestone 3
```
Set `NEXT_PUBLIC_SUPABASE_URL` in `wrangler.toml` `[vars]` (public, not a secret). Confirm `compatibility_flags = ["nodejs_compat"]`.

- [ ] **Step 3: Build and deploy**

Run:
```bash
npm run cf:deploy
```
Expected: `wrangler` prints a deployed URL. Open it, sign in as the owner, verify `/`, `/pipeline`, `/leads`, `/today`, `/settings` render and a lead can be created.

- [ ] **Step 4: Smoke test the deploy**

Run the e2e suite against the deployed URL:
```bash
PLAYWRIGHT_BASE_URL=<deployed-url> npm run e2e
```
(Adjust `playwright.config.ts` to read `PLAYWRIGHT_BASE_URL` and skip the local `webServer` when it is set.)
Expected: all specs PASS against production. If auth specs need seeded users, ensure the owner/sales logins exist on the cloud project.

- [ ] **Step 5: Write `docs/DEPLOY.md` and finish `README.md`**

`docs/DEPLOY.md`: the Supabase project setup, the pooler-string requirement (`prepare: false`), the `wrangler secret` list, `npm run cf:deploy`, how to run migrations against prod (`DATABASE_URL=<pooler> npm run db:migrate`), and how to create users.
`README.md`: local quickstart (`supabase start`, `.env.local`, `db:migrate`, `db:seed`, `dev`), test commands, and a link to `DEPLOY.md`. Add an "Implemented (M1)" list and a "Next (M2/M3)" list per spec §13.

- [ ] **Step 6: Commit + tag**

```bash
git add -A
git commit -m "chore: Cloudflare deploy config + deployment docs; Milestone 1 complete"
git tag milestone-1
```
Append the final BUILD-LOG entry summarising Milestone 1.

---

## Self-Review

**1. Spec coverage (Milestone 1 scope only — spec §9 "Milestone 1 — Field CRM"):**

| Spec item | Task(s) |
|---|---|
| Scaffold (Next.js 15 + OpenNext/Cloudflare + Drizzle + Supabase Auth + Tailwind + shadcn) | 1, 2, 4, 22 |
| Identity / territory / CRM schema | 3, 10, 11 |
| Auth + permission matrix | 4, 5 |
| Territories (hierarchy, editable, per-spec types) | 10 |
| Distributor Leads + scoring | 9, 12, 13 |
| Pipeline Kanban (14 stages, weighted column value, card fields) | 8, 15 |
| Activities (immutable timeline, updates lead.next_follow_up_at) | 14 |
| Follow-up engine (today/overdue/next-7, no-next-action flag, hot-lead) | 16 |
| Tasks / Today's Tasks (union of open tasks + due follow-ups) | 17 |
| Daily employee report (submit + derived activity/funnel split) | 18 |
| Settings (editable score weights, hot threshold) | 19 |
| Seed data (real catalogue is M2; M1 seeds demo transactional data, is_demo, purge) | 20 |
| Minimal dashboard | 21 |
| Deploy to Cloudflare | 22 |
| Audit log on lead/territory/config/score/stage changes | 10 (`writeAudit`), 12, 13, 19 |
| Soft delete on relationship tables | 10, 11 (columns); list queries filter (12, 14, 16, 17) |
| RBAC: SALES cannot edit config/territories, cannot view all daily reports | 5, 10, 18, 19 |
| Money as paise, en-IN formatting | 1 (`money.ts`), used throughout |

Deferred to later milestones (correctly out of scope here, each noted in PONYTAIL-DEBT): territory exclusivity conflict check (needs distributors table, M2), lead→distributor conversion (M2), quotations/pricing (M2), full Command Center + notifications + cron (M3), CSV import/export (M3), audit-log-derived funnel counts (M3+).

**2. Placeholder scan:** No "TBD/TODO/handle edge cases" left as instructions. Tasks 13, 18, 21 describe some UI in prose but always with the exact service calls, props, and field lists named; the TDD steps carry runnable test code. Every domain/service task has complete implementation code.

**3. Type consistency check:**
- `LeadStage` — defined in `src/domain/pipeline.ts` (Task 8), imported by config (6), lead service (12/13), followup (16), board (15). Task 6 notes the stub-first ordering if 6 runs before 8.
- `AppUser` — `src/server/auth/session.ts` (Task 4); `Role` added there in Task 5; used by every service.
- `ScoreWeights` / `scoreDistributor` — Task 9; consumed by lead `rescoreLead` (12) and Settings (19) with matching shape (9 keys, sum 100).
- `getConfig`/`setConfig` generic signature — Task 6; call sites in 12, 13, 16, 19 use declared keys (`scoreWeights`, `stageProbability`, `hotLeadProbabilityThreshold`).
- `writeAudit(user, entityType, entityId, action, old, new)` — Task 10; same signature used in 12, 13, 19.
- `getFollowUpBuckets` return shape (`overdue/today/next7/noAction/hotNoAction`) — Task 16; consumed unchanged in 17 (`getTodayView`) and 21 (dashboard).
- `addActivity(user, ActivityInput)` — Task 14; called by `setStage` refactor (14) and Today/lead actions.

No mismatches found.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-31-super-stockist-milestone-1-field-crm.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
