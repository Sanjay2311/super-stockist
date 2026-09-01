import { test, expect, type Page } from '@playwright/test';

// ponytail: needs `supabase start` (Docker) + seeded owner/sales users — not available in
// this environment, so the suite is skipped here. Ceiling: the role-aware nav rendering is
// unverified in CI until Supabase auth runs; upgrade path: bring up `supabase start`, seed
// users, drop the `.skip`. Real gate for this task is tests/domain/nav.test.ts (Vitest).
// Tracked in docs/PONYTAIL-DEBT.md. Run locally/CI once Supabase is available.
test.describe.skip('nav', () => {
  async function login(page: Page, email: string, password: string) {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL('/');
  }

  test('owner sees Settings and Reports links', async ({ page }) => {
    await login(page, 'owner@example.com', 'password123');
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reports' })).toBeVisible();
  });

  test('sales rep does not see Settings or Reports', async ({ page }) => {
    await login(page, 'sales@example.com', 'password123');
    await expect(page.getByRole('link', { name: 'Pipeline' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Reports' })).toHaveCount(0);
  });
});
