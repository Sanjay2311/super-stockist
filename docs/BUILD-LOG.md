# Build Log

One entry per completed task: what shipped, files touched, tests run + result, shortcuts.

## 2026-08-31 — Task 1: Project scaffold
- Next.js 15 App Router + Tailwind v4 + TS scaffolded; deps installed.
- Cloudflare (OpenNext) config (`open-next.config.ts`, `wrangler.toml`,
  `initOpenNextCloudflareForDev()` in `next.config.ts`), `/api/health` route,
  dashboard placeholder at `src/app/(app)/page.tsx`, `src/domain/money.ts`
  (`rupees`, `formatINR`).
- Tooling: `vitest.config.ts`, `playwright.config.ts`, `.env.example`, docs skeletons.
- Tests: `npm test` -> 2 passed. `npx tsc --noEmit` clean. `npm run lint` clean.
- Deviations: `create-next-app@latest` now ships Next 16; pinned to `next@^15`
  (15.5.24) + `eslint-config-next@^15` to match the plan's Next 15 stack (OpenNext
  peer range confirms compatibility). Rewrote the generated flat `eslint.config.mjs`
  to the Next 15 FlatCompat form. `shadcn`/`components.json` not added (M1 is
  hand-rolled Tailwind).
- Shortcuts: no CI pipeline yet (see PONYTAIL-DEBT). Transitive `postcss` audit
  advisory inherited from `next@15` build tooling; not fixable without moving to
  Next 16.

## 2026-08-31 — Task 2: DB client + migration runner + test DB helper
- Drizzle (postgres-js) client at `src/server/db/client.ts` (`db`, `DB`), empty
  schema barrel `src/server/db/schema/index.ts`, `drizzle.config.ts`, migration
  runner `src/server/db/migrate.ts` (`runMigrations(url?)` + `tsx` entrypoint),
  test helper `tests/helpers/db.ts` (`testDb`, `migrateTestDb()`, `resetDb()`).
- Env wiring: `dotenv` added as devDependency; `cp .env.example .env.local`;
  `vitest.setup.ts` (`dotenv` -> `.env.local`) registered via `setupFiles` in
  `vitest.config.ts`; `migrate.ts` does `import 'dotenv/config'` and the
  `db:migrate` script sets `DOTENV_CONFIG_PATH=.env.local`. Next.js already
  auto-loads `.env.local` for `npm run dev`.
- TDD: `tests/services/db-connection.test.ts` — RED `npm test -- db-connection`
  = "Cannot find module '../helpers/db'"; GREEN after implementation = 1 passed
  (real `select 1` against Postgres at 127.0.0.1:54322).
- Tests: `npm test` -> 2 files / 3 passed. `npx tsc --noEmit` clean. `npm run
  lint` clean. `npm run dev` boots (health + root -> 200). `npm run db:migrate`
  -> "migrations applied" (no-op). `migrateTestDb()` + `resetDb()` verified
  no-error against the empty schema.
- Deviations: environment has native Postgres (no Docker/Supabase CLI), so
  `DATABASE_URL` == `TEST_DATABASE_URL` = the running native PG; brief's
  `supabase start` prerequisite N/A. `tests/helpers/db.ts` uses
  `String(r.tablename)` instead of the brief's `(r: any)` cast to satisfy the
  `@typescript-eslint/no-explicit-any` lint rule (behaviour identical).
- Shortcuts: hand-written stub `drizzle/meta/_journal.json` so `migrate()` does
  not throw with zero migrations (see PONYTAIL-DEBT; cleared by Task 3).

## 2026-08-31 — Task 3: Identity schema + base seed
- Drizzle schema `src/server/db/schema/identity.ts`: `orgs`, `brands`,
  `employees`, `users` (all `camelCase` exports, snake_case columns, shared
  `created_at`/`updated_at` `timestamptz` defaults). `employees` declared before
  `users` for the `users.employeeId -> employees.id` FK. `users.id` is a `uuid`
  PK with **no default** (mirrors the Supabase auth uid); `users.email` unique
  index (`users_email_idx`). Barrel `schema/index.ts` now `export * from
  './identity'`.
- `src/server/db/seed.ts`: idempotent `seedBase()` — inserts one org
  ("Bangalore East Super Stockist") + one brand ("Farm & Farmers", billingState
  'Rajasthan') only if absent, returns `{ orgId, brandId }`. `tsx` CLI guard
  (`process.argv[1]?.endsWith('seed.ts')`) + `import 'dotenv/config'`.
- `src/server/db/client.ts`: URL now `process.env.VITEST ? (TEST_DATABASE_URL ??
  DATABASE_URL) : DATABASE_URL` with a `ponytail:` comment (see PONYTAIL-DEBT).
- Env plumbing: `drizzle.config.ts` now `config({ path: '.env.local' })` so
  `npm run db:generate` sees `DATABASE_URL` (drizzle-kit auto-loads `.env`
  only). `db:seed` script gets `DOTENV_CONFIG_PATH=.env.local` (mirrors
  `db:migrate`).
- Migration: `npm run db:generate` -> `drizzle/0000_eminent_stingray.sql`
  (4 tables, 4 FKs, 1 unique index) + regenerated `drizzle/meta/*` (clears the
  Task 2 journal-stub debt). `npm run db:migrate` -> "migrations applied".
- TDD: `tests/services/identity-schema.test.ts` — RED `npm test -- identity-schema`
  = "Cannot find package '@/server/db/schema/identity'"; GREEN after
  implementation = 1 passed (seeds one org + one brand, idempotent, billingState
  'Rajasthan').
- Tests: `npm test` -> 3 files / 4 passed. `npx tsc --noEmit` clean. `npm run
  lint` clean. `npm run dev` boots (root + health -> 200). `npm run db:seed`
  run twice -> same ids, one org + one brand row.
