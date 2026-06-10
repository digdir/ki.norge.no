import { test, expect } from '@playwright/test';

/**
 * Post-cutover: the frontend still renders public pages with the new database.
 * Mirrors what scripts/smoke-test.sh does but as Playwright assertions for clean
 * pass/fail in this test suite.
 */

const PUBLIC_URLS = [
  { path: '/', label: 'Forside' },
  { path: '/artikler', label: 'Artikler list' },
  { path: '/eksempler', label: 'Eksempler list' },
  { path: '/veiledning', label: 'Veiledning' },
  { path: '/om-oss', label: 'Om oss' },
  { path: '/faq', label: 'FAQ' },
  { path: '/ki-ordbok', label: 'KI-ordbok' },
  { path: '/sandkasse', label: 'Sandkasse' },
  { path: '/kontakt', label: 'Kontakt' },
];

for (const { path, label } of PUBLIC_URLS) {
  test(`${label} renders`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status(), `${label} HTTP status`).toBeLessThan(400);
    // Header proves SSR completed
    await expect(page.locator('header')).toBeVisible();
  });
}
