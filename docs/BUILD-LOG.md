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
