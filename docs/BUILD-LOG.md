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

## 2026-09-01 — Task 17: Task service + Today's Tasks screen
- `src/server/services/task.ts`: `type TaskRow = typeof tasks.$inferSelect`, `type TaskStatus`,
  and (per the zod-v4 `.default()` pattern from lead/activity) a local
  `type TaskInput = z.input<typeof taskSchema>` so callers need not pass `priority`.
  - `createTask(user, input)` — `assertCan(user,'task.create')`; `taskSchema.parse`;
    `dueDate` stored as `d.dueDate.toISOString().slice(0,10)` (column is `date`);
    `assignedEmployeeId` defaults to `user.employeeId` for SALES; `createdBy = user.id`.
  - `updateTask(user, id, input & { status? })` — `assertCan('task.update')`,
    `taskSchema.partial().parse`, spread patch + `updatedAt`.
  - `completeTask(user, id)` — `assertCan('task.complete')`, sets `status='COMPLETED'`,
    `completedAt=now`.
  - `listOpenTasks(orgId, { assignedEmployeeId? })` — status in (PENDING, IN_PROGRESS),
    not deleted, `order by dueDate asc`.
  - `getTodayView(orgId, { assignedEmployeeId?, now? })` — union view (spec §4.3):
    open tasks bucketed `overdue/today/upcoming` by `classifyFollowUp(new Date(
    \`${t.dueDate}T12:00:00+05:30\`), now)`, PLUS `followUps = getFollowUpBuckets(orgId, opts)`.
    A due follow-up is read from the lead row — it never creates a task row.
- `src/app/(app)/today/actions.ts` — `addTask(formData)` / `finishTask(id)` server actions
  (`requireUser` → service → `revalidatePath('/today')`).
- `src/app/(app)/today/page.tsx` — replaced the placeholder: add-task form; `Tasks` column
  (Overdue / Today / Upcoming, each row has a "Done" server-action button) and a
  `Follow-ups` column (Overdue / Today / Next 7 days / Hot — no next action, each lead
  linking to `/leads/{id}`). SALES scoped to `{ assignedEmployeeId: user.employeeId }`.
- Schema: `tasks.created_by` changed `uuid` → `text` (new forward migration
  `drizzle/0004_task_created_by_text.sql` + journal + `0004_snapshot.json`), mirroring
  `audit_log.user_id` — system actors / test users need not be uuids. `crm.ts` updated to
  match with the same comment.
- `scripts/dev-fixtures.ts` — after each lead, `addActivity` seeds a follow-up at offsets
  `[-2,-1,0,3,6]` days (first 5 leads) so `/today` has overdue/today/next-7 content.
- TDD RED→GREEN: `tests/services/task.test.ts`
  - RED: `Cannot find package '@/server/services/task'`.
  - GREEN 2/2: (1) create → `listOpenTasks` == ['Call Acme'] → `completeTask` sets
    `COMPLETED` and it drops out of open. (2) `getTodayView` with `now` pinned to
    2026-08-31T09:00+05:30 unions an overdue task (`tasks.overdue` == ['Overdue meeting'])
    with a lead whose activity set a same-day follow-up (`followUps.today` ==
    ['FollowUp Co']), and `listOpenTasks` stays length 1 — no task row for the follow-up.
- Tests: `npm test -- services/task` → 1 file / 2 passed. Full `npm test` → 18 files /
  46 passed, run twice, stable. `npx tsc --noEmit` clean. `npm run lint` clean.
- Dev check (`next dev` already on :3000, dev-login hatch; `npm run db:migrate` applied
  0004 to devbrowse): set follow-ups on 3 dev leads via SQL — `/today` Follow-ups column
  shows Overdue(1) Sri Balaji Distributors, Today(1) Green Valley Traders, Next 7 days(1)
  Metro Foods Agency. Inserted two task rows (`created_by='dev-check'`, proving the text
  column) — Tasks column showed Overdue(1) with a "Done" button and Upcoming(1), correctly
  bucketed against the real date (2026-09-01); rows deleted after.
- Deviations: (1) `TaskInput` is a local `z.input<...>` alias, not the `z.infer` export from
  `@/lib/schemas` (same reason as lead/activity — `priority` has `.default('NORMAL')`).
  (2) brief's Step-1 test used `contactPerson: 'F'` (fails `leadSchema` min(2)) — changed to
  'Farida'; assertions unchanged. (3) `tasks.created_by` retyped to `text` via migration
  0004 so the brief's `id: 'o'` test user (and future SYSTEM actors) can be stored.
- Shortcuts / ponytail debt: none.

## 2026-09-01 — Task 18: Daily employee report — submit, derived counts, owner list

