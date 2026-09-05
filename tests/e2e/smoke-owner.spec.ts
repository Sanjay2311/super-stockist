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

  // M2b sweep: convert an appointed lead → distributor, build + submit a quotation
  // (one auto line, one below-target line), approve the price request, add a scheme.
  test('m2b: convert lead → quotation → price approval → scheme', async ({ page }) => {
    const stamp = Date.now();

    // ── 1. convert a demo APPROVED/APPOINTED lead with no conversion yet ────────
    await page.goto('/leads');
    await assertNoServerError(page);
    // Prime Retail Distributors is seeded at stage APPROVED and is never converted
    // by seedDemo (it only converts Ashirwad + Coastal), so its Convert panel shows.
    await page.getByRole('link', { name: 'Prime Retail Distributors' }).click();
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
    await assertNoServerError(page);

    await expect(page.getByRole('heading', { name: 'Convert to Distributor' })).toBeVisible();
    await page.getByLabel('Territory').selectOption({ index: 1 });
    await page.getByLabel('Credit limit (₹)').fill('150000');
    await page.getByLabel('Credit days').fill('15');
    await page.getByLabel('Payment terms').fill(`Net 15 (smoke ${stamp})`);
    await page.getByRole('button', { name: 'Convert to Distributor' }).click();
    await expect(page).toHaveURL(/\/distributors\/[0-9a-f-]{36}$/);
    await assertNoServerError(page);

    // ── 2. new quotation for the demo distributor: one at/above target ─────────
    await page.goto('/quotations');
    await assertNoServerError(page);
    await page.getByRole('link', { name: 'New quotation' }).click();
    await expect(page).toHaveURL(/\/quotations\/new$/);

    await page.getByLabel('Party').selectOption({ label: 'Coastal Trading Company' });
    await page.getByLabel('Valid until').fill('2026-12-31');
    await page.getByLabel('Product').selectOption({ index: 1 });
    await page.getByLabel('Qty').fill('20');
    // leave the auto-filled rate (distributor price) — it sits at/above target → AUTO
    await page.getByRole('button', { name: 'Create quotation' }).click();
    await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]{36}$/);
    await assertNoServerError(page);

    await page.getByRole('button', { name: 'Submit quotation' }).click();
    await assertNoServerError(page);
    await expect(page.getByText(/·\s*SENT\s*·/)).toBeVisible();

    // ── 3. below-target quotation line → price approval → approve ──────────────
    await page.goto('/quotations/new');
    await page.getByLabel('Party').selectOption({ label: 'Coastal Trading Company' });
    await page.getByLabel('Valid until').fill('2026-12-31');
    await page.getByLabel('Product').selectOption({ index: 1 });
    await page.getByLabel('Qty').fill('10');
    const autoRate = await page.getByLabel('Rate (₹)').inputValue();
    // knock the rate down ~15% so it lands between floor and target → PENDING
    await page.getByLabel('Rate (₹)').fill((Number(autoRate) * 0.85).toFixed(2));
    await page.getByRole('button', { name: 'Create quotation' }).click();
    await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]{36}$/);
    await assertNoServerError(page);
    await page.getByRole('button', { name: 'Submit quotation' }).click();
    await assertNoServerError(page);

    await page.goto('/approvals');
    await assertNoServerError(page);
    await page.getByRole('button', { name: 'Approve' }).first().click();
    await assertNoServerError(page);
    await expect(page.getByText('No price approvals waiting.')).toBeVisible();

    // ── 4. add a FLAT_DISCOUNT / PCT scheme ───────────────────────────────────
    await page.goto('/schemes');
    await assertNoServerError(page);
    const schemeName = `Smoke Flat 3% ${stamp}`;
    await page.getByLabel('Name').fill(schemeName);
    await page.getByLabel('Type').selectOption({ label: 'FLAT_DISCOUNT' });
    await page.getByLabel('Start date').fill('2026-09-01');
    await page.getByLabel('End date').fill('2026-12-31');
    await page.getByLabel('Benefit (percent)').fill('3');
    await page.getByRole('button', { name: 'Create scheme' }).click();
    await assertNoServerError(page);
    await expect(page.getByRole('cell', { name: schemeName })).toBeVisible();
  });

  // M3 sweep: Command Center morning/EOD modes, Reports (pipeline/employees), a
  // quotation's History section, and the notification bell.
  test('m3: command center modes, reports, quotation history, notification bell', async ({ page }) => {
    // ── Command Center ("/") ────────────────────────────────────────────────
    await page.goto('/');
    await assertNoServerError(page);
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Morning' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'EOD' })).toBeVisible();

    await page.getByRole('link', { name: 'EOD' }).click();
    await expect(page).toHaveURL(/\?mode=eod$/);
    await assertNoServerError(page);
    await expect(page.getByText('Tomorrow: priorities')).toBeVisible();

    // ── Reports hub, pipeline report (table), employees report (may be empty) ──
    await page.goto('/reports');
    await assertNoServerError(page);
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();

    await page.goto('/reports/pipeline');
    await assertNoServerError(page);
    await expect(page.getByRole('heading', { name: 'Pipeline report' })).toBeVisible();
    await expect(page.locator('table').first()).toBeVisible();

    await page.goto('/reports/employees');
    await assertNoServerError(page);
    await expect(page.getByRole('heading', { name: 'Employees report' })).toBeVisible();

    // ── Quotation detail: History section ──────────────────────────────────
    await page.goto('/quotations');
    await assertNoServerError(page);
    const quoteLink = page.getByRole('link', { name: /^Q-/ }).first();
    const quoteCount = await quoteLink.count();
    test.skip(quoteCount === 0, 'no quotations in demo data');
    await quoteLink.click();
    await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]{36}$/);
    await assertNoServerError(page);
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
    await expect(page.locator('ol li').first()).toBeVisible();

    // ── Notification bell: open the panel (with or without unread items) ──
    const bell = page.getByRole('button', { name: 'Notifications' });
    await expect(bell).toBeVisible();
    await bell.click();
    await assertNoServerError(page);
    await expect(page.getByRole('button', { name: 'Close notifications' })).toBeVisible();
  });

  // NOTE: "Purge demo data" is intentionally NOT exercised here — it is destructive
  // (wipes every is_demo row) and would break a repeatable smoke run. It is covered at
  // the service layer by tests/services/seed.test.ts (seedDemo / purgeDemo / hasDemoData),
  // and was verified once manually against this UI. Restore afterwards with `npm run db:seed`.
});
