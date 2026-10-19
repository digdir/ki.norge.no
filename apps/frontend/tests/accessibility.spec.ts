import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility tests (WCAG 2.1 AA, cf. uutilsynet.no for the public sector).
 * Axe check per main route + structural checks (landmarks, skip link,
 * keyboard, form labels). Runs against the dev server, or PLAYWRIGHT_BASE_URL.
 */

const ROUTES = ['/', '/artikler', '/eksempler', '/veiledning', '/kalender', '/om-oss', '/ki-tiltak', '/ki-tiltak/del'];

test.describe('Axe (WCAG 2.1 AA)', () => {
  for (const route of ROUTES) {
    test(`${route} has no critical or serious axe findings`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      const criticalViolations = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );

      expect(
        criticalViolations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
        }))
      ).toEqual([]);
    });
  }
});

test.describe('Landmarks and structure', () => {
  test('all pages have valid landmarks and exactly one h1', async ({ page }) => {
    for (const url of ROUTES) {
      await page.goto(url);
      await page.waitForLoadState('load');

      // Exactly one main landmark (app main, not dev tools)
      await expect(page.locator('main#main-content'), url).toHaveCount(1);

      // Header and footer (class-based to exclude the dev toolbar)
      await expect(page.locator('header.header'), url).toHaveCount(1);
      await expect(page.locator('footer.footer'), url).toHaveCount(1);

      // Navigation with a Norwegian label
      await expect(page.locator('nav[aria-label="Hovednavigasjon"]'), url).toHaveCount(1);

      // Exactly one h1 per page
      await expect(page.locator('main h1'), url).toHaveCount(1);

      // Language set on the html element. "no" (the macrolanguage), not "nb": the pages
      // mix Bokmål and Nynorsk, and the language cannot be marked per page from
      // the CMS, so a Bokmål tag would be wrong on the Nynorsk pages (#487).
      await expect(page.locator('html'), url).toHaveAttribute('lang', 'no');
    }
  });

  test('all images have an alt attribute', async ({ page }) => {
    for (const url of ['/', '/artikler', '/eksempler']) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');

      const images = page.locator('img');
      const count = await images.count();

      for (let i = 0; i < count; i++) {
        const img = images.nth(i);
        // Empty alt is OK for decorative images, but the attribute must exist
        expect(await img.getAttribute('alt'), `${url}: img ${await img.getAttribute('src')}`).not.toBeNull();
      }
    }
  });

  test('page titles are unique and meaningful', async ({ page }) => {
    const titles = new Set<string>();
    for (const url of ROUTES) {
      await page.goto(url);
      const title = await page.title();
      expect(title, url).toMatch(/ \| KI Norge$/);
      expect(titles.has(title), `Duplicate title: ${title}`).toBe(false);
      titles.add(title);
    }
  });
});

test.describe('Keyboard navigation', () => {
  test('can navigate through interactive elements with the keyboard', async ({ page }) => {
    await page.goto('/');

    const focusableElements: string[] = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.tagName.toLowerCase() ?? null);
      if (focused) focusableElements.push(focused);
    }

    expect(focusableElements.length).toBeGreaterThan(0);
    expect(focusableElements).toContain('a');
  });

  test('focus indicator is visible on interactive elements', async ({ page }) => {
    await page.goto('/');

    // Tab past the skip link to the next interactive element
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const focusedElement = page.locator(':focus');
    const indicator = await focusedElement.evaluate((el) => {
      // The indicator can be on the element itself or a parent (the :focus-within pattern)
      const candidates: Element[] = [el];
      if (el.parentElement) candidates.push(el.parentElement);
      const card = el.closest('[data-clickdelegatefor]');
      if (card) candidates.push(card);
      return candidates.some((c) => {
        const s = window.getComputedStyle(c);
        return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
      });
    });

    expect(indicator).toBe(true);
  });

  test('the search dialog can be opened with Ctrl+K and closed with Escape', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const dialog = page.locator('dialog.search-dialog');
    // Repeat until the React island has hydrated and responds to the shortcut
    await expect(async () => {
      await page.keyboard.press('Control+k');
      await expect(dialog).toHaveAttribute('open', '', { timeout: 500 });
    }).toPass({ timeout: 10_000 });
    // Focus should be in the search field
    await expect(dialog.locator('input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open', '');
  });
});

test.describe('Skip link', () => {
  test('the skip link exists, becomes visible on focus and works', async ({ page }) => {
    await page.goto('/');

    const skipLink = page.locator('a.ds-skip-link');
    await expect(skipLink).toHaveCount(1);

    // Becomes visible on keyboard focus (designsystemet uses :focus-visible)
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();
    const box = await skipLink.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(10);

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/#main-content');
  });
});

test.describe('Forms', () => {
  test('the search dialog field has an accessible name and status is announced', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const dialog = page.locator('dialog.search-dialog');
    await expect(async () => {
      await page.keyboard.press('Control+k');
      await expect(dialog).toHaveAttribute('open', '', { timeout: 500 });
    }).toPass({ timeout: 10_000 });
    await expect(dialog.locator('input')).toHaveAttribute('aria-label', /Søk/);
    // Status region for screen readers exists from the start (WCAG 4.1.3)
    await expect(dialog.locator('[role="status"]')).toHaveCount(1);
  });
});