- `src/server/services/dailyReport.ts` (new):
  - `istDayBounds(date)` — `{ start, end }` UTC `Date` bounds for the IST calendar day
    `date` falls in (offset +330 min; `start` = 00:00 IST as UTC, `end` = +24 h). Local
    helper — returns `Date`s, not day-keys, so it does not reuse `followup.ts`'s key math.
  - `submitReport(user, input)` — `assertCan(user,'dailyReport.submit')`, then throw
    `Error('no employee record')` if `user.employeeId` is null; `dailyReportSchema.parse`;
    `insert ... onConflictDoUpdate` on the unique `(orgId, employeeId, reportDate)` index
    (sets `areasVisited`/`notes`/`blockers`/`submittedAt`). `reportDate` stored as `ymd()`.
  - `deriveCounts(orgId, employeeId, date)` — `{ activity, funnel }`, two groups kept
    SEPARATE (spec §5.7, never summed). `activity` = `activities` rows for that
    employee with `occurred_at` in the IST day, counted by type
    (calls/meetings/presentations/followUpsCompleted/quotations). `funnel` from
    `distributor_leads` assigned to the employee: `newLeads` = `created_at` in the day;
    `qualifiedLeads` = stage rank ≥ QUALIFIED & `updated_at` in the day; `appointments`
    / `firstOrders` = exact stage APPOINTED / FIRST_ORDER & `updated_at` in the day.
    Row filtering done in JS (tiny per-employee-per-day sets) to dodge bigint casts.
  - `listReports(orgId, { employeeId?, from?, to? })` — reports newest `reportDate` first
    (tiebreak `submittedAt` desc), left-joined to `employees.name`, each row enriched via
    `Promise.all(... deriveCounts(orgId, row.employeeId, new Date(row.reportDate)))`.
- `src/app/(app)/daily-report/actions.ts` (new) — `submitDailyReport(formData)`:
  `requireUser`, split `areasVisited` on comma (trim + drop blanks), `submitReport`,
  `redirect('/daily-report?done=1')`.
- `src/app/(app)/daily-report/page.tsx` (replaced placeholder) — server component;
  `!user.employeeId` → "No employee record linked — ask the owner."; else date (default
  today) / areas (comma text) / notes / blockers form → action; `?done=1` success note;
  below, today's `deriveCounts` as read-only **Activity** and **Funnel** tile grids, each
  under its own heading with a "tracked separately — never added together" caption.
- `src/app/(app)/reports/daily/page.tsx` (replaced placeholder) — `requireUser`;
  `if (!can(user,'dailyReport.viewAll')) redirect('/')`; `listReports(user.orgId)`; table
  of date / employee / areas / Activity block / Funnel block / notes / blockers
  (Activity + Funnel as separate stacked count lists per row, `overflow-x-auto` wrap).
- No `db` import in either page — both go through the service.
- TDD RED→GREEN: `tests/services/dailyReport.test.ts`
  - RED: `Cannot find package '@/server/services/dailyReport'`.
  - GREEN 2/2: (1) `submitReport` for an OWNER with `employeeId: null` rejects with
    `no employee record`; a SALES rep submitting twice for 2026-08-31 leaves ONE row and
    the second submit wins (`areasVisited` == `['Hoodi']`, `notes` == `'revised'`).
    (2) an employee who logged a CALL + a MEETING on 2026-08-31 and created 1 lead that
    day → `activity.calls` 1, `activity.meetings` 1, `activity.presentations` 0,
    `funnel.newLeads` 1.
- Tests: `npm test -- dailyReport` → 1 file / 2 passed. Full `npm test` → 19 files /
  48 passed, run twice, stable. `npx tsc --noEmit` clean. `npm run lint` clean.
- Dev check (`next dev` already on :3000, dev-login hatch, DB devbrowse): ran the real
  `submitReport` twice for today as the dev OWNER (`Dev Owner` employee) — `listReports`
  returned 1 row, second submit's areas/notes/`blockers=null` won. `/daily-report` renders
  the form + separate Activity / Funnel tile grids; `/reports/daily` renders the row
  (Dev Owner · "Whitefield, Marathahalli" · "revised: met 4" · Activity + Funnel blocks).
  Funnel showed `newLeads 6 / qualifiedLeads 4` off the dev-fixtures leads (all created +
  restaged today) — the `updated_at`-proxy behaving as documented. Dev report row deleted
  after.
- Deviations: (1) `DailyReportInput` is a local `z.input<...>` alias (schema's
  `areasVisited` has `.default([])`), same pattern as lead/activity/task. (2) brief's
  Step-1 test used `contactPerson: 'D'` (fails `leadSchema` min(2)) — changed to 'Dinesh';
  assertions unchanged. (3) the funnel test creates the lead then pins its `created_at` to
  the report day with a direct `db.update` — `createLead` stamps `created_at` = now
  (2026-09-01), so without this the 2026-08-31 `newLeads` assertion is clock-dependent;
  the fix makes the test deterministic. (4) `listReports` also returns `employeeName`
  (left-join) — the brief's owner table needs it and it avoids a `db` import in the page.
- Shortcuts / ponytail debt: funnel counts in `deriveCounts` use `updated_at`-on-the-day
  as a proxy for "moved to this stage that day" (`// ponytail:` comment in the file +
  new PONYTAIL-DEBT row; real fix = audit_log-derived counts in M3).

## 2026-09-01 — Task 19: Settings — editable score weights + hot-lead threshold

- `src/app/(app)/settings/actions.ts` (new) — `'use server'`; two form actions,
  `useActionState` signature `(_prev, formData)`:
  - `saveScoreWeights` — `requireUser`; `assertCan(user,'config.edit')` (throws
    `forbidden` for SALES); reads the 9 integer weight fields into a `ScoreWeights`;
    `assertWeightsValid` in a try/catch → `{ error: <message> }` on sum≠100;
    `setConfig(orgId,'scoreWeights',weights)`; `revalidatePath('/settings')`;
    `{ ok: true }`.
  - `saveThresholds` — same gate; `Number(...)` the `hotLeadProbabilityThreshold`
    field; `!Number.isInteger || <0 || >100` → `{ error: 'threshold must be 0–100' }`;
    else `setConfig(orgId,'hotLeadProbabilityThreshold',n)` + revalidate + `{ ok }`.
