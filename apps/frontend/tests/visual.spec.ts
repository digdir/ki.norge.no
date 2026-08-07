import { test, expect } from '@playwright/test';

test.describe('Visual regression tests', () => {
  test.describe('Homepage', () => {
    test('full page screenshot - light mode', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('homepage-light.png', {
        fullPage: true,
      });
    });

    test('hero section', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const hero = page.locator('section').first();
      await expect(hero).toHaveScreenshot('hero-section.png');
    });
  });

  test.describe('Header & Footer', () => {
    test('header component', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const header = page.locator('header.header');
      await expect(header).toHaveScreenshot('header.png');
    });

    test('footer component', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const footer = page.locator('footer.footer');
      await expect(footer).toHaveScreenshot('footer.png');
    });
  });

  test.describe('Content pages', () => {
    test('articles listing page', async ({ page }) => {
      await page.goto('/artikler');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('articles-listing.png', {
        fullPage: true,
      });
    });

    test('about page', async ({ page }) => {
      await page.goto('/om-oss');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('about-page.png', {
        fullPage: true,
      });
    });
  });

  // Dark mode-testene er FJERNET (2026-08-07). Siden har ikke dark mode:
  // Layout.astro hardkoder data-color-scheme="light", og CLAUDE.md fører opp
  // «Ingen dark mode (bevisst valg)». Testen ventet class=/dark/ på <html>,
  // noe som aldri kan bli sant.
});

test.describe('Responsive layouts', () => {
  test('homepage at mobile viewport (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('homepage-mobile-375.png', {
      fullPage: true,
    });
  });

  test('homepage at tablet viewport (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('homepage-tablet-768.png', {
      fullPage: true,
    });
  });

  test('header responsive - mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const header = page.locator('header.header');
    await expect(header).toHaveScreenshot('header-mobile.png');
  });
});
