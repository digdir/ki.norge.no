import { test, expect } from '@playwright/test';

/**
 * Visual regression test for every artikkel module.
 *
 * Setup (one-time, manually via the editor):
 *   1. Log into the CMS
 *   2. Under Artikler, create an artikkel called "Module test" with slug "module-test"
 *   3. Add ONE block of every type:
 *        - artikkelTekst (with h2, h3, lists, links inside)
 *        - artikkelByline (navn + stilling + virksomhet + dato)
 *        - artikkelInnholdFra (virksomhet + dato)
 *        - artikkelKontaktkort (full contact details)
 *        - artikkelProsessteg (4 steg with descriptions)
 *        - artikkelFremheving (try all 3 toggles in different blocks: bg, quote, with-image)
 *        - artikkelTrekkspill (a few accordion items)
 *        - artikkelBildeSeksjon (image + caption)
 *   4. Publish
 *
 * Test:
 *   - Loads /artikler/module-test
 *   - Skips with a message if the article doesn't exist (until you create it)
 *   - Takes a full-page screenshot for whole-page regression
 *   - Takes per-module screenshots so a failure tells you exactly which module changed
 *
 * Refresh baseline after intentional design changes:
 *   npx playwright test --config=tests/playwright.config.ts module-visual-regression --update-snapshots
 */

const SLUG = 'module-test';

test.describe('Article module visual regression', () => {
  test('module-test article: full-page snapshot', async ({ page }) => {
    const r = await page.goto(`/artikler/${SLUG}`);
    test.skip(
      r?.status() !== 200,
      `Article /artikler/${SLUG} not found. Create it manually first — see top-of-file instructions.`,
    );

    // Hide the cookie banner if it's covering content; it's outside the article and
    // would cause unrelated diffs every time it appears/disappears.
    await page.evaluate(() => {
      const notice = document.querySelector('#cookie-notice');
      if (notice) notice.setAttribute('hidden', '');
      const back = document.querySelector('[data-back-to-top]');
      if (back) (back as HTMLElement).style.display = 'none';
    });

    await expect(page).toHaveScreenshot('module-test-full.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  // Per-module screenshots — failures tell you exactly which module regressed
  const MODULES: Array<{ name: string; selector: string }> = [
    { name: 'byline', selector: '.article-byline' },
    { name: 'innhold-fra', selector: '.article-innhold-fra' },
    { name: 'kontaktkort', selector: '.article-kontaktkort' },
    { name: 'prosessteg', selector: '.article-prosessteg' },
    { name: 'fremheving', selector: '.article-fremheving' },
    { name: 'trekkspill', selector: '.article-accordion' },
    { name: 'image-section', selector: '.article-image-section' },
  ];

  for (const { name, selector } of MODULES) {
    test(`module: ${name}`, async ({ page }) => {
      const r = await page.goto(`/artikler/${SLUG}`);
      test.skip(r?.status() !== 200, `Article /artikler/${SLUG} not found`);

      const el = page.locator(selector).first();
      const exists = (await el.count()) > 0;
      test.skip(!exists, `No ${selector} block in module-test article — add one`);

      await expect(el).toHaveScreenshot(`module-${name}.png`, {
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});