- Deviations: also fixed the `db:seed` script env loading (not asked, but the
  CLI guard is in scope for this task and was otherwise dead). No demo data —
  that is Task 19.
- Shortcuts: single VITEST-switched DB client (see PONYTAIL-DEBT).

## 2026-08-31 — Task 4: Supabase auth wiring + session helpers + login page
- `src/server/auth/supabase.ts`: `createServerClient()` — `@supabase/ssr`
  `createServerClient` bound to Next 15 async `cookies()` (getAll/setAll,
  setAll try/catch for Server Component render).
- `src/server/auth/session.ts`: `export type Role = 'OWNER' | 'SALES'`,
  `AppUser` (role uses `Role` — Task 5 depends on this), `getSession()` reads
  `supabase.auth.getUser()`, joins `users` by id, returns `null` when no auth
  user / no row / `status !== 'active'`, else maps to `AppUser`. `requireUser()`
  = `getSession()` or `redirect('/login')` (thin; `ponytail:` note — redirect
  branch covered by the skipped e2e spec).
- `src/middleware.ts`: refreshes the auth cookie (`supabase.auth.getUser()`),
  matcher excludes `_next/static|_next/image|favicon.ico|api/health`. Route gate
  itself is per-layout `requireUser()`, not middleware (see PONYTAIL-DEBT).
- Routes/layouts: `src/app/(auth)/layout.tsx` (centered card),
  `src/app/(auth)/login/page.tsx` (`'use client'` + `useActionState`),
  `src/app/(auth)/login/actions.ts` (`signIn`/`signOut` Server Actions),
  `src/app/(app)/layout.tsx` (`await requireUser()` gate).
- `scripts/create-user.ts`: `tsx scripts/create-user.ts <email> <password>
  <name> <OWNER|SALES>` — service-role `auth.admin.createUser` + `users` insert
  under the seeded org. Written per brief; NOT runnable in this env (no Supabase
  admin API) — run with `DOTENV_CONFIG_PATH=.env.local` once `supabase start`
  is up.
- Tests:
  - `tests/services/session.test.ts` (NEW, the real gate) — `vi.mock`s
    `@/server/auth/supabase` so only `getSession()`'s DB-join + status-gate +
    mapping logic runs, against native Postgres (`127.0.0.1:54322`) via
    `seedBase()` + a real `users` insert. 4 cases: active OWNER → mapped
    `AppUser`; no auth user → `null`; no `users` row → `null`; `status`
    `disabled` → `null`. RED verified by deleting the status guard (the
    "not active" case fails); GREEN = 4 passed.
  - `tests/e2e/auth.spec.ts` written verbatim from the brief but wrapped in
    `test.describe.skip` (+ `ponytail:` comment) — no local Supabase auth
    server, so it cannot run here.
  - `npm test` → 4 files / 8 passed (money 2 + db-connection 1 +
    identity-schema 1 + session 4). `npm run lint` clean. `npx tsc --noEmit`
    clean. `npm run dev` boots: `/login` → 200 with the form, `/` → 307
    redirect to `/login` (gate works), no server errors.
