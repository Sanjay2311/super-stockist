import { test, expect } from '@playwright/test';

// ponytail: needs a live Supabase auth server (`supabase start`, Docker) + a seeded
// owner user + `npm run db:seed` (so the funnel is non-empty) — none of which exist in
// this environment, so the spec is skipped here (same ceiling as auth.spec.ts /
// nav.spec.ts / lead-pipeline.spec.ts / settings.spec.ts). Real gate for Task 21 is the
// Vitest suite tests/domain/dashboard.test.ts (pure `dashboardSummary`). Upgrade path:
// bring up `supabase start`, fill `.env.local` from `supabase status`, seed users via
// `scripts/create-user.ts`, run `npm run db:seed`, drop the `.skip`, wire into CI.
// Tracked in docs/PONYTAIL-DEBT.md (e2e-skip row).
test.describe.skip('dashboard', () => {
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
});
