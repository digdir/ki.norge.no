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

  test('aktiv side markeres med aria-current', async ({ page }) => {
    await page.goto('/artikler');
    const active = page.locator('header nav a[aria-current="page"]');
    await expect(active).toHaveAttribute('href', '/artikler');
  });
});

test.describe('Mobilmeny (popover)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test('hamburgermenyen åpner og lukker', async ({ page }) => {
    await page.goto('/');

    const menuToggle = page.locator('button[aria-label="Åpne meny"]');
    const mobileMenu = page.locator('#header-mobile-menu');

    await expect(mobileMenu).toBeHidden();

    await menuToggle.click();
    await expect(mobileMenu).toBeVisible();

    await page.locator('button[aria-label="Lukk meny"]').click();
    await expect(mobileMenu).toBeHidden();
  });

  test('mobilmenyen lukkes med Escape', async ({ page }) => {
    await page.goto('/');

    const menuToggle = page.locator('button[aria-label="Åpne meny"]');
    const mobileMenu = page.locator('#header-mobile-menu');

    await menuToggle.click();
    await expect(mobileMenu).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(mobileMenu).toBeHidden();
  });

  test('mobilmenyen inneholder navigasjonslenker', async ({ page }) => {
    await page.goto('/');

    await page.locator('button[aria-label="Åpne meny"]').click();
    const links = page.locator('#header-mobile-menu .mobile-menu-list a');
    expect(await links.count()).toBeGreaterThanOrEqual(4);
  });
});

test.describe('Kort-interaksjon', () => {
  test('artikkelkort er klikkbare og navigerer', async ({ page }) => {
    await page.goto('/artikler');
    await page.waitForLoadState('networkidle');

    // Kort bruker designsystemets clickdelegatefor-mønster med lenke i tittelen
    const cards = page.locator('[data-clickdelegatefor]');
    expect(await cards.count()).toBeGreaterThan(0);

    const link = cards.first().locator('a').first();
    const href = await link.getAttribute('href');
    expect(href).toBeTruthy();

    await link.click();
    await expect(page).toHaveURL(new RegExp(href!.replace(/\//g, '\\/')));
  });
});

test.describe('Responsive brekkpunkt', () => {
  test('layout på 375px (mobil)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Hamburgerknappen skal være synlig
    await expect(page.locator('button[aria-label="Åpne meny"]')).toBeVisible();

    // Desktop-nav skal være skjult (visually hidden, ikke fokuserbar)
    const navList = page.locator('header .nav-list');
    await expect(navList).toBeHidden();
  });

  test('layout på 1280px (desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    // Desktop-nav synlig
    await expect(page.locator('header .nav-list')).toBeVisible();
  });

  test('ingen horisontal scroll på 320px (WCAG 1.4.10 reflow)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });

    for (const url of ['/', '/artikler', '/veiledning', '/kalender', '/sok?q=ki']) {
      await page.goto(url);
      await page.waitForLoadState('load');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `${url} har horisontal overflow`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('Cookie-banner', () => {
  test('banneret kan avslås og gjenåpnes fra footeren', async ({ page }) => {
    await page.goto('/');

    const notice = page.locator('#cookie-notice');
    await expect(notice).toBeVisible();

    // Avslå skjuler banneret
    await page.locator('#cookie-notice-deny').click();
    await expect(notice).toBeHidden();

    // Footerknappen gjenåpner banneret og flytter fokus dit
    await page.locator('.footer [data-action="open-cookie-notice"]').click();
    await expect(notice).toBeVisible();
    await expect(page.locator('#cookie-notice-allow')).toBeFocused();
  });

  test('valget huskes etter sidelast', async ({ page }) => {
    await page.goto('/');
    await page.locator('#cookie-notice-deny').click();

    await page.reload();
    await expect(page.locator('#cookie-notice')).toBeHidden();
  });
});
