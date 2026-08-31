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
