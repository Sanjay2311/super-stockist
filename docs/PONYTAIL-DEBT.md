# Ponytail Debt Ledger

Deliberate corners cut, each with its ceiling and the task that clears it.

| Date | Item | Ceiling | Upgrade path | Cleared by |
|------|------|---------|--------------|------------|
| 2026-08-31 | No CI pipeline | Tests only run locally | Add GitHub Actions running `npm test` + `npm run e2e` | Post-M1 |
| 2026-08-31 | Hand-written empty `drizzle/meta/_journal.json` | `migrate()` needs the journal to exist; there are no migrations yet so it is a stub with `entries: []` | Task 3 runs `drizzle-kit generate` for the first schema, which owns and rewrites this file | Task 3 |
