import { test, expect } from '@playwright/test';

/**
 * Frontend smoke tests — every public URL returns 200 and renders without
 * server-side errors. Catches the classes of bugs we hit:
 *   - sort=publishedAt:desc → 400 in Delivery API → blank page
 *   - bakgrunn dropdown JSON format → 500 in Delivery API → blank page
 */

const PUBLIC_URLS = [
  { path: '/', label: 'Forside' },
  { path: '/artikler', label: 'Artikler list' },
  { path: '/eksempler', label: 'Eksempler list' },
  { path: '/veiledning', label: 'Veiledning' },
  { path: '/om-oss', label: 'Om oss' },
  { path: '/sandkasse', label: 'Sandkasse' },
  { path: '/sok', label: 'Søk' },
];

for (const { path, label } of PUBLIC_URLS) {
  test(`${label} loads`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status(), `${label} HTTP status`).toBeLessThan(400);
    // Page should render the KI Norge brand header — proves SSR didn't fail.
    // Use class selector to avoid Astro dev-toolbar headers in dev mode.
    await expect(page.locator('header.header')).toBeVisible();
  });
}

test('Artikkel detail page renders for first article', async ({ page, request }) => {
  // Pick an actual artikkel slug from the Delivery API
  const apiKey = 'ki-norge-delivery-key-2025';
  const cms = process.env.TARGET === 'local'
    ? 'http://localhost:5000'
    : 'https://kinorgeportal.prod.dis-core.altinn.cloud';

  const res = await request.get(`${cms}/umbraco/delivery/api/v2/content?filter=contentType:artikkel&take=1`, {
    headers: { 'Api-Key': apiKey },
  });
  const data = await res.json();
  const slug = data.items?.[0]?.properties?.slug;
  test.skip(!slug, 'No published artikkel to test against');

  const response = await page.goto(`/artikler/${slug}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator('main h1').first()).toBeVisible();
});

test('Eksempel detail page renders for first eksempel', async ({ page, request }) => {
  const apiKey = 'ki-norge-delivery-key-2025';
  const cms = process.env.TARGET === 'local'
    ? 'http://localhost:5000'
    : 'https://kinorgeportal.prod.dis-core.altinn.cloud';

  const res = await request.get(`${cms}/umbraco/delivery/api/v2/content?filter=contentType:eksempel&take=1`, {
    headers: { 'Api-Key': apiKey },
  });
  const data = await res.json();
  const slug = data.items?.[0]?.properties?.slug;
  test.skip(!slug, 'No published eksempel to test against');

  const response = await page.goto(`/eksempler/${slug}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator('main h1').first()).toBeVisible();
});
