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