- `src/app/(app)/settings/forms.tsx` (new, `'use client'`) — `<SettingsForms weights
  threshold />`; two `useActionState` forms. Weights form: 9 number inputs (labelled
  per key), `useState`-tracked values with a live "Sum: N / 100" line that turns red
  off-100, an error line from `assertWeightsValid`, "Saved" on `ok`, "Save score
  weights" button. Thresholds form: one "Hot-lead probability threshold (%)" number
  input (`defaultValue`), error line, "Saved", "Save thresholds" button.
- `src/app/(app)/settings/page.tsx` (replaced placeholder) — server component;
  `requireUser`; `if (!can(user,'config.edit')) redirect('/')`; `Promise.all` of
  `getConfig` for `scoreWeights` + `hotLeadProbabilityThreshold`; renders
  `<SettingsForms>` + a read-only `<pre>` of `CONFIG_DEFAULTS.stageProbability`
  labelled "read-only in M1" with a `// ponytail:` note (editor deferred to M2). No
  `db` import — config goes through the service.
- TDD RED→GREEN: `tests/services/settings-actions.test.ts` (Vitest) — mocks
  `@/server/auth/session` `requireUser` (OWNER + SALES `AppUser`s) and `next/cache`
  `revalidatePath`; `beforeAll(migrateTestDb)` + `beforeEach(resetDb)` + `seedBase()`.
  - RED: `Cannot find package '@/app/(app)/settings/actions'`.
  - GREEN 6/6: (1) `saveScoreWeights(null, fd)` with 9 weights summing to 100 →
    `{ ok: true }` and `getConfig(orgId,'scoreWeights')` equals them. (2) weights
    summing to 105 → `{ error: 'score weights must sum to 100, got 105' }`, config
    still `CONFIG_DEFAULTS.scoreWeights`. (3) SALES caller → rejects `forbidden`.
    (4) `saveThresholds(null, fd)` `hotLeadProbabilityThreshold=55` → `{ ok: true }`,
    `getConfig` → 55. (5) `=120` → `{ error: 'threshold must be 0–100' }`, config
    unchanged (60). (6) SALES caller → rejects `forbidden`.
- `tests/e2e/settings.spec.ts` (new) — `test.describe.skip('settings', ...)` with the
  brief's two specs (owner changes threshold + reload persists; SALES redirected off
  `/settings`). Skipped: no local Supabase auth (same ceiling as auth/nav/lead-pipeline
  specs); `// ponytail:` header + extended the e2e-skip PONYTAIL-DEBT row. Real gate is
  the Vitest suite above.
- Tests: `npm test -- settings-actions` → 1 file / 6 passed. Full `npm test` → 20
  files / 54 passed, run twice, stable. `npx tsc --noEmit` clean. `npm run lint` clean.
- Dev check (`next dev` on :3000, dev-login hatch `dev@local` = OWNER, DB devbrowse):
  `GET /settings` (curl) renders both forms + the read-only stage-probability `<pre>`
  (no redirect → OWNER gate open). Server-action submit can't be driven headless here,
  so persistence was verified through the service layer against the dev DB: a script
  that `setConfig(orgId,'hotLeadProbabilityThreshold',55)` then `getConfig` read back
  55, restored to 60 — the exact round-trip `saveThresholds` performs. The sum≠100
  error path is covered by the Vitest case + the live red "Sum: N / 100" line.
- Deviations: (1) e2e spec kept env-var fallbacks (`E2E_OWNER_EMAIL` etc.) matching
  `auth.spec.ts` rather than the brief's hard-coded `owner@example.com`. (2) Added SALES
  deny cases for BOTH actions (brief lists one). (3) `forms.tsx` weight inputs are
  controlled (`useState`) to drive the live sum; the threshold input stays uncontrolled
  (`defaultValue`) since it has no live readout. (4) `revalidatePath` mocked in the
  Vitest suite — it needs a request scope absent under vitest (same reason the pipeline
  action test never exercises its success branch).
- Shortcuts / ponytail debt: stage-probability map is display-only in M1 (editor
  deferred to M2 — needs per-stage validation + a rescore sweep); `// ponytail:` note
  in `page.tsx` + new PONYTAIL-DEBT row. e2e-skip ledger row extended to name
  `settings.spec.ts`.

## 2026-09-01 — Task 20: Seed demo data + purge

- `src/server/db/schema/territory.ts` — added `isDemo boolean not null default false`
  to `territories` (leads/activities/tasks already had `is_demo`; territories did
  not, so demo territories could not be purged cleanly). Migration
  `drizzle/0005_classy_miracleman.sql` (via `db:generate`): one
  `ALTER TABLE "territories" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;`.
