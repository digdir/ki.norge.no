import { test, expect, Page } from '@playwright/test';

const ADMIN_EMAIL = process.env.CMS_USER || 'admin@ki.norge.no';
const ADMIN_PASS = process.env.CMS_PASS || 'KiNorge2025!';

/**
 * Logs into Umbraco backoffice. Reusable across tests.
 */
async function login(page: Page) {
  await page.goto('/umbraco');
  await page.waitForLoadState('domcontentloaded');

  // Umbraco 17 renders the login form inside Lit shadow roots. Playwright
  // auto-pierces open shadow DOM, so we can target the inputs by their
  // stable ids (#username-input, #password-input, #umb-login-button).
  const usernameInput = page.locator('#username-input');
  await usernameInput.waitFor({ state: 'visible', timeout: 30_000 });
  await usernameInput.fill(ADMIN_EMAIL);

  await page.locator('#password-input').fill(ADMIN_PASS);
  await page.locator('#umb-login-button').click();

  await page.waitForURL(/\/umbraco\/section\/.+/, { timeout: 30_000 });
}

test('Admin can log in', async ({ page }) => {
  await login(page);
  // Section bar should be visible
  await expect(page.locator('text=/Content|Innhold/i').first()).toBeVisible();
});

test('Content tree shows expected structure', async ({ page }) => {
  await login(page);
  await page.goto('/umbraco/section/content');
  await page.waitForLoadState('networkidle');

  // Demo content seeding is removed; on a fresh install the tree is otherwise
  // bootstrapped via uSync import (issue #232), which CI does not run. So we
  // assert the negatives that guard pr-316's structural changes rather than
  // positive nodes that only exist after a uSync import.
  // Anchor: confirm we actually landed on the content section (so the
  // toHaveCount(0) checks below aren't trivially true on a blank page).
  await expect(page).toHaveURL(/\/umbraco\/section\/content/, { timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'Content' })).toBeVisible({ timeout: 10_000 });

  // Caser was renamed to Eksempler in pr-316 — the old name must be gone.
  await expect(page.locator('text=Caser')).toHaveCount(0);
  // KI-ordbok was removed in pr-316.
  await expect(page.locator('text=KI-ordbok')).toHaveCount(0);
  // Ikoner should NOT be in the tree.
  await expect(page.locator('text=Tilgjengelige ikoner')).toHaveCount(0);
});

test('Diagnostics endpoint reports valid state', async ({ request }) => {
  const res = await request.get('/api/diagnostics');
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(data.artikkelFields.hasIngress).toBe(true);
  expect(data.artikkelFields.hasBilde).toBe(true);
  expect(data.richTextDataTypes.length).toBeGreaterThanOrEqual(2);
  // Verify both standard and restricted RichText exist
  const names = data.richTextDataTypes.map((d: any) => d.name);
  expect(names).toContain('Richtext editor');
  expect(names).toContain('Richtext editor (begrenset)');
});
