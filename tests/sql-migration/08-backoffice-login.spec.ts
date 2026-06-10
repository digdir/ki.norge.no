import { test, expect, Page } from '@playwright/test';

/**
 * Post-cutover: admin can log into the backoffice. Proves:
 *   - Login flow works (membership + auth tables migrated)
 *   - Content section loads (cmsContent / umbracoNode tables OK)
 *   - Tree renders (no broken queries)
 */

const ADMIN_EMAIL = process.env.CMS_USER || 'admin@ki.norge.no';
const ADMIN_PASS = process.env.CMS_PASS || 'KiNorge2025!';

async function login(page: Page) {
  await page.goto('/umbraco');
  await page.waitForLoadState('domcontentloaded');

  const emailInput = page.locator('input[name="email"], input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
  await emailInput.fill(ADMIN_EMAIL);

  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  await passwordInput.fill(ADMIN_PASS);

  await page.getByRole('button', { name: /log in|logg inn|sign in/i }).first().click();
  await page.waitForURL(/\/umbraco\/section\/.+/, { timeout: 30_000 });
}

test('Admin can log in to backoffice', async ({ page }) => {
  await login(page);
  await expect(page.locator('text=/Content|Innhold/i').first()).toBeVisible();
});

test('Content tree shows expected structure post-migration', async ({ page }) => {
  await login(page);
  await page.goto('/umbraco/section/content');
  await page.waitForLoadState('networkidle');

  for (const name of ['Forside', 'Artikler', 'Eksempler', 'Veiledning', 'Sider', 'Merkelapper']) {
    await expect(page.locator(`text=${name}`).first()).toBeVisible({ timeout: 15_000 });
  }
});
