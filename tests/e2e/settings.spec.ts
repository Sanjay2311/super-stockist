import { test, expect } from '@playwright/test';

// ponytail: needs a live Supabase auth server + seeded owner/sales users — neither exists
// in this environment, so the suite is skipped here (same ceiling as auth.spec.ts /
// nav.spec.ts / lead-pipeline.spec.ts). The real gate for the save actions is the Vitest
// suite tests/services/settings-actions.test.ts (mocks requireUser, drives saveScoreWeights
// / saveThresholds against the DB). Ceiling: the sign-in flow, the SALES redirect off
// /settings, and threshold persistence across a reload are unverified until CI runs
// `supabase start`. Tracked in docs/PONYTAIL-DEBT.md.
test.describe.skip('settings', () => {
  test('owner can change the hot-lead probability threshold', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(process.env.E2E_OWNER_EMAIL ?? 'owner@example.com');
    await page.getByLabel('Password').fill(process.env.E2E_OWNER_PASSWORD ?? 'password123');
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.goto('/settings');
    const field = page.getByLabel('Hot-lead probability threshold (%)');
    await field.fill('55');
    await page.getByRole('button', { name: 'Save thresholds' }).click();
    await expect(page.getByText(/saved/i)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Hot-lead probability threshold (%)')).toHaveValue('55');
  });

  test('owner can edit the pricing bands and they persist', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(process.env.E2E_OWNER_EMAIL ?? 'owner@example.com');
    await page.getByLabel('Password').fill(process.env.E2E_OWNER_PASSWORD ?? 'password123');
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.goto('/settings');
    const field = page.getByLabel('SS target margin');
    await field.fill('20');
    await page.getByRole('button', { name: 'Save pricing bands' }).click();
    await expect(page.getByText(/saved/i)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('SS target margin')).toHaveValue('20');
  });

  test('sales rep cannot open settings', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(process.env.E2E_SALES_EMAIL ?? 'sales@example.com');
    await page.getByLabel('Password').fill(process.env.E2E_SALES_PASSWORD ?? 'password123');
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.goto('/settings');
    await expect(page).not.toHaveURL(/\/settings$/); // redirected away
  });
});
