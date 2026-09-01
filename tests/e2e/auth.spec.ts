import { test, expect } from '@playwright/test';

// ponytail: these specs need a live Supabase auth server (`supabase start`, Docker) plus
// seeded test users — neither exists in this environment, so both are skipped here.
// Ceiling: the auth redirect + sign-in flow is unverified until CI (or a local dev with
// Docker) runs `supabase start`, fills `.env.local` from `supabase status`, seeds users
// via `scripts/create-user.ts`, and drops the skip. Tracked in docs/PONYTAIL-DEBT.md.
test.describe.skip('auth flow', () => {
  test('unauthenticated user is redirected to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });

  test('owner can sign in and land on the dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(process.env.E2E_OWNER_EMAIL ?? 'owner@example.com');
    await page.getByLabel('Password').fill(process.env.E2E_OWNER_PASSWORD ?? 'password123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: /command|dashboard|super stockist/i })).toBeVisible();
  });
});
