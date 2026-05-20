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

  // Only items created by RunStructureMigrations survive on a fresh install:
  // demo content seeding has been removed, the rest is bootstrapped via
  // uSync import (issue #232).
  for (const name of ['Caser', 'KI-ordbok']) {
    await expect(page.locator(`text=${name}`).first()).toBeVisible({ timeout: 10_000 });
  }

  // Eksempler should NOT be in the tree (migrated to Caser, container deleted)
  await expect(page.locator('text=Eksempler')).toHaveCount(0);
  // Ikoner should NOT be in the tree
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