- `src/server/db/seed.ts` — added, all rows `isDemo: true`:
  - `seedDemo()` — reads the first org (throws if none); skips (logs) if
    `hasDemoData` already true. Inserts 1 "Bangalore East" ZONE + 12 AREA
    territories (Whitefield … Bellandur); 20 `distributor_leads` from a fixed
    `LEADS` array (generic FMCG names, no real people) spanning 12 stages
    (IDENTIFIED→FIRST_ORDER + 1 LOST w/ `lostReason: EXISTING_COMPETITOR` + 1
    ON_HOLD), `expectedFfMonthlyPotential` ₹1.5L–₹6L via `rupees(lakh*100_000)`,
    `scoreInputs` from 4 uniform tiers (strong/good/mid/weak) → `score`/`grade`
    via `scoreDistributor(inputs, CONFIG_DEFAULTS.scoreWeights)`, `probability`
    from `CONFIG_DEFAULTS.stageProbability[stage]`, `nextFollowUpAt` mixed
    (overdue / today / ≤7d / null); 53 `activities` (CALL per lead, +MEETING from
    QUALIFIED, +PRESENTATION from PRESENTATION_DONE, +NEGOTIATION from NEGOTIATION);
    8 `tasks` (mixed CRITICAL/HIGH/NORMAL/LOW, due -3…+7d, each linked to a lead).
  - `purgeDemo()` — `delete where is_demo` on activities → tasks → distributor_leads
    → territories.
  - `hasDemoData(orgId)` — `limit 1` on `distributor_leads` where org + `is_demo`.
  - CLI: `npm run db:seed` = `seedBase().then(seedDemo)`; `npm run db:seed -- --purge`
    = `purgeDemo()`; both `process.exit`, `.catch` → exit 1.
- `package.json` — `db:seed` now `tsx -r dotenv/config …` instead of relying on a
  top-of-file `import 'dotenv/config'` in `seed.ts`: the app (`layout.tsx`,
  `settings/`) now imports `seed.ts` for `hasDemoData`/`purgeDemo`, and `dotenv` is a
  devDependency that must not land in the Next/Cloudflare bundle.
- `src/app/(app)/settings/actions.ts` — `purgeDemoAction()`: `requireUser` +
  `assertCan(user,'config.edit')` + `purgeDemo()` + `revalidatePath('/', 'layout')`.
- `src/app/(app)/settings/forms.tsx` — `<PurgeDemoButton hasDemo />` client
  component: `<form action={purgeDemoAction}>` with an `onSubmit` `confirm()` guard,
  red button disabled when no demo data or pending.
- `src/app/(app)/settings/page.tsx` — `hasDemoData(user.orgId)` added to the
  `Promise.all`; renders `<PurgeDemoButton>` under the settings forms.
- `src/app/(app)/layout.tsx` — `hasDemoData(user.orgId)`; thin amber banner
  "Demo data is loaded — purge it from Settings before real use." when true.
- TDD: `tests/services/seed.test.ts` — RED (`seedDemo is not a function`) → GREEN
  (3 cases): ≥18 leads all `is_demo`, ≥6 distinct valid `STAGES` incl LOST (w/
  reason) + ON_HOLD, graded, activities/tasks/territories all demo-flagged,
  `hasDemoData` true; `purgeDemo` zeroes every demo-flagged table + `hasDemoData`
  false; `seedDemo` twice → ≤24 leads (second run skips).
- Tests: `npm test -- services/seed` → 1 file / 3 passed. Full `npm test` → 21 files
  / 57 passed, run twice, stable. `npx tsc --noEmit` clean. `npm run lint` clean.
- Dev check (`next dev`, DB devbrowse, dev-login `dev@local` = OWNER):
  `npm run db:migrate` (0005 applied) → `npm run db:seed` → "13 territories, 20
  leads, 53 activities, 8 tasks". `GET /` shows the amber banner; `/leads`,
  `/pipeline`, `/today` populated; `/settings` shows "Purge demo data". Purge
  exercised via `npm run db:seed -- --purge` → all four demo counts 0, banner gone
  on `/`. Re-seeded + `npm run dev:fixtures` (dev user untouched — not demo data).
- Deviations from brief: (1) no `distributors` (M2) — "5 distributors" skipped.
  (2) No `employees` "Field Rep (Demo)" row and no `employee_daily_reports` demo
  rows — neither table has `is_demo`, so they cannot be purged cleanly; leads/
  activities/tasks carry no `employeeId`. (3) `territories.is_demo` column added
  (brief assumed a marker already existed). (4) `db:seed` script switched to
  `tsx -r dotenv/config` (see package.json note above). (5) Server-action purge
  path not driven headless (no local Supabase) — `purgeDemo()` core verified via
  CLI + the `seed.test.ts` purge case; the action wrapper mirrors the existing
  `saveThresholds` gate pattern.
- Shortcuts: demo `scoreInputs` use 4 uniform tiers (every key equal) so each
  tier yields one fixed score — fine for demo data, no ledger entry.

## 2026-09-01 — Task 21: Minimal M1 dashboard
- Replaced the `src/app/(app)/page.tsx` scaffold placeholder with a real
  server-rendered dashboard (4 sections): Today counts (follow-ups overdue /
  today / next-7, tasks overdue / today, hot-no-next-action; link to `/today`),
  Pipeline funnel (row list — label, bar, count, `% from prev` skipped on row 1),
  Weighted pipeline value (`formatINR`), Leads needing attention (`hotNoAction`
  top 5, each linking `/leads/{id}`). SALES scoped to `employeeId`; open leads
  from `listLeads(orgId,{limit:500})` filtered to `OPEN_STAGES`. No `db` import —
  all data via services (`listLeads`, `getTodayView`). ~95 lines.
- New pure helper `src/domain/dashboard.ts` — `dashboardSummary(openLeads)` →
  `{ funnel: funnelConversion(...), weightedPipeline: Σ weightedPipelineValue }`.
- Files: `src/app/(app)/page.tsx` (rewrite), `src/domain/dashboard.ts` (new),
  `tests/domain/dashboard.test.ts` (new), `tests/e2e/dashboard.spec.ts` (new,
  `describe.skip`), `docs/BUILD-LOG.md`, `docs/PONYTAIL-DEBT.md`.
