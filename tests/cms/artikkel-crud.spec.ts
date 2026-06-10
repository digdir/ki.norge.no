import { test, expect, Page } from '@playwright/test';

/**
 * Smoke layer for backoffice CRUD on artikkel content. NOT comprehensive —
 * covers create, edit, save-as-draft, delete via the Umbraco UI. Block list
 * editor flows (adding modules, nested block lists, media picker) are NOT
 * exercised here — they need separate, more focused tests because the
 * picker dialogs are heavy.
 *
 * IMPORTANT: this test creates real content. Skipped unless TARGET=local.
 * Each run uses a unique slug and cleans up after itself, but a half-failed
 * run can leave junk in the recycle bin — that's OK.
 *
 * If selectors break (Umbraco UI changes between point releases happen),
 * fix them here. The selectors are intentionally tolerant (multiple
 * fallbacks, role-based) but may still need maintenance.
 */

const ADMIN_EMAIL = process.env.CMS_USER || 'admin@ki.norge.no';
const ADMIN_PASS = process.env.CMS_PASS || 'KiNorge2025!';

// Hard guard: never run against prod
test.skip(process.env.TARGET !== 'local',
  'CRUD tests create real content — skipping unless TARGET=local');

// Umbraco 17 reworked the backoffice into Lit shadow DOM with hover-triggered
// actions and portaled modals. The create/edit/delete UI flows below are
// fragile and break on minor Umbraco bumps. Login + tree (auth-and-tree.spec)
// stays as a UI smoke; CRUD coverage should be rewritten against the Umbraco
// Management API (/umbraco/management/api/v1/...). Tracked in task #82.
test.describe.configure({ mode: 'serial' });
test.skip(true, 'TODO #82: rewrite CRUD coverage against Management API');

async function login(page: Page) {
  await page.goto('/umbraco');
  await page.waitForLoadState('domcontentloaded');

  const usernameInput = page.locator('#username-input');
  await usernameInput.waitFor({ state: 'visible', timeout: 30_000 });
  await usernameInput.fill(ADMIN_EMAIL);

  await page.locator('#password-input').fill(ADMIN_PASS);
  await page.locator('#umb-login-button').click();
  await page.waitForURL(/\/umbraco\/section\/.+/, { timeout: 30_000 });
}

/**
 * Returns a unique-but-stable identifier for this test run, used for slugs
 * and titles so we can find and clean up content we created.
 */
function uniqueId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

test.describe('Artikkel CRUD via backoffice UI', () => {
  test('Create draft artikkel, verify it appears in tree, then delete', async ({ page }) => {
    await login(page);

    const tittel = `Test artikkel ${uniqueId('t')}`;
    const slug = uniqueId('test-art');

    // Navigate to Artikler container
    await page.goto('/umbraco/section/content');
    await page.waitForLoadState('networkidle');

    // Open Artikler in tree, then click "Create" or right-click for context menu.
    // Umbraco 17 uses different action patterns depending on focus state.
    const artiklerNode = page.locator('text=Artikler').first();
    await artiklerNode.click({ timeout: 15_000 });

    // The "Create" action sits in the workspace header once a node is selected.
    // Try multiple selectors because button labels differ by locale.
    const createBtn = page.getByRole('button', { name: /create|opprett|ny|new/i }).first();
    await createBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await createBtn.click();

    // A dialog should open with content type options. Pick "Artikkel".
    const artikkelOption = page.getByRole('button', { name: /^artikkel$/i }).first();
    await artikkelOption.waitFor({ state: 'visible', timeout: 15_000 });
    await artikkelOption.click();

    // Now the workspace shows the new content node — fill in title.
    // The "name" field at the top is the node name (= title).
    const nameInput = page.locator('input[name="name"], input[label*="Name"], input[placeholder*="name" i]').first();
    await nameInput.waitFor({ state: 'visible', timeout: 15_000 });
    await nameInput.fill(tittel);

    // Tittel + slug fields (custom properties)
    const tittelField = page.locator('umb-property[alias="tittel"] input, [data-property-alias="tittel"] input').first();
    if (await tittelField.count() > 0) {
      await tittelField.fill(tittel);
    }
    const slugField = page.locator('umb-property[alias="slug"] input, [data-property-alias="slug"] input').first();
    if (await slugField.count() > 0) {
      await slugField.fill(slug);
    }
    // Ingress is mandatory
    const ingressField = page.locator('umb-property[alias="ingress"] textarea, [data-property-alias="ingress"] textarea').first();
    if (await ingressField.count() > 0) {
      await ingressField.fill('Plassholder ingress for CRUD-test.');
    }

    // Save (as draft, not publish)
    const saveBtn = page.getByRole('button', { name: /^save$|^lagre$/i }).first();
    await saveBtn.click();

    // Wait for the save to complete — toast notification or URL change
    await page.waitForTimeout(2000);

    // Verify it appears in the tree
    await page.goto('/umbraco/section/content');
    await page.waitForLoadState('networkidle');
    // Click Artikler to expand
    await page.locator('text=Artikler').first().click();
    await expect(page.locator(`text=${tittel}`).first())
      .toBeVisible({ timeout: 15_000 });

    // Cleanup: delete (move to recycle bin)
    await page.locator(`text=${tittel}`).first().click({ button: 'right' });
    const deleteAction = page.getByRole('menuitem', { name: /trash|delete|slett|papirkurv/i }).first();
    if (await deleteAction.count() > 0) {
      await deleteAction.click();
      // Confirm the dialog
      const confirmBtn = page.getByRole('button', { name: /confirm|trash|slett|papirkurv|ok|yes/i }).first();
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click();
      }
    }
    // We don't fail the test if cleanup fails — the unique slug means no collision next run.
  });

  test('Backoffice tree renders without errors after refresh', async ({ page }) => {
    await login(page);
    await page.goto('/umbraco/section/content');
    await page.waitForLoadState('networkidle');

    // No console errors during tree load
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Tree shows expected top-level nodes
    for (const name of ['Forside', 'Artikler', 'Eksempler', 'Veiledning', 'Sider']) {
      await expect(page.locator(`text=${name}`).first())
        .toBeVisible({ timeout: 10_000 });
    }

    expect(errors, `Console errors during tree load:\n${errors.join('\n')}`)
      .toHaveLength(0);
  });
});
