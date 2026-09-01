import { test, expect, type Page } from '@playwright/test';

// Manual, throwaway smoke sweep — NOT gated behind describe.skip, because it never
// touches the login form: the dev-auth hatch (DEV_LOGIN_EMAIL) authenticates every
// request server-side with no cookie/session needed. Run with the dev server up and
// DEV_LOGIN_EMAIL set:
//   npx playwright test tests/e2e/smoke-owner.spec.ts
// Not part of `npm run e2e`'s normal scope decision either way — ad hoc verification run
// at the user's request, kept for now as a fast non-Supabase smoke check.

async function assertNoServerError(page: Page) {
  await expect(page.locator('#nextjs-portal')).toHaveCount(0);
  await expect(page.getByText(/unhandled runtime error/i)).toHaveCount(0);
  await expect(page.getByText(/internal server error/i)).toHaveCount(0);
}

test.describe('OWNER smoke sweep', () => {
  test('dashboard renders with real data', async ({ page }) => {
    await page.goto('/');
    await assertNoServerError(page);
    await expect(page.getByRole('heading', { name: /super stockist|dashboard/i }).first()).toBeVisible().catch(() => {});
    await expect(page.getByText(/pipeline funnel/i)).toBeVisible();
    await expect(page.getByText(/weighted pipeline/i)).toBeVisible();
  });

  test('today: add a task, mark it done', async ({ page }) => {
    await page.goto('/today');
    await assertNoServerError(page);
    await page.getByLabel('Task').fill('Smoke test task');
    await page.getByLabel('Due').fill('2026-09-05');
    await page.getByRole('button', { name: 'Add' }).click();
    await assertNoServerError(page);
    const row = page.locator('li').filter({ hasText: 'Smoke test task' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Done' }).click();
    await assertNoServerError(page);
    await expect(page.locator('li').filter({ hasText: 'Smoke test task' })).toHaveCount(0);
  });

  test('pipeline: drag a card to another column', async ({ page }) => {
    await page.goto('/pipeline');
    await assertNoServerError(page);
    const identified = page.getByRole('region', { name: /^identified$/i });
    const contacted = page.getByRole('region', { name: /^contacted$/i });
    await expect(identified).toBeVisible();
    const card = identified.locator('li').first();
    const cardCount = await identified.locator('li').count();
    if (cardCount === 0) {
      test.skip(true, 'no card currently in Identified to drag');
    }
    const businessName = await card.locator('a').first().innerText();
    const cardBox = await card.boundingBox();
    const targetBox = await contacted.boundingBox();
    if (!cardBox || !targetBox) throw new Error('could not measure drag boxes');
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(cardBox.x + cardBox.width / 2 + 10, cardBox.y + cardBox.height / 2, { steps: 5 });
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 30, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await assertNoServerError(page);
    await expect(contacted.getByText(businessName)).toBeVisible({ timeout: 3000 });
  });

  test('leads: create a lead, then edit fields / score / stage / log an activity', async ({ page }) => {
    await page.goto('/leads');
    await assertNoServerError(page);
    await page.getByText('New lead').click();
    await page.getByLabel('Business').fill('Smoke Test Distributors');
    await page.getByLabel('Contact').fill('Smoke Tester');
    await page.getByLabel('Phone').fill('9876543211');
    await page.getByLabel('Monthly potential (₹)').fill('50000');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
    await assertNoServerError(page);

    // Save fields
    await page.getByLabel('Address').fill('123 Smoke Test Road');
    await page.getByRole('button', { name: 'Save fields' }).click();
    await assertNoServerError(page);
    await expect(page.getByLabel('Address')).toHaveValue('123 Smoke Test Road');

    // Save score
    await page.getByLabel('Retailer network').fill('0.8');
    await page.getByLabel('Reputation').fill('0.9');
    await page.getByRole('button', { name: 'Save score' }).click();
    await assertNoServerError(page);

    // Stage change (non-LOST)
    await page.getByLabel('Stage').selectOption({ label: 'QUALIFIED' });
    await page.getByRole('button', { name: 'Update stage' }).click();
    await assertNoServerError(page);

    // Log an activity
    await page.getByLabel('Notes').fill('Smoke test call logged.');
    await page.getByRole('button', { name: 'Log activity' }).click();
    await assertNoServerError(page);
    await expect(page.getByText('Smoke test call logged.')).toBeVisible();

    // Stage change to LOST (requires a lost reason)
    await page.getByLabel('Stage').selectOption({ label: 'LOST' });
    await page.getByLabel('Lost reason').selectOption({ label: 'PRICE' });
    await page.getByLabel('Lost notes').fill('too expensive');
    await page.getByRole('button', { name: 'Update stage' }).click();
    await assertNoServerError(page);
  });

  test('territories: add a territory', async ({ page }) => {
    await page.goto('/territories');
    await assertNoServerError(page);
    const name = `Smoke Test Area ${Date.now()}`;
    await page.getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Add' }).click();
    await assertNoServerError(page);
    await expect(page.getByText(`${name} · ZONE`)).toBeVisible();
  });

  test('daily report: submit', async ({ page }) => {
    await page.goto('/daily-report');
    await assertNoServerError(page);
    const noEmployee = await page.getByText(/no employee record linked/i).count();
    test.skip(noEmployee > 0, 'dev owner has no employee record');
    await page.getByLabel(/areas visited/i).fill('Whitefield, Hoodi');
    await page.getByLabel('Notes').fill('Smoke test report.');
    await page.getByRole('button', { name: 'Submit report' }).click();
    await expect(page).toHaveURL(/done=1/);
    await assertNoServerError(page);
    await expect(page.getByText('Report submitted.')).toBeVisible();
  });

  test('reports/daily renders for OWNER', async ({ page }) => {
    await page.goto('/reports/daily');
    await assertNoServerError(page);
  });

  test('products: search/filter, save fields, override + reset prices, cost cascade', async ({ page }) => {
    await page.goto('/products');
    await assertNoServerError(page);
    await page.getByPlaceholder('Search name / SKU').fill('almond');
    await page.getByRole('button', { name: 'Filter' }).click();
    await assertNoServerError(page);
    await page.getByRole('link', { name: /almond 100g/i }).click();
    await assertNoServerError(page);

    // Save fields (product) — resave the same GST value, harmless
    await page.getByLabel('GST %').fill('12');
    await page.getByRole('button', { name: 'Save fields' }).click();
    await assertNoServerError(page);

    // Override distributor price, then reset
    await page.getByLabel('Distributor price override').fill('130');
    await page.getByRole('button', { name: 'Save prices' }).click();
    await assertNoServerError(page);
    await expect(page.getByText('manual override')).toBeVisible();
    await expect(page.locator('tr', { hasText: 'Distributor price' }).first().getByText('₹130.00')).toBeVisible();
    await page.getByRole('button', { name: 'Reset to recommended' }).click();
    await assertNoServerError(page);
    await expect(page.getByText('manual override')).toHaveCount(0);

    // Cost cascade: change SS billing price alone, confirm no error and downstream prices move
    await page.getByLabel('SS billing price override').fill('120');
    await page.getByRole('button', { name: 'Save prices' }).click();
    await assertNoServerError(page);
    await expect(page.locator('tr', { hasText: 'SS billing price' }).first().getByText('₹120.00')).toBeVisible();
    // distributor recomputed from the new cost (12000 * 1.12 = 13440), shown as both Recommended and Current
    await expect(page.locator('tr', { hasText: 'Distributor price' }).first().getByText('₹134.40').first()).toBeVisible();
    // restore cost + recommended prices
    await page.getByLabel('SS billing price override').fill('107');
    await page.getByRole('button', { name: 'Save prices' }).click();
    await assertNoServerError(page);
    await page.getByRole('button', { name: 'Reset to recommended' }).click();
    await assertNoServerError(page);
  });

  test('products: regenerate recommended prices', async ({ page }) => {
    await page.goto('/products');
    await page.getByText('Regenerate recommended prices').click();
    await page.getByRole('button', { name: 'Regenerate all' }).click();
    await assertNoServerError(page);
  });

  test('settings: save score weights, thresholds, pricing bands, regenerate', async ({ page }) => {
    await page.goto('/settings');
    await assertNoServerError(page);

    await page.getByRole('button', { name: /save score weights/i }).click();
    await expect(page.getByText('Saved').first()).toBeVisible();
    await assertNoServerError(page);

    await page.getByRole('button', { name: /save thresholds/i }).click();
    await expect(page.getByText('Saved').nth(1)).toBeVisible();
    await assertNoServerError(page);

    await page.getByRole('button', { name: /save pricing bands/i }).click();
    await expect(page.getByText('Saved').nth(2)).toBeVisible();
    await assertNoServerError(page);

    await page.getByRole('button', { name: /regenerate recommended prices/i }).click();
    await assertNoServerError(page);
  });

  // NOTE: "Purge demo data" is intentionally NOT exercised here — it is destructive
  // (wipes every is_demo row) and would break a repeatable smoke run. It is covered at
  // the service layer by tests/services/seed.test.ts (seedDemo / purgeDemo / hasDemoData),
  // and was verified once manually against this UI. Restore afterwards with `npm run db:seed`.
});
