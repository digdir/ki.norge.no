import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * UU-tester (WCAG 2.1 AA, jf. uutilsynet.no for offentlig sektor).
 * Axe-sjekk per hovedrute + strukturelle sjekker (landemerker, skip-lenke,
 * tastatur, skjema-labels). Kjøres mot dev-server, ev. PLAYWRIGHT_BASE_URL.
 */

const ROUTES = ['/', '/artikler', '/eksempler', '/veiledning', '/kalender', '/om-oss'];

test.describe('Axe (WCAG 2.1 AA)', () => {
  for (const route of ROUTES) {
    test(`${route} har ingen kritiske eller alvorlige axe-funn`, async ({ page }) => {
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

test.describe('Landemerker og struktur', () => {
  test('alle sider har gyldige landemerker og nøyaktig én h1', async ({ page }) => {
    for (const url of ROUTES) {
      await page.goto(url);
      await page.waitForLoadState('load');

      // Nøyaktig ett main-landemerke (app-main, ikke dev-verktøy)
      await expect(page.locator('main#main-content'), url).toHaveCount(1);

      // Header og footer (klasse-basert for å utelate dev-toolbar)
      await expect(page.locator('header.header'), url).toHaveCount(1);
      await expect(page.locator('footer.footer'), url).toHaveCount(1);

      // Navigasjon med norsk label
      await expect(page.locator('nav[aria-label="Hovednavigasjon"]'), url).toHaveCount(1);

      // Nøyaktig én h1 per side
      await expect(page.locator('main h1'), url).toHaveCount(1);

      // Språk satt på html-elementet
      await expect(page.locator('html'), url).toHaveAttribute('lang', 'nb');
    }
  });

  test('alle bilder har alt-attributt', async ({ page }) => {
    for (const url of ['/', '/artikler', '/eksempler']) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');

      const images = page.locator('img');
      const count = await images.count();

      for (let i = 0; i < count; i++) {
        const img = images.nth(i);
        // Tomt alt er OK for dekorative bilder, men attributtet må finnes
        expect(await img.getAttribute('alt'), `${url}: img ${await img.getAttribute('src')}`).not.toBeNull();
      }
    }
  });

  test('sidetitler er unike og meningsfulle', async ({ page }) => {
    const titles = new Set<string>();
    for (const url of ROUTES) {
      await page.goto(url);
      const title = await page.title();
      expect(title, url).toMatch(/ \| KI Norge$/);
      expect(titles.has(title), `Duplikat tittel: ${title}`).toBe(false);
      titles.add(title);
    }
  });
});

test.describe('Tastaturnavigasjon', () => {
  test('kan navigere gjennom interaktive elementer med tastatur', async ({ page }) => {
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

  test('fokusindikator er synlig på interaktive elementer', async ({ page }) => {
    await page.goto('/');

    // Tab forbi skip-lenken til neste interaktive element
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const focusedElement = page.locator(':focus');
    const indicator = await focusedElement.evaluate((el) => {
      // Indikatoren kan ligge på elementet selv eller en forelder (:focus-within-mønsteret)
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

  test('søkedialogen kan åpnes med Ctrl+K og lukkes med Escape', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const dialog = page.locator('dialog.search-dialog');
    // Gjenta til React-øya har hydrert og reagerer på snarveien
    await expect(async () => {
      await page.keyboard.press('Control+k');
      await expect(dialog).toHaveAttribute('open', '', { timeout: 500 });
    }).toPass({ timeout: 10_000 });
    // Fokus skal stå i søkefeltet
    await expect(dialog.locator('input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open', '');
  });
});

test.describe('Skip-lenke', () => {
  test('skip-lenken finnes, blir synlig på fokus og fungerer', async ({ page }) => {
    await page.goto('/');

    const skipLink = page.locator('a.ds-skip-link');
    await expect(skipLink).toHaveCount(1);

    // Blir synlig ved tastaturfokus (designsystemet bruker :focus-visible)
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();
    const box = await skipLink.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(10);

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/#main-content');
  });
});

test.describe('Skjema', () => {
  test('søkedialogens felt har tilgjengelig navn og status annonseres', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const dialog = page.locator('dialog.search-dialog');
    await expect(async () => {
      await page.keyboard.press('Control+k');
      await expect(dialog).toHaveAttribute('open', '', { timeout: 500 });
    }).toPass({ timeout: 10_000 });
    await expect(dialog.locator('input')).toHaveAttribute('aria-label', /Søk/);
    // Statusregion for skjermlesere finnes fra start (WCAG 4.1.3)
    await expect(dialog.locator('[role="status"]')).toHaveCount(1);
  });
});
