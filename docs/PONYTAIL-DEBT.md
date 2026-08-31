# Ponytail Debt Ledger

Deliberate corners cut, each with its ceiling and the task that clears it.

| Date | Item | Ceiling | Upgrade path | Cleared by |
|------|------|---------|--------------|------------|
| 2026-08-31 | No CI pipeline | Tests only run locally | Add GitHub Actions running `npm test` + `npm run e2e` | Post-M1 |
| 2026-08-31 | Hand-written empty `drizzle/meta/_journal.json` | `migrate()` needs the journal to exist; there are no migrations yet so it is a stub with `entries: []` | Task 3 runs `drizzle-kit generate` for the first schema, which owns and rewrites this file | Cleared by Task 3 — `db:generate` regenerated `drizzle/meta/*` + `0000_eminent_stingray.sql` |
| 2026-08-31 | Single Drizzle client in `src/server/db/client.ts` switched by the `VITEST` env var (test run → `TEST_DATABASE_URL`, else `DATABASE_URL`) | One DB per process — the app client and the test client cannot both be live in the same process, and there is no per-test DB isolation | Inject the client (pass `db` into services / a factory) where a second connection or per-test schema is needed | Not scheduled (M1 uses one local Postgres for both) |
