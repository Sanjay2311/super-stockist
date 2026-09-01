import { test, expect, type Page } from '@playwright/test';

// ponytail: needs a live Supabase auth server + seeded owner/sales users — neither exists
// in this environment, so the suite is skipped here (same ceiling as auth.spec.ts /
// nav.spec.ts / lead-pipeline.spec.ts / settings.spec.ts / dashboard.spec.ts). The real
// gate for Task 8's nav visibility is the Vitest suite tests/domain/nav.test.ts
// (pure visibleNavItems — Products shown to both roles); the price-override / reset
// service logic is gated by tests/services/product.test.ts (Task 6). Ceiling: the
// owner-sees-cost-columns catalogue, the recommended-vs-current override + save flow,
// and the SALES no-cost-columns redaction are unverified in-browser until CI runs
// `supabase start`. Tracked in docs/PONYTAIL-DEBT.md.
test.describe.skip('products & pricing', () => {
  async function login(page: Page, email: string, password: string) {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL('/');
  }

  test('owner sees the catalogue with cost prices and can override one', async ({ page }) => {
    await login(page, 'owner@example.com', 'password123');
    await page.goto('/products');
    await expect(page.getByRole('heading', { name: /products/i })).toBeVisible();
    await page.getByRole('link', { name: /Almond 100g/ }).click();
    await expect(page.getByText(/recommended/i)).toBeVisible();
    await page.getByLabel(/distributor price/i).fill('130');
    await page.getByRole('button', { name: /save prices/i }).click();
    await expect(page.getByText(/₹130\.00/)).toBeVisible();
  });

  test('sales rep sees the catalogue but no cost columns', async ({ page }) => {
    await login(page, 'sales@example.com', 'password123');
    await page.goto('/products');
    await expect(page.getByText(/super.?stockist cost/i)).toHaveCount(0);
    await expect(page.getByText(/floor price/i)).toHaveCount(0);
  });
});