- TDD: `tests/domain/dashboard.test.ts` — RED (`Cannot find package
  '@/domain/dashboard'`) → GREEN (2 cases): empty list → all-zero funnel +
  weightedPipeline 0; small fixture → `funnel` deep-equals `funnelConversion` and
  `weightedPipeline` equals the hand-summed `weightedPipelineValue` (3,000,000).
- Tests: `npm test -- domain/dashboard` → 1 file / 2 passed. Full `npm test` →
  22 files / 59 passed, run twice, stable. `npx tsc --noEmit` clean.
  `npm run lint` clean.
- Dev check (`next dev`, DB devbrowse, dev-login `dev@local` = OWNER):
  `npm run db:seed` (demo already present) + `npm run dev:fixtures`. `GET /` →
  200, all 4 sections render with real numbers: funnel Identified 24 →
  Contacted 20 → Qualified 17 → … → First Order 1 (non-empty, `% from prev`
  shown from row 2), Weighted pipeline value ₹42,01,500.00, Today stat tiles
  populated (Follow-ups overdue, Hot · no next action, …), attention list
  present.
- e2e: `tests/e2e/dashboard.spec.ts` written per brief but `test.describe.skip`
  (no local Supabase Auth) with a `// ponytail:` note; PONYTAIL-DEBT e2e-skip row
  extended to list it.
- Deviations: `listLeads` + `getTodayView` loaded via `Promise.all` (parallel,
  not sequential). No BUILD shortcut cutting a real corner — the thin-page
  ceiling (full Command Center is M3) is the pre-existing PONYTAIL-DEBT note,
  restated in a `// ponytail:` comment at the top of `page.tsx`.

## 2026-09-01 — Final-review pre-merge fixes (C1–C3, I1–I3)
- Single fix pass on the whole-branch review findings; no scope beyond the six.
- C1 `src/app/(app)/leads/actions.ts` — `createLeadAction` now wraps the
  monthly-potential field in `rupees(...)` (rupees → paise), matching the sibling
  `[id]/actions.ts`.
- C2 new pure helper `src/lib/patch.ts` `patchOnly(input, parsed)` — strips keys
  the caller never supplied so `schema.partial().parse()` `.default()`s cannot
  clobber columns on update. Applied in `lead.updateLead`, `task.updateTask`,
  `territory.updateTerritory`. Tests: `tests/lib/patch.test.ts` (new, 3 cases) +
  a `lead.test.ts` service assertion (create `deliveryVehicles:3`, update
  `businessName` only, still 3).
- C3 audit rows for config + task mutations (plan line 21): `saveScoreWeights` /
  `saveThresholds` write `writeAudit(user,'config',key,'update',before,after)`;
  `createTask`/`updateTask`/`completeTask` write `writeAudit(user,'task',…)`.
  `addActivity` left UNAUDITED by design (plan:2425). Test assertions added in
  `settings-actions.test.ts` + `task.test.ts`.
- I1 `saveScoreWeights` rejects non-numeric (NaN) weights before
  `assertWeightsValid` — `{ error: 'weights must be numbers' }`. Test case added.
- I2 org-scoped mutations: `addActivity` loads the lead `id AND orgId` (throws
  `not found`) and the follow-up `db.update` predicate gains `eq(orgId,…)`;
  `updateTask`/`completeTask` load a `before` row `id AND orgId` (throws
  `not found`) then mutate by id. Cross-org rejection tests added to
  `activity.test.ts` + `task.test.ts`.
- I3 `purgeDemo(orgId)` — all four deletes now `and(eq(table.orgId,orgId),
  eq(table.isDemo,true))`; `purgeDemoAction` passes `user.orgId`; CLI `--purge`
  does `seedBase().then(({orgId}) => purgeDemo(orgId))`. `hasDemoData` already
  org-scoped. `seed.test.ts` calls updated + an org-scoping test added.
- Tests: `npm test` → 23 files / 67 passed, run twice, stable (was 22/59).
  `npx tsc --noEmit` clean. `npm run lint` clean.
- Dev check (`next dev` :3000, DB devbrowse): a lead created through the
  action's exact `rupees(Number('500000'))` transform stores `50000000` and
  `formatINR` renders `₹5,00,000.00` (buggy path rendered `₹5,000.00`).
- PONYTAIL-DEBT: vitest-parallelism race row marked CLEARED (shipped `cbaa27b`).

## 2026-09-01 — M1.5 cleanup — final-review deferrals I4–I8
- Five localised fixes deferred from the M1 whole-branch review; no scope beyond them.
- I4 `src/server/db/seed.ts` — demo lead `phone` now
  `` `9845${String(10000 + i).padStart(6, '0')}` `` (→ `9845010000…`, 10 digits,
  passes `leadSchema.phone` `/^[6-9]\d{9}$/`). Was `` `+91 98${45010000 + i}` ``
  which failed the app's own validator, making every demo lead read-only in the
  UI. `tests/services/seed.test.ts` — added assertion every seeded phone matches
  the regex. Dev check (DB devbrowse, purge + reseed): a demo lead saved through
  the exact `saveLeadFields` shape (phone included) — OK; the old value threw in
  `leadSchema.partial().parse`.
