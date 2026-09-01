import { test, expect } from '@playwright/test';

// ponytail: needs a live Supabase auth server (`supabase start`, Docker) + seeded users —
// none exists in this environment, so the spec is skipped here. Ceiling: the create-lead →
// pipeline-board flow (and the Identified column rendering a new lead) is unverified in CI
// until Supabase auth runs. Upgrade path: bring up `supabase start`, fill `.env.local` from
// `supabase status`, seed users via `scripts/create-user.ts`, drop the `.skip`, wire into CI.
// Tracked in docs/PONYTAIL-DEBT.md (e2e-skip row). Real gate for Task 15 is
// tests/services/pipeline.test.ts (Vitest: boardLeads join + moveLeadAction guard).
test.describe.skip('lead pipeline', () => {
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
});
