import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('all main nav links navigate correctly', async ({ page }) => {
    await page.goto('/');

    for (const href of ['/veiledning', '/artikler', '/eksempler', '/om-oss']) {
      await page.goto('/');
      await page.click(`nav a[href="${href}"]`);
      await expect(page).toHaveURL(href);
    }
  });

  test('logo navigates to homepage', async ({ page }) => {
    await page.goto('/artikler');
    await page.click('header a[href="/"]');
    await expect(page).toHaveURL('/');
  });

  test('the active page is marked with aria-current', async ({ page }) => {
    await page.goto('/artikler');
    const active = page.locator('header nav a[aria-current="page"]');
    await expect(active).toHaveAttribute('href', '/artikler');
  });
});

test.describe('Mobile menu (popover)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test('the hamburger menu opens and closes', async ({ page }) => {
    await page.goto('/');

    const menuToggle = page.locator('button[aria-label="Åpne meny"]');
    const mobileMenu = page.locator('#header-mobile-menu');

    await expect(mobileMenu).toBeHidden();

    await menuToggle.click();
    await expect(mobileMenu).toBeVisible();

    await page.locator('button[aria-label="Lukk meny"]').click();
    await expect(mobileMenu).toBeHidden();
  });

  test('the mobile menu closes with Escape', async ({ page }) => {
    await page.goto('/');

    const menuToggle = page.locator('button[aria-label="Åpne meny"]');
    const mobileMenu = page.locator('#header-mobile-menu');

    await menuToggle.click();
    await expect(mobileMenu).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(mobileMenu).toBeHidden();
  });

  test('the mobile menu contains navigation links', async ({ page }) => {
    await page.goto('/');

    await page.locator('button[aria-label="Åpne meny"]').click();
    const links = page.locator('#header-mobile-menu .mobile-menu-list a');
    expect(await links.count()).toBeGreaterThanOrEqual(4);
  });
});

test.describe('Card interaction', () => {
  test('article cards are clickable and navigate', async ({ page }) => {
    await page.goto('/artikler');
    await page.waitForLoadState('networkidle');

    // Cards use designsystemet's clickdelegatefor pattern with a link in the title
    const cards = page.locator('[data-clickdelegatefor]');
    expect(await cards.count()).toBeGreaterThan(0);

    const link = cards.first().locator('a').first();
    const href = await link.getAttribute('href');
    expect(href).toBeTruthy();

    await link.click();
    await expect(page).toHaveURL(new RegExp(href!.replace(/\//g, '\\/')));
  });
});

test.describe('Responsive breakpoints', () => {
  test('layout at 375px (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // The hamburger button should be visible
    await expect(page.locator('button[aria-label="Åpne meny"]')).toBeVisible();

    // Desktop nav should be hidden (visually hidden, not focusable)
    const navList = page.locator('header .nav-list');
    await expect(navList).toBeHidden();
  });

  test('layout at 1280px (desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    // Desktop nav visible
    await expect(page.locator('header .nav-list')).toBeVisible();
  });

  test('no horizontal scroll at 320px (WCAG 1.4.10 reflow)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });

    for (const url of ['/', '/artikler', '/veiledning', '/kalender']) {
      await page.goto(url);
      await page.waitForLoadState('load');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `${url} has horizontal overflow`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('Cookie banner', () => {
  test('the banner can be declined and reopened from the footer', async ({ page }) => {
    await page.goto('/');

    const notice = page.locator('#cookie-notice');
    await expect(notice).toBeVisible();

    // Declining hides the banner
    await page.locator('#cookie-notice-deny').click();
    await expect(notice).toBeHidden();

    // The footer button reopens the banner and moves focus there
    await page.locator('.footer [data-action="open-cookie-notice"]').click();
    await expect(notice).toBeVisible();
    await expect(page.locator('#cookie-notice-allow')).toBeFocused();
  });

  test('the choice is remembered after a page reload', async ({ page }) => {
    await page.goto('/');
    await page.locator('#cookie-notice-deny').click();

    await page.reload();
    await expect(page.locator('#cookie-notice')).toBeHidden();
  });
});