- I5 `src/app/(app)/page.tsx` — `listLeads(user.orgId, { ...scope, limit: 500 })`
  so a SALES rep's dashboard funnel + weighted value are self-scoped, matching
  the already-scoped `getTodayView`. One-liner; covered by `listLeads`'s existing
  `assignedEmployeeId` filter tests, no new test.
- I6 wired `stripFinancial` at the lead read boundary. `src/server/services/lead.ts`
  exports `LEAD_FINANCIAL_FIELDS: (keyof LeadRow)[] = []` (empty in M1) +
  `redactLead(user,row)` / `redactLeads(user,rows)`. Applied in
  `src/app/(app)/leads/page.tsx` (`redactLeads(user, await listLeads(...))`) and
  `src/app/(app)/leads/[id]/page.tsx` (`redactLead(user, found)` after the null
  check). `boardLeads` left as-is (projected subset, no cost cols) with a
  `// ponytail:` note. Test in `tests/services/lead.test.ts`: `redactLead` is a
  no-op today; direct `stripFinancial(sales,{a,secret},['secret'])` → `{a}`,
  OWNER keeps it. No-op today, so M2 only adds names to the array.
- I7 `src/server/services/lead.ts` `getLead()` — added
  `isNull(distributorLeads.deletedAt)` to the `and(...)`; a soft-deleted lead was
  still reachable at `/leads/[id]`. Test in `lead.test.ts`: create, set
  `deletedAt` via `testDb`, `getLead` → `null`.
- I8 new migration `drizzle/0006_pink_changeling.sql` — indexes added as Drizzle
  `index()` defs in `src/server/db/schema/{crm,audit}.ts` (3rd `pgTable` arg),
  `db:generate` produced exactly 7 `CREATE INDEX` (no other diffs):
  `leads_org_stage_idx`, `leads_org_assignee_idx`, `leads_org_deleted_idx`,
  `activities_lead_idx`, `activities_org_occurred_idx`, `tasks_org_status_due_idx`,
  `audit_entity_idx`. `db:migrate` clean against both `postgres` and `devbrowse`;
  all 7 present in `pg_indexes` on both.
- RED→GREEN: broke I4 (phone) + I7 (`getLead` filter) → the two new assertions
  failed; restored → pass.
- Tests: `npm test` → 23 files / 69 passed, run twice, stable (was 23/67).
  `npx tsc --noEmit` clean. `npm run lint` clean. `npm run build` succeeds.
- PONYTAIL-DEBT: no I4–I8 debt row existed; added an M1-empty
  `LEAD_FINANCIAL_FIELDS` → "populate in M2" pointer row.

## 2026-09-01 — M2a Task 1: F&F catalogue data file + typed loader
- `scripts/gen-ff-catalogue.py` — reads `Super Stockist Price List .xlsx` with
  stdlib only (`zipfile` + `xml.etree`, no openpyxl dep): unzips the xlsx,
  resolves `sharedStrings.xml`, walks `sheet1.xml` rows into a 9-col grid,
  section-headers switch category, jar categories (Dry Fruits/Seeds/Spices)
  fan out to the 100/250/500/1000g pack columns, Flours = single 1kg KG row,
  Other = free-text variation. Emits the catalogue JSON to stdout, SKU count to
  stderr. Committed for reproducibility.
- `data/ff-catalogue.json` — generated: `{ brand, gstInclusive:true,
  gstPctByCategory, volatileNote, skus[184] }`. Per-category: Dry Fruits 32,
  Seeds 40, Flours 17, Spices 92, Other 3 (matches the brief exactly). Almond
  100g → currentPaise 10700 / mrpPaise 19300 / volatile true / Dry Fruits. The
  41 `1kg` jar packs (unit G) have `mrpPaise: null` (no MRP column in the sheet).
  Prices stored as integer paise (`round(rupees*100)`). Committed.