- Deviations: (1) e2e specs skipped — no Docker/Supabase CLI in this env
  (PONYTAIL-DEBT row + report). (2) `.env.local` `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  / `SUPABASE_SERVICE_ROLE_KEY` were empty, which makes `@supabase/supabase-js`
  throw at construction and 500s every route incl. the static `/login`; set
  both to `local-dev-placeholder-no-supabase-running` (gitignored file only,
  `.env.example` untouched) so the login form renders as the task asks to
  verify. (3) `scripts/create-user.ts` gets `import 'dotenv/config'` (like
  `seed.ts` / `migrate.ts`) + a usage comment; run it with
  `DOTENV_CONFIG_PATH=.env.local`. (4) `requireUser()` `ponytail:` note instead
  of a forced-mock redirect test.
- Shortcuts: e2e skipped; per-layout gate not middleware; `requireUser()`
  redirect branch untested (all in PONYTAIL-DEBT).

## 2026-08-31 — Task 8: Pipeline domain (`src/domain/pipeline.ts`)
- `src/domain/pipeline.ts`: `type LeadStage` (14-value union: IDENTIFIED through
  ON_HOLD), `STAGES` array (canonical order 0..13), `OPEN_STAGES` (excludes LOST,
  REPEAT_ORDER, ON_HOLD = 11 stages), `stageRank(stage): number` (index in STAGES),
  `weightedPipelineValue(potential, pct): Paise` (round(potential * pct / 100)),
  `FUNNEL_STEPS` array (10 dashboard funnel steps), `funnelConversion(leads)` (filters
  out LOST/ON_HOLD, counts active leads by stage progression, calculates stage-to-stage
  conversion %).
- TDD: `tests/domain/pipeline.test.ts` — RED (module not found); GREEN after
  implementation = 4 passed (14 stages check, OPEN_STAGES exclusions, weightedPipelineValue
  rounding, funnel fixture with 5 leads [IDENTIFIED, CONTACTED, QUALIFIED, APPOINTED, LOST]
  → 4 active, correct stage progression counts, correct conversion % between stages).
- Fixture analysis: With [IDENTIFIED, CONTACTED, QUALIFIED, APPOINTED, LOST] and LOST
  filtered: active leads = 4. Funnel counts: identified=4, contacted=3, qualified=2,
  meeting=1, commercial=1, negotiation=1, appointed=1, firstOrder=0, activated=0,
  repeatOrder=0. Conversions: identified=null, contacted≈75%, qualified≈66.67%,
  meeting=50%, commercial=100%, negotiation=100%, appointed=100%, firstOrder=0%,
  activated=0%, repeatOrder=0% (prev-count-based).
- Tests: `npm test -- pipeline` -> 1 file / 4 passed. `npm test` -> 6 files / 15 passed.
  `npx tsc --noEmit` clean. `npm run lint` clean.
- Deviations: none.
- Shortcuts: none.

## 2026-08-31 — Task 9: Distributor score domain (`src/domain/scoring.ts`)
- `src/domain/scoring.ts`: `type ScoreKey` (9-value union: retailerNetwork, categoryExperience,
  geoCoverage, salesmen, deliveryInfra, workingCapital, brandPortfolio, reputation, willingness),
  `ScoreInputs` / `ScoreWeights` record types, `Grade` type ('A' | 'B' | 'C' | 'REJECT'),
  `KEYS` array (canonical order), `clamp01(n)` (bounds to [0,1]), `assertWeightsValid(weights)`
  (throws if sum ≠ 100 ±0.001), `grade(score)` (A≥80, B≥65, C≥50, else REJECT),
  `scoreDistributor(inputs, weights)` (returns {score, grade} where score = round(Σ clamp01(inputs[k]) * weights[k])).
- TDD: `tests/domain/scoring.test.ts` — RED (module not found); GREEN after implementation = 4 passed
  (perfect 100/A score, missing/clamped inputs, grade thresholds B→70%, weight validation).
- Tests: `npm test -- scoring` -> 1 file / 4 passed. `npm test` -> 7 files / 19 passed.
  `npx tsc --noEmit` clean. `npm run lint` clean (eslint-disable-next-line on `as any` test casts).
- Deviations: none.
- Shortcuts: none.

## 2026-08-31 — Task 6: app_config schema + typed config service

- `src/server/db/schema/config.ts`: `appConfig` table (`app_config`) — `orgId` uuid,
  `key` text, `value` jsonb, `updatedAt` timestamptz default now(); composite PK
  `(orgId, key)`. No FK on `orgId` (per brief — keeps config table free of table-ordering
  concerns). Added `export * from './config';` to `schema/index.ts` barrel.
- `src/server/services/config.ts`: `CONFIG_DEFAULTS` (M1 keys: `scoreWeights` 9 weights
  summing to 100, `stageProbability` — all 14 LeadStage values IDENTIFIED..ON_HOLD,
  `hotLeadProbabilityThreshold: 60`, `staleQuotationDays: 5`, `reorderCadenceDays: 21`),
  `ConfigShape`/`ConfigKey` types, `getConfig<K>(orgId, key)` (stored `value` or default,
  nullish-coalesced so a stored `0` wins), `setConfig<K>(orgId, key, value)` (insert +
  `onConflictDoUpdate` on the composite PK, bumps `updatedAt`).
- `import type { LeadStage } from '@/domain/pipeline'` — pipeline.ts already has the full
  14-value union (Task 8 ran first), no stub needed.
- Migration: `npm run db:generate` → `drizzle/0001_third_hawkeye.sql` (CREATE TABLE
  app_config + composite PK constraint); `npm run db:migrate` → applied clean.
- TDD: `tests/services/config.test.ts` — RED (`Cannot find package '@/server/services/config'`);
  GREEN after implementation = 2 passed (default-when-unset for `scoreWeights` +
  `hotLeadProbabilityThreshold`; persist/read-back an override).
- Tests: `npm test -- config` → 1 file / 2 passed. `npm test` → 8 files / 21 passed.
  `npx tsc --noEmit` clean. `npm run lint` clean.
- Deviation: brief's verbatim `CONFIG_DEFAULTS ... } as const` does not typecheck against
  the brief's verbatim test — the override `{ ...scoreWeights, reputation: 10, willingness: 0 }`
  is not assignable when `as const` pins `reputation` to literal `5`. Replaced `as const`
  with a `satisfies { ... stageProbability: Record<LeadStage, number> ... }` clause: runtime
  object is identical, weight/threshold values are `number`-typed (override-friendly) instead
  of literal-typed. The `satisfies` clause is now the sole check that `stageProbability` has
  all 14 LeadStage keys — drop any key → `tsc` error `TS2741: Property '<X>' is missing`
  (verified both directions). An earlier draft also had an inner
  `as Record<LeadStage, number>` cast on the object literal; that laundered the type before
  `satisfies` saw it, making the completeness check a no-op — removed in the review fix.
- Shortcuts: none.

## 2026-08-31 — Task 7: App shell — role-aware sidebar + mobile bottom nav

- `src/components/app-nav.tsx` (`'use client'`): `NAV_ITEMS` (Dashboard, Today,
  Pipeline, Leads, Territories, Daily Report, Reports [ownerOnly], Settings
  [ownerOnly]); exported pure `visibleNavItems(role)` =
  `NAV_ITEMS.filter(i => !i.ownerOnly || role === 'OWNER')`. `AppNav` renders a
  desktop `<aside>` (`hidden md:flex`, all visible items, `usePathname` active
  styling + `aria-current="page"`) and a mobile `<nav>` (`fixed bottom-0 md:hidden`,
  first 5 items).
- `src/app/(app)/layout.tsx` replaced: `const user = await requireUser()`, mounts
  `<AppNav user={user} />`, header shows `{user.name} · {user.role}` + a
  `<form action={signOut}>` Sign out button, `{children}` wrapper carries
  `pb-16 md:pb-0` for the mobile bar.
- 7 placeholder pages added under `src/app/(app)/`: `leads`, `pipeline`,
  `territories`, `today`, `daily-report`, `reports/daily`, `settings` — each a
  one-line `<main><h1>` per brief. `page.tsx` (dashboard) left as-is.
- e2e: `tests/e2e/nav.spec.ts` written per brief but `test.describe.skip('nav', ...)`
  — needs `supabase start` + seeded owner/sales users (no Docker/Supabase here).
  `login()` helper params typed (`Page`, `string`) so `tsc` stays clean. Tracked
  in PONYTAIL-DEBT.
- Real gate: `tests/domain/nav.test.ts` (Vitest, pure, no DOM) — RED (`Cannot find
  package '@/components/app-nav'`) → GREEN = 3 passed (OWNER sees Settings+Reports;
  SALES sees Pipeline/Leads/Today, not Settings/Reports; SALES ⊊ OWNER).
- Tests: `npm test -- nav` → 1 file / 3 passed. `npm test` full → 9 files / 24 tests;
  green on a clean run, but `tests/services/*` (DB) intermittently fail under
  vitest file-parallelism against the single shared local Postgres (pre-existing —
  present on the Task 6 base commit; "no per-test DB isolation" row in
  PONYTAIL-DEBT). `nav.test.ts` + all non-DB suites pass every run. Isolated
  `npm test -- identity-schema` etc. pass.
- `npx tsc --noEmit` clean. `npm run lint` clean. `npm run dev` boots; `/` compiles
  (860 modules, no errors) and 307-redirects to `/login` (unauthenticated, as
  expected — cannot log in without Supabase); `/login` 200.
- Deviations: brief's inline `NAV_ITEMS.filter(...)` moved into the exported
  `visibleNavItems()` helper (per task instructions, for the Vitest gate). Added
  `aria-current="page"` on active links (accessibility, not in brief). e2e helper
  params typed vs. brief's untyped (tsc cleanliness). No `@testing-library` render
  test (ponytail-preferred: pure helper suffices).
- Shortcuts: e2e nav spec skipped (see PONYTAIL-DEBT).

## 2026-08-31 — Task 10: Territory schema + hierarchy service + territories screen

- Schema: `src/server/db/schema/territory.ts` — `territories` { id, orgId, name,
  type (text), parentId (plain uuid, no self-FK), estimatedMarketPotential (bigint
  paise, default 0), estimatedDistributorCount (int, default 0), active (bool,
  default true), deletedAt (nullable), createdAt/updatedAt } and
  `territory_assignments` { id, orgId, territoryId → territories.id, employeeId,
  fromDate, toDate (nullable), createdAt }. Added to `schema/index.ts` barrel.
- Audit scaffolding (Task 12 will expand): `src/server/db/schema/audit.ts` —
  `audit_log` { id, orgId, userId (text — see deviation), entityType, entityId
  (text), action, oldValues/newValues (jsonb), createdAt }; `src/server/services/
  audit.ts` — `writeAudit(user, entityType, entityId, action, oldValues,
  newValues)` inserts one row. Barrel updated.
- `src/lib/schemas.ts` (new): `TERRITORY_TYPES` (`['ZONE','AREA','NEIGHBORHOOD',
  'PINCODE'] as const`), `territorySchema` (zod v4), `type TerritoryInput`.
- Service `src/server/services/territory.ts`: `TerritoryRow`/`TerritoryNode` types,
  `listTerritories` (active, not deleted, name asc), `territoryTree` (nest by
  parentId, in-memory), `descendantIds`/`ancestorIds` (walk parentId in memory),
  `createTerritory` (assertCan 'territory.edit' → zod parse → insert → writeAudit),
  `updateTerritory` (assertCan → load before → partial parse → update → writeAudit),
  `overlapsExclusive` STUB → `false` (ponytail comment + PONYTAIL-DEBT row).
- Screen: `src/app/(app)/territories/page.tsx` replaces the placeholder — server
  component, `Promise.all([territoryTree, listTerritories])`, recursive `<Tree>`
  render, add-form gated by `can(user,'territory.edit')`. `actions.ts` —
  `addTerritory` server action (`requireUser` → `createTerritory` →
  `revalidatePath`).
- Migration: `drizzle/0002_fat_vermin.sql` — `db:generate` + `db:migrate` clean
  (regenerated once after the userId text change; old 0002 artifacts + local tables
  dropped and rebuilt so the committed migration is the only one).
- TDD: `tests/services/territory.test.ts` — RED (`Cannot find package
  '@/server/services/territory'`) → after impl, one more RED (`invalid input syntax
  for type uuid: "o"` from `audit_log.user_id` uuid vs the test's `id:'o'` fixture)
  → fixed by making `user_id` a text column → GREEN = 2 passed (ZONE→AREA hierarchy
  + list alpha order + nested tree + descendantIds; SALES `createTerritory` throws
  'forbidden').
- Tests: `npm test -- territory` → 1 file / 2 passed. Full `npm test` → 10 files /
  26 passed, run twice, stable. `npx tsc --noEmit` clean. `npm run lint` clean
  (eslint-disable on the `overlapsExclusive` stub's intentionally-unused params).
  `npm run dev` boots; `/` and `/territories` compile with no errors and
  307-redirect to `/login` (unauthenticated, expected — no Supabase locally).
- Deviations: (1) `audit_log.user_id` is `text`, not `uuid` as the brief's Step 5
  snippet had it — `AppUser.id` is a Supabase auth uid (uuid in prod) but test
  fixtures and future system actors are not uuids; `entity_id` is already text, so
  text `user_id` is consistent and keeps `writeAudit` boundary-safe. (2) Empty-tree
  fallback text added to the screen (`No territories yet.`) so the fresh page is not
  a blank box.
- Shortcuts: `overlapsExclusive` stub (PONYTAIL-DEBT, cleared in Milestone 2).

## 2026-08-31 — Task 11: CRM schema (leads, activities, tasks, daily reports) + zod schemas
- `src/server/db/schema/crm.ts` (new): four `pgTable` defs per spec §4.3 column lists —
  `distributor_leads` (38 cols; defaults `stage='IDENTIFIED'`, `probability=5`,
  `grade='REJECT'`, `score=0`, `expected_ff_monthly_potential=0`,
  `delivery_vehicles/salesmen/retailer_network=0`, `score_inputs='{}'::jsonb`,
  `is_demo=false`; `deleted_at` + `created_at`/`updated_at`), `activities` (14 cols,
  immutable — `created_at`/`deleted_at` only, no `updated_at`), `tasks` (17 cols,
  `priority='NORMAL'`, `status='PENDING'`, `source='MANUAL'`; soft-delete),
  `employee_daily_reports` (9 cols, `areas_visited='[]'::jsonb`,
  `uniqueIndex('emp_daily_report_uk').on(orgId, employeeId, reportDate)`, no
  `updated_at`/`deleted_at`). All paise columns `bigint(..., { mode: 'number' })`.
  Added `export * from './crm'` to the `schema/index.ts` barrel.
- `src/lib/schemas.ts` (append — territory exports untouched): `ACTIVITY_TYPES`,
  `TASK_TYPES`, `TASK_PRIORITIES`, `TASK_STATUSES`, `LOST_REASONS`,
  `WORKING_CAPITAL_LEVELS` (`as const`); `leadSchema`+`LeadInput`,
  `scoreInputsSchema`, `activitySchema`+`ActivityInput` (`.refine` lead-or-distributor),
  `taskSchema`+`TaskInput`, `dailyReportSchema`+`DailyReportInput`. zod v3→v4:
  `z.string().uuid()` → `z.uuid()`, `z.string().email()` → `z.email()`; everything
  else in the brief snippet (`.coerce`, `.or(z.literal(''))`, `.partial()`,
  `.refine()`, `z.enum(<const array>)`) is unchanged in v4.
- Migration `drizzle/0003_shiny_pride.sql`: `db:generate` emitted the 4 tables +
  the unique index. Hand-appended one statement drizzle-kit does not emit:
  `ALTER TABLE "activities" ADD CONSTRAINT "activities_target_ck" CHECK ("lead_id"
  IS NOT NULL OR "distributor_id" IS NOT NULL);` (preceded by a
  `--> statement-breakpoint`). `db:migrate` clean; `pg_get_constraintdef` confirms
  the CHECK is live. `// ponytail:` note in `crm.ts` + PONYTAIL-DEBT row.
- TDD: `tests/services/crm-schema.test.ts` — RED (`Cannot find package
  '@/server/db/schema/crm'`) → after schema + migration, GREEN = 2 passed
  (lead insert defaults stage/probability/grade/potential; second daily-report
  insert for same `(orgId, employeeId, reportDate)` rejects on the unique index).
- Tests: `npm test -- crm-schema` → 1 file / 2 passed. Full `npm test` → 11 files /
  28 passed, run twice, stable. `npx tsc --noEmit` clean. `npm run lint` clean.
  `npm run dev` boots, compiles `/` + `/middleware` with no errors, 307 → `/login`
  (unauthenticated, expected — no Supabase locally).
- Deviations: `business_name`/`contact_person`/`phone` are `NOT NULL` (trust-boundary
  integrity; matches `employees` style and the test's always-provided values); the
  brief's column list did not annotate them either way. `occurred_at` / `submitted_at`
  are `NOT NULL` with no DB default (callers set them; `activitySchema` defaults
  `occurredAt` in app code).
- Shortcuts: hand-edited migration for the `activities` CHECK (PONYTAIL-DEBT).

## 2026-08-31 — Task 12: Lead service (create/update/rescore/list) + Leads screen
- `src/server/services/lead.ts` (new): `LeadRow` (`$inferSelect`); local `LeadInput =
  z.input<typeof leadSchema>` so callers pass raw form values (the `@/lib/schemas`
  `LeadInput` alias is `z.infer`/output, which forces every `.default()` field on
  callers — not what an insert helper wants). `clean<T>()` nulls empty-string
  optionals. `createLead` — `assertCan('lead.create')`, `leadSchema.parse`,
  SALES caller with blank assignee defaults to `user.employeeId` (OWNER → null),
  audited `create`. `updateLead` — `assertCan('lead.update')`, org-scoped load-or-404,
  `leadSchema.partial().parse`, `updatedAt` bumped, audited `update` before/after.
  `rescoreLead` — `assertCan('lead.update')`, `scoreInputsSchema.parse`,
  `getConfig(orgId,'scoreWeights')` → `assertWeightsValid` → `scoreDistributor`,
  persists `scoreInputs`+`score`+`grade`, audited `rescore` (score/grade before→after).
  `listLeads(orgId, opts)` — `deletedAt IS NULL`, optional `stage`/`assignedEmployeeId`,
  `q` ILIKE over businessName/contactPerson/phone, `updatedAt desc`, default limit 50.
  `getLead(orgId,id)` → row | null.
- `src/components/grade-badge.tsx`, `src/components/stage-badge.tsx` (new): per brief,
  hand-rolled Tailwind spans (grade colour map; stage Title-Cased).
- `src/app/(app)/leads/actions.ts` (new): `'use server'` `createLeadAction(formData)` —
  `requireUser`, `createLead`, `redirect('/leads/{id}')`.
- `src/app/(app)/leads/page.tsx` (replace placeholder): server component — search
  form (`GET /leads?q=`), `<details>` create form → `createLeadAction`, results table
  (business/stage/grade/potential/next-follow-up) with empty state.
- `src/app/(app)/leads/[id]/page.tsx` (new, my call per brief note 6): minimal
  placeholder — `getLead` + `notFound()`, renders `businessName` so the create
  redirect resolves. Task 13 replaces it with the real detail screen.
- TDD: `tests/services/lead.test.ts` — RED (`Cannot find package
  '@/server/services/lead'`) → GREEN 5 passed (SALES create defaults assignee +
  stage IDENTIFIED; bad phone rejected; rescore all-1s w/ default weights → score
  100 / grade A; list `q:'beta'` → ['Beta Mart'] and `stage:'CONTACTED'` → 0;
  `can(sales,'lead.delete') === false`).
- Tests: `npm test -- services/lead` → 1 file / 5 passed. Full `npm test` → 12 files /
  33 passed, run twice, stable. `npx tsc --noEmit` clean. `npm run lint` clean.
  `npm run dev` boots; `/leads` compiles (410ms), 307 → `/login` (unauthenticated,
  expected — no local Supabase).
- Deviations: (1) the brief's Step 1 test used 1-char `contactPerson` values
  (`'A'`/`'B'`/`'Y'`) that fail Task 11's shipped `leadSchema` (`.min(2)`); changed to
  `'Anil'`/`'Amit'`/`'Bala'`/`'Yash'` — no schema change. (2) dropped the brief's
  `as any` on the bad-phone case — the looser `z.input` `LeadInput` accepts the
  3-field object and the rejection still fires in `leadSchema.parse` on the phone
  regex. (3) exported a local `LeadInput` from `lead.ts` instead of importing the
  output-typed alias from `@/lib/schemas` (no schema file touched).
- Shortcuts: none with a ceiling — no new PONYTAIL-DEBT.

## 2026-09-01 — Task 13: Lead detail — fields, score panel, stage change

- Shipped `setStage(user, id, stage, opts?)` in `src/server/services/lead.ts`:
  `assertCan('lead.setStage')`; throws `Error('lostReason required')` when
  `stage === 'LOST'` and no `lostReason`; org-scoped load-or-404 for the
  before-image; `probability = opts.probability ?? getConfig(orgId,'stageProbability')[stage]`;
  updates `stage`/`probability` and sets `lostReason`/`lostNotes` only for LOST,
  `onHoldReason` only for ON_HOLD (else null); inserts a timeline `activities` row
  inline (`type: 'OTHER'`, `outcome: 'Stage: <from> → <to>'`); audited `setStage`
  with `{stage,probability}` before→after.
- `src/app/(app)/leads/[id]/actions.ts` (new): `'use server'` — `saveLeadFields(id, fd)`
  (calls `updateLead`; converts the ₹ form value to integer paise with
  `rupees(Number(fd.get('expectedFfMonthlyPotential') ?? 0))`), `saveScore(id, fd)`
  (reads the 9 score keys as `Number(fd.get(k) ?? 0)` → `rescoreLead`),
  `changeStage(id, fd)` (`setStage` with `lostReason`/`lostNotes` or undefined).
  Each `revalidatePath('/leads/{id}')`.
- `src/app/(app)/leads/[id]/stage-form.tsx` (new): `'use client'` — stage `<select>`
  over `STAGES`, conditional `LOST_REASONS` select (`required`) + notes textarea
  shown only when the selected stage is `LOST`; `StageBadge` + probability header.
- `src/app/(app)/leads/[id]/page.tsx` (replace Task 12 placeholder): server component,
  `requireUser()` + `getLead(user.orgId, id)` + `notFound()`. Three cards — Fields
  (edit form, monthly potential pre-filled `expectedFfMonthlyPotential / 100`),
  Qualification score (9 range inputs 0–1 step 0.1 defaulted from `lead.scoreInputs`,
  shows `lead.score` + `<GradeBadge>`), Stage (`<StageForm>`). Actions bound via
  `.bind(null, id)`. `<section id="timeline">` placeholder — Task 14 fills it.
- TDD: `tests/services/lead-stage.test.ts` — written first, RED (`setStage` not
  exported), then GREEN 2/2: (1) `setStage(…, 'NEGOTIATION')` → `stage NEGOTIATION`,
  `probability 60` (config default); (2) `setStage(…, 'LOST')` rejects
  `'lostReason required'`, then with `{lostReason:'PRICE', lostNotes:'too high'}`
  → `stage LOST`, `probability 0`, `lostReason PRICE`, `lostNotes 'too high'`.
- Tests: `npm test -- lead-stage` → 1 file / 2 passed. Full `npm test` → 13 files /
  35 passed, run twice, stable. `npx tsc --noEmit` clean. `npm run lint` clean.
  `npm run dev` (already running from this worktree, dev-login hatch): `/leads/<id>`
  renders 200 with all three cards — 9 `type="range"` inputs, 14 stage `<option>`s,
  all 9 score-key names, grade badge, timeline placeholder.
- Deviations: (1) brief estimated "14 test files"; repo has 13 (`lead-stage` is one
  of them) — 35 tests, all green. (2) Score-key labels + list live inline in
  `page.tsx` (the `SCORE_KEYS` const in `actions.ts` is inside a `'use server'`
  module and can't be imported by a component; `@/domain/scoring` doesn't export
  its `KEYS`). (3) Could not exercise the server-action mutations via `curl` — Next's
  React-flight multipart wire format isn't reproducible by hand; the render is
  verified and `setStage`/`updateLead`/`rescoreLead` are covered by passing vitest.
- Shortcut: the timeline `activities` insert in `setStage` duplicates Task 14's
  `addActivity` — `ponytail:` comment in place, new PONYTAIL-DEBT row, cleared by Task 14.

## 2026-09-01 — Task 14: Activity service + lead timeline

- Shipped `src/server/services/activity.ts`: `ActivityRow` (`activities.$inferSelect`),
  `ActivityInput` (`z.input<typeof activitySchema>` — mirrors the `lead.ts` pattern so
  callers need not pass `occurredAt`). `addActivity(user, input)`:
  `assertCan('activity.create')`, `activitySchema.parse` (its `.refine` rejects when
  neither `leadId` nor `distributorId` is set), inserts one org-scoped row
  (`employeeId = user.employeeId`, empty strings → null); **if `leadId` && `nextFollowUpAt`,
  also `db.update(distributorLeads).set({ nextFollowUpAt, updatedAt })`** — the lead row
  is the single source of truth for the next follow-up (spec §4.3). `listActivities(orgId, leadId)`:
  not-deleted, `occurredAt desc`. No update/delete — activities are immutable.
- `src/server/services/lead.ts`: `setStage` now records the pipeline-move row via
  `await addActivity(user, { leadId: id, type: 'OTHER', outcome: 'Stage: <from> → <to>' })`;
  removed the inline `db.insert(activities)` and the now-unused `activities` import.
  Clears the Task 13 ponytail-debt row.
- `src/app/(app)/leads/[id]/actions.ts`: added `logActivity(id, fd)` — `requireUser`,
  builds the `ActivityInput` (`type` from the `type` field, `notes`/`outcome`/`nextAction`
  strings, `nextFollowUpAt` from a `type="date"` input → `new Date(...)` or null), calls
  `addActivity`, `revalidatePath('/leads/{id}')`. Also hardened `changeStage` (carried
  from Task 13 review): rejects `'invalid stage'` if the string is not in `STAGES`, and
  `'invalid lostReason'` if a present `lostReason` is not in `LOST_REASONS`.
- `src/app/(app)/leads/[id]/page.tsx`: `#timeline` section filled — an add-activity
  `<form action={logActivity.bind(null, id)}>` (type `<select>` over `ACTIVITY_TYPES`,
  notes `<textarea>`, outcome + next-action inputs, `nextFollowUpAt` date input, submit)
  and an `<ol>` of `listActivities(user.orgId, id)` rows showing
  `occurredAt.toLocaleString('en-IN')` · type, then notes / outcome / "next: …" /
  "follow-up <date>" when present; "No activity yet." when empty.
- TDD: `tests/services/activity.test.ts` — written first, RED (module not found), then
  GREEN 2/2: (1) `addActivity(owner, { leadId, type:'CALL', notes, nextFollowUpAt: due })`
  → `distributor_leads.next_follow_up_at === due` AND `listActivities` length 1;
  (2) `addActivity(owner, { type:'CALL' })` rejects (no lead/distributor).
- Tests: `npm test -- lead-stage services/activity` → 2 files / 4 passed. Full `npm test`
  → 14 files / 37 passed, run twice, stable. `npx tsc --noEmit` clean. `npm run lint` clean.
  Dev (`next dev` already running, dev-login hatch): drove `addActivity` against the dev DB
  for a lead, then confirmed `/leads/<id>` renders the timeline row
  (`1/9/2026, 8:57:28 am · CALL` / notes / outcome / `next: …` / `follow-up 15/9/2026`)
  and `/leads` shows `15/9/2026` in the Next-follow-up column; cleaned the row after.
- Deviations: (1) the brief's Step-1 test snippet used `contactPerson: 'C'`, which fails
  `leadSchema` `min(2)` at `createLead` — changed to `'Chandan'`. (2) dropped the `as any`
  on the second test's input (lint `no-explicit-any`); `{ type: 'CALL' }` is already
  assignable to `ActivityInput` since `leadId`/`distributorId` are optional, and the
  `.refine` still rejects it at runtime. (3) `ActivityInput` is defined in `activity.ts`
  as `z.input<...>` rather than imported from `schemas.ts` (where it is `z.infer`, the
  output type with a required `occurredAt`) — same split the repo already uses for
  `LeadInput`. (4) Server-action POSTs still not exercisable by `curl` (Next flight wire
  format); covered by vitest + the direct-service dev check above.
- No new ponytail debt.

## 2026-09-01 — Task 15: Pipeline Kanban board — drag-to-restage + weighted column totals

- `src/server/services/lead.ts`: new `boardLeads(orgId): Promise<BoardLead[]>` — the read
  model for the board. `distributorLeads` LEFT JOIN `territories` LEFT JOIN `employees`,
  select `id, businessName, territoryName, expectedFfMonthlyPotential, score, grade,
  probability, stage, nextFollowUpAt, assignee`, filtered `orgId` + `deletedAt IS NULL`;
  serializes `nextFollowUpAt` to an ISO string (or null) so the row crosses the RSC →
  client boundary as-is. New exported `type BoardLead`. **R3 compliance:** the join lives
  in the service, NOT in `pipeline/page.tsx` — the page has no `db` import.
- `src/app/(app)/pipeline/page.tsx` (replaces placeholder): server component — `requireUser()`,
  `boardLeads(user.orgId)`, renders `<Board stages={OPEN} leads={leads} />` where
  `OPEN = STAGES.filter(s => s !== 'LOST' && s !== 'ON_HOLD')` (12 columns). Deliberately
  NOT `OPEN_STAGES` from `domain/pipeline.ts` (that also drops `REPEAT_ORDER`).
- `src/app/(app)/pipeline/actions.ts`: `'use server'` `moveLeadAction(leadId, stage)` —
  `requireUser()`; `stage === 'LOST' || 'ON_HOLD'` → `{ error: 'open-detail' as const }`
  (board has no such column, those need a reason); else
  `try { setStage(user, leadId, stage); revalidatePath('/pipeline'); return { ok: true } }
  catch (e) { return { error: e.message } }`.
- `src/app/(app)/pipeline/board.tsx`: `'use client'`. `Board` = `@dnd-kit/core` `DndContext`
  (with a `PointerSensor` distance-4 activation constraint so a plain click still opens the
  card's `<Link>`), one `Column` (`useDroppable`, keyed by stage id) per stage, `Card`
  (`useDraggable`, keyed by lead id). Column header: `count · formatINR(Σ
  weightedPipelineValue(potential, probability))`. Card: business name → `/leads/{id}`,
  territory, potential, `score · grade`, `probability%`, follow-up date (red when null or
  past), assignee. `onDragEnd`: no-op if same column; else optimistic `setItems` + await
  `moveLeadAction`; on `{ error }` revert, and if `error === 'open-detail'`
  `router.push('/leads/{id}')`. `BoardLead` has ONE definition (in `lead.ts`);
  `board.tsx` does `import type` + `export type { BoardLead }`.
- `tests/e2e/lead-pipeline.spec.ts`: written per brief, wrapped `test.describe.skip('lead
  pipeline', …)` + `// ponytail:` note — no local Supabase Auth server in this env (same
  reason auth/nav specs are skipped). Real gate is the Vitest spec below.
- TDD: `tests/services/pipeline.test.ts` — RED first (`Cannot find package
  '@/app/(app)/pipeline/actions'`), then GREEN 3/3: (1) `boardLeads` returns two leads with
  joined `territoryName='North Zone'` / `assignee='Priya Rao'`, moved lead's
  `stage='NEGOTIATION'` + `probability=60`, unmoved lead's joins `null` +
  `stage='IDENTIFIED'`; (2) `boardLeads` excludes a soft-deleted lead; (3) `moveLeadAction`
  with `stage='LOST'` (mocked `requireUser`) returns `{ error: 'open-detail' }` and leaves
  `getLead(...).stage === 'IDENTIFIED'`.
- Tests: `npm test -- pipeline` → 2 files / 7 passed (incl. `tests/domain/pipeline.test.ts`).
  Full `npm test` → 15 files / 40 passed, run twice, stable. `npx tsc --noEmit` clean.
  `npm run lint` clean.
- Dev check (`next dev` already on :3000, dev-login hatch): `/pipeline` renders 12 columns,
  the 6 dev leads land in their stages (IDENTIFIED/CONTACTED/QUALIFIED/MEETING_SCHEDULED/
  PRESENTATION_DONE/NEGOTIATION), weighted header totals correct (e.g. NEGOTIATION
  `1 · ₹2,70,000.00` = 4,50,000 × 60%). Drag gesture itself needs a browser driver (not
  available for the auth-gated page — same gap the skipped e2e covers); drove the data
  chain instead: `setStage` (what `moveLeadAction` calls) IDENTIFIED→CONTACTED, a fresh
  `boardLeads` read ("after reload") showed `CONTACTED`/prob 10, then restored to
  `IDENTIFIED`/prob 5.
- Deviations: (1) `boardLeads` serializes `nextFollowUpAt` inside the service (so the
  `Promise<BoardLead[]>` signature is honest) rather than the page mapping rows — the page
  is a pass-through. (2) `page.tsx` uses a local `OPEN` (STAGES minus LOST/ON_HOLD) not the
  existing `OPEN_STAGES` export, per the task's explicit column list.
- Ponytail debt: extended the e2e-skip row (adds `lead-pipeline.spec.ts`); +2 rows —
  deferred inline lost-reason modal (board routes LOST/ON_HOLD to the detail page), and
  `Board`'s `useState(leads)` not reconciling with revalidated props until a full reload.

## 2026-09-01 — Task 16: Follow-up domain (buckets, hot-lead, needs-next-action) + follow-up service
- `src/domain/followup.ts` (pure, only imports `./pipeline`): `type FollowUpBucket =
  'OVERDUE' | 'TODAY' | 'UPCOMING' | 'NONE'`; `classifyFollowUp(nextFollowUpAt, now)` —
  IST-day comparison via `IST_OFFSET_MIN = 330` + `istParts(d)` (shift then read UTC
  y/m/day) + `y*10000+m*100+day` key: `NONE` if null, `OVERDUE` if key < today, `TODAY` if
  equal, else `UPCOMING`; `isHotLead({grade,probability,stage,hotThreshold})` — `false` if
  stage ∉ `OPEN_STAGES`, else `grade === 'A' || probability >= hotThreshold`;
  `needsNextAction({stage,nextFollowUpAt})` — `OPEN_STAGES.includes(stage) &&
  nextFollowUpAt == null`.
- `src/server/services/followup.ts`: `type LeadLite` + `getFollowUpBuckets(orgId, opts?:
  { assignedEmployeeId?; now? })` → `{ overdue, today, next7, noAction, hotNoAction }`.
  Selects open (`inArray(stage, OPEN_STAGES)`), non-deleted leads, LEFT JOIN `employees`
  for `assignee`, optional `assignedEmployeeId` filter; `hotThreshold` from
  `getConfig(orgId, 'hotLeadProbabilityThreshold')`. Rows bucketed with the domain
  helpers; `next7` = `UPCOMING` AND raw `nextFollowUpAt <= now + 7d`; `noAction` =
  `needsNextAction`; `hotNoAction` = `noAction ∩ isHotLead`. `nextFollowUpAt` serialized to
  ISO string for `LeadLite`; the raw `Date` is passed to `classifyFollowUp`. No
  notification writing (M3).
- TDD RED→GREEN:
  - `tests/domain/followup.test.ts` — RED: `Cannot find package '@/domain/followup'`.
    GREEN 3/3: bucket classification (NONE/OVERDUE/TODAY/UPCOMING at fixed `+05:30`
    dates around IST 2026-08-31), hot-lead by grade A / probability ≥ threshold / stage
    gate (LOST → false), needs-next-action (CONTACTED+null → true, CONTACTED+date →
    false, ON_HOLD+null → false).
  - `tests/services/followup.test.ts` — RED: `Cannot find package
    '@/server/services/followup'`. GREEN 1/1: four leads (overdue / today / soon /
    stage-only-no-follow-up) sorted into `overdue`=['Overdue Co'], `today`=['Today Co'],
    `next7`=['Soon Co'], `noAction` contains 'NoAction Co', with `now` pinned to
    2026-08-31T09:00+05:30.
- Tests: `npm test -- domain/followup` → 1 file / 3 passed. `npm test -- followup` → 2
  files / 4 passed. Full `npm test` → 17 files / 44 passed, run twice, stable. `npx tsc
  --noEmit` clean. `npm run lint` clean.
- Deviations: (1) the brief's service-test fixture used single-character `contactPerson`
  values ('A'..'D') which fail the existing `leadSchema` `z.string().min(2)` and throw at
  fixture setup — changed to 'Contact A'..'Contact D'; assertions and the fixed dates are
  unchanged. (2) `classifyFollowUp` returns `UPCOMING` for any future IST day (no 7-day
  ceiling in the domain fn, per Step 3 code); the ≤7-day window is applied in
  `getFollowUpBuckets` (`next7`), so far-future follow-ups fall in no surfaced bucket —
  matches the brief.
- Shortcuts / ponytail debt: none.