- `src/server/db/ff-catalogue.ts` — `readFileSync(join(process.cwd(),'data',
  'ff-catalogue.json'))` parsed + validated once at import by a zod v4 schema
  (`z.enum` category/unit, `z.record(z.string(),z.number())` GST map,
  `.nullable()` packGrams/mrpPaise). Exports `FF_CATALOGUE`, `CatalogueSku`,
  `Catalogue` (both types `z.infer`'d from the schema).
- `tests/server/ff-catalogue.test.ts` — 3 specs: 184 SKUs / integer positive
  paise / 5 valid categories; Almond 100g row matches the sheet; every 1kg jar
  pack has `mrpPaise === null`.
- RED→GREEN: test written first, failed with `Cannot find package
  '@/server/db/ff-catalogue'`; added the loader → 3/3 pass.
- Tests: `npm test` → 24 files / 72 passed (was 23/69; +1 file, +3 tests).
  `npx tsc --noEmit` clean. `npm run lint` clean.
- Deviations: none. No corner cut → no PONYTAIL-DEBT row.

## 2026-09-01 — M2a Task 2: categories / products / product_prices schema + migration 0007
- `src/server/db/schema/product.ts` — 3 Drizzle tables, per-file `const ts`
  (`created_at`/`updated_at`) pattern, `snake_case` cols / `camelCase` props:
  - `categories` { id, org_id, name, parent_id (null), active (bool, def true),
    deleted_at, ts }.
  - `products` { id, org_id, brand_id (null), category_id (not null →
    categories.id), sku_code, name, pack_label, pack_grams (null), unit (text,
    def 'G'), mrp (bigint number, null), gst_pct (integer, def 5), shelf_life_days
    (null), reorder_level / min_stock / max_stock / preferred_stock (integer, def
    0), active (def true), volatile_price (def false), is_demo (def false),
    deleted_at, ts }. Indexes: unique `products_org_sku_idx` (org_id, sku_code),
    `products_org_cat_idx` (org_id, category_id), `products_org_active_idx`
    (org_id, active).
  - `product_prices` { id, org_id, product_id (not null → products.id), 4 NOT
    NULL paise cols (ss_billing_price, distributor_price, floor_price,
    target_price), retailer_price (null), mrp (null — snapshot copy, canonical
    stays on products; PONYTAIL-DEBT row deferred to a later task per brief),
    is_demo_assumption / manual_override (bool, def false), override_by (null),
    override_at (null), effective_from (timestamptz, def now), ts }. Unique index
    `product_prices_product_idx` (product_id) → 1:1.
  - All paise cols `bigint(..., { mode: 'number' })`; `gst_pct` whole-percent
    `integer`.
- `src/server/db/schema/index.ts` — added `export * from './product';`.
- `tests/services/product-schema.test.ts` — 3 specs (from the brief): insert
  category + product (asserts defaulted `active`/`volatilePrice`/`unit`) + 1:1
  price row (defaulted `manualOverride`/`isDemoAssumption`); second price row for
  same product rejects (unique `product_prices_product_idx`); duplicate
  `skuCode` per org rejects (unique `products_org_sku_idx`).
- `drizzle/0007_cheerful_johnny_blaze.sql` + `drizzle/meta/0007_snapshot.json` +
  `_journal.json` — `npm run db:generate`: 3 `CREATE TABLE`, 2 FKs
  (`product_prices.product_id → products.id`, `products.category_id →
  categories.id`), 4 indexes (2 unique + 2 plain). Journal idx 7, tag
  `0007_cheerful_johnny_blaze`; snapshot `prevId` chains to 0006. `npm run
  db:migrate` applied clean to `devbrowse`; `migrateTestDb` picks 0007 up for the
  test DB automatically.
- RED→GREEN: test written first → FAIL `Cannot find package
  '@/server/db/schema/product'`; added the schema module → 3/3 pass.
- Tests: `npm test` → 25 files / 75 passed, run twice, stable (was 24/72; +1
  file, +3 tests). `npx tsc --noEmit` clean. `npm run lint` clean.
- Deviations: none. YAGNI — exactly the 3 brief tables, no extra columns. No
  corner cut → no new PONYTAIL-DEBT row (the `product_prices.mrp` snapshot debt
  row is a later task per the brief).

## 2026-09-01 — M2a Task 4: Pricing calculator domain (`src/domain/pricing.ts`)
- `src/domain/pricing.ts` — pure function `computePricing(input: PricingInput):
  PricingResult`. No DB / framework imports; `import type { Paise } from
  './money'` only. Exports: `PricingInput`, `PricingResult`, `computePricing`.
  - `productCostPaise = ssBillingPrice` (landed cost of goods only).
  - `grossMarginPaise = sellingPrice - productCostPaise`; `grossMarginPct =
    part/whole*100`, 0 when `sellingPrice === 0`.
  - `netContributionPaise = grossMarginPaise - Σ(freight, scheme, loading,
    salesIncentive, samples, other)` (each `?? 0`) — variable costs are
    below-gross per spec §28 waterfall (the authority), so they do NOT touch
    `grossMargin`; §5.2's "product cost = ssBillingPrice + freight" phrasing is
    superseded to avoid double-counting (controller ruling R3).
  - `maxPermissibleDiscountPaise = Math.max(0, sellingPrice - floorPrice)`;
    `belowFloor = sellingPrice < floorPrice`.
  - `taxable`: when `gstInclusive`, `Math.round(amount / (1 + gstPct/100))` for
    both `sellingExGst` and `ssCostExGst`; when not inclusive, both equal the
    inclusive value.
  - `waterfall = { mrp, retailerPrice: retailerPrice ?? null, distributorPrice:
    sellingPrice, ssPrice: ssBillingPrice, ssCost: productCostPaise }`.
  - Computes and flags only — never mutates or recommends a price.
- `tests/domain/pricing.test.ts` — 6 specs (verbatim from the brief), Almond 100g
  anchor: cost 10700p, MRP 19300p, selling 11984p, floor 11556p, 12% GST incl →
  grossMargin 1284p (10.714%), maxDiscount 428p, `sellingExGst = round(11984/1.12)
  = 10700`, `ssCostExGst = round(10700/1.12) = 9554`. Covers: no variable costs;
  variable costs hit net only; ex-GST back-out; below-floor flag + discount clamp
  (grossMargin 300p at selling 11000p); waterfall with retailerPrice 13782p;
  `gstInclusive:false` → taxable === inclusive.
- RED→GREEN: test written first → FAIL `Cannot find package '@/domain/pricing'`;
  added the module → 6/6 pass.
- Tests: `npm test` → 26 files / 81 passed, run twice, stable (was 25/75; +1
  file, +6 tests). `npx tsc --noEmit` clean. `npm run lint` clean.
- Deviations: none — Step 3 code implemented exactly as the brief specifies.
  YAGNI — exactly the 3 exports listed. No corner cut → no new PONYTAIL-DEBT row.

## 2026-09-01 — M2a Task 5: Price recommendation engine (`src/domain/pricing-recommend.ts`)
- `src/domain/pricing-recommend.ts` — NEW pure module. `import type { Paise }
  from './money'` only; no DB / framework. Exports: `PricingBands`,
  `RecommendInput`, `RecommendResult`, `recommendPricing`. Private helpers
  `markup` / `rupees` / `marginPct` (local string building only — no `Intl`).
  - `floorPrice = round(cost * (1 + (volatile ? volatileFloorBufferPct :
    ssMinMarginPct)/100))`; `distributorPrice` / `targetPrice` off `cost` with
    `ssNormalMarginPct` / `ssTargetMarginPct`; `retailerPrice = round(
    distributorPrice * (1 + distributorMarginPct/100))` (PTR).
  - `mrpSuggestion = mrp == null ? round(retailerPrice * (1 +
    retailerMarginPct/100)) : null`.
  - `rationale[]` one entry per recommended field, plain English; floor `why`
    says "volatile-commodity buffer" and names volatility when `volatile`.
    Chain sanity: when `mrp != null` and `(mrp - retailerPrice)/retailerPrice*100
    < retailerMarginPct`, push `{ field: 'mrpCheck', valuePaise: mrp, why: '...
    only supports R% retailer margin ...' }`.
  - `marginAtEach.{floorPct,distributorPct,targetPct} = (price - cost)/cost*100`
    (0 when `cost === 0`). Recommends only — never mutates.
- `tests/domain/pricing-recommend.test.ts` — 4 specs (verbatim from the brief).
  Almond §5.3 anchor (cost 10700p, MRP 19300p, non-volatile): floor 11556p,
  distributor 11984p, target 12626p, retailer `round(11984*1.15)` = 13782p,
  `mrpSuggestion` null, marginAtEach 8 / 12 / 18%; MRP↔retailer headroom ~40% ≥
  25% → no `mrpCheck`. Volatile (cost 10000p): floor `10000*1.12` = 11200p (not
  1.08), floor `why` matches /volatile/i. MRP-suggest (cost 10000p, mrp null):
  retailer `round(round(10000*1.12)*1.15)` = 12880p, `mrpSuggestion`
  `round(12880*1.25)` = 16100p. mrpCheck (cost 10000p, mrp 13000p): retailer
  12880p, headroom ~0.9% < 25% → flag with /only supports/i.
- RED→GREEN: test written first → FAIL `Cannot find package
  '@/domain/pricing-recommend'`; added the module → 4/4 pass.
- Tests: `npm test` → 27 files / 85 passed, run twice, stable (was 26/81; +1
  file, +4 tests). `npx tsc --noEmit` clean. `npm run lint` clean.
- Deviations: none — Step 3 code implemented exactly as the brief specifies. No
  Task 3 `PricingBands` stub was present (Task 3 runs after this); this task
  creates the full module. YAGNI — exactly the 4 exports listed. No corner cut →
  no new PONYTAIL-DEBT row.

## 2026-09-01 — M2a Task 3: Pricing config bands (`CONFIG_DEFAULTS` + `bandsForCategory`)
- `src/server/services/config.ts` — added `import type { PricingBands } from
  '@/domain/pricing-recommend'` (Task 5 already shipped that module; no stub
  needed). Three new keys on `CONFIG_DEFAULTS`:
  - `pricingBands` = `{ ssMinMarginPct: 8, ssNormalMarginPct: 12,
    ssTargetMarginPct: 18, distributorMarginPct: 15, retailerMarginPct: 25,
    volatileFloorBufferPct: 12 }` — bare object literal (no inner `as` cast);
    the outer `satisfies` clause gained `pricingBands: PricingBands` and
    type-checks completeness.
  - `pricingBandsByCategory` = `{} as Record<string, Partial<PricingBands>>`
    (cast widens the empty literal; `satisfies` gained the matching Record type).
  - `pricesGstInclusive` = `true` (`satisfies` gained `pricesGstInclusive:
    boolean`).
  - `ConfigShape`/`ConfigKey` are `typeof`-derived, so the new keys flow through
    `getConfig<K>` / `setConfig<K>` automatically — no signature changes.
  - `bandsForCategory(orgId, categoryName: string | null): Promise<PricingBands>`
    — `getConfig('pricingBands')` as base; null category returns base; otherwise
    spreads `getConfig('pricingBandsByCategory')[categoryName] ?? {}` on top.
- `tests/services/config.test.ts` — +2 specs (verbatim from the brief): default
  bands + `pricesGstInclusive` + `setConfig` round-trip; `bandsForCategory`
  per-category merge (override wins on one key, base fills the rest; unknown
  category → exact base bands).
- RED→GREEN: tests first → FAIL (`bandsForCategory is not a function`,
  `pricesGstInclusive` undefined); extended `CONFIG_DEFAULTS` + added helper →
  4/4 pass.
- `satisfies` completeness sanity check: temporarily dropped
  `distributorMarginPct` from the `pricingBands` literal → `tsc` errored
  `TS2741: Property 'distributorMarginPct' is missing ... in type 'PricingBands'`
  at the `satisfies` position (line 20) — completeness enforced. Reverted.
- Tests: `npm test` → 27 files / 87 passed, run twice, stable (was 27/85; same
  file count, +2 specs). `npx tsc --noEmit` clean. `npm run lint` clean.
- Deviations: `pricingBands` left as a bare literal rather than the brief's
  `as PricingBands` (per the M1-review note that an inner cast can defeat the
  `satisfies` completeness check) — behaviour identical, completeness now
  verified. YAGNI — exactly the 3 keys + the one helper. No corner cut → no new
  PONYTAIL-DEBT row.
