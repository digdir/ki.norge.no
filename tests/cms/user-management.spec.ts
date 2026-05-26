import { test, expect, Page } from '@playwright/test';

/**
 * Regression tests for backoffice user management — created after a silent
 * 400 from the change-password endpoint (Umbraco gives no inline UI feedback
 * when the new password fails policy, see issue note 2026-05-10).
 *
 * Covers:
 *   1. Admin can create a new user via the UI
 *   2. Strong password is accepted on the change-password dialog
 *   3. Weak password is rejected with feedback (not silently)
 *
 * Skipped unless TARGET=local because creating real users in prod is bad.
 */

const ADMIN_EMAIL = process.env.CMS_USER || 'admin@ki.norge.no';
const ADMIN_PASS = process.env.CMS_PASS || 'KiNorge2025!';

const STRONG_PASSWORD = 'SterktPassord!2026';
const WEAK_PASSWORD = 'kort1';

test.skip(process.env.TARGET !== 'local',
  'User management tests create real users — skipping unless TARGET=local');

// See artikkel-crud.spec.ts for the same TODO note — Umbraco 17 UI flows
// (hover-triggered actions, portaled modals) are too brittle to drive
// reliably. Migrate to Management API. Tracked in task #82.
test.skip(true, 'TODO #82: rewrite user-management coverage against Management API');

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

function uniqueEmail(): string {
  return `test-pw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}@test.example`;
}

async function createTestUser(page: Page, email: string, name: string) {
  await page.goto('/umbraco/section/user-management');
  await page.waitForLoadState('networkidle');

  const createBtn = page.getByRole('button', { name: /create|opprett|new/i }).first();
  await createBtn.waitFor({ state: 'visible', timeout: 15_000 });
  await createBtn.click();

  const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
  await nameInput.fill(name);

  const emailInput = page.locator('input[name="email"], input[type="email"]').first();
  await emailInput.fill(email);

  // Pick "Administrators" group so the user has permissions
  const adminsCheckbox = page.locator('text=Administrators').first();
  if (await adminsCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
    await adminsCheckbox.click();
  }

  const submitBtn = page.getByRole('button', { name: /create|opprett|save/i }).last();
  await submitBtn.click();

  // Wait for the user detail view to appear (URL contains user id)
  await page.waitForURL(/\/user\/edit\/[a-f0-9-]+/, { timeout: 15_000 });
}

async function openChangePasswordDialog(page: Page) {
  // Three-dots menu top right of the user view
  const menuBtn = page.locator('button[aria-label*="menu" i], button[aria-label*="actions" i]').first();
  await menuBtn.click();

  const changePwItem = page.getByRole('menuitem', { name: /change.*password|endre.*passord/i }).first();
  await changePwItem.click();
}

async function submitPasswordDialog(page: Page, password: string) {
  const newPwInput = page.locator('input[label*="New password" i], input[name*="newPassword"]').first();
  const confirmPwInput = page.locator('input[label*="Confirm" i], input[name*="confirm"]').first();
  await newPwInput.fill(password);
  await confirmPwInput.fill(password);

  await page.getByRole('button', { name: /confirm|bekreft|save|ok/i }).last().click();
}

test.describe('Backoffice user management', () => {
  test('Admin can create a new user', async ({ page }) => {
    await login(page);
    const email = uniqueEmail();
    await createTestUser(page, email, 'Test PW Create');
    // The detail view shows the email in the email field
    await expect(page.locator(`text=${email}`).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Strong password is accepted on change-password', async ({ page }) => {
    await login(page);
    const email = uniqueEmail();
    await createTestUser(page, email, 'Test PW Strong');

    await openChangePasswordDialog(page);
    await submitPasswordDialog(page, STRONG_PASSWORD);

    // Dialog should close (no longer visible) and no error notification
    await expect(page.locator('text=/an error occurred|en feil oppstod/i')).toHaveCount(0, { timeout: 5000 });
  });

  test('Weak password is rejected with visible feedback (regression: silent 400)', async ({ page }) => {
    await login(page);
    const email = uniqueEmail();
    await createTestUser(page, email, 'Test PW Weak');

    await openChangePasswordDialog(page);
    await submitPasswordDialog(page, WEAK_PASSWORD);

    // Either the dialog stays open (rejecting client-side) OR a visible error
    // notification appears. NOT acceptable: dialog closes silently and password
    // wasn't changed (the bug we're guarding against).
    const errorVisible = await page.locator('text=/error|feil|password|passord/i').first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    const dialogStillOpen = await page.locator('input[name*="newPassword"], input[label*="New password" i]')
      .first().isVisible({ timeout: 1000 }).catch(() => false);

    expect(errorVisible || dialogStillOpen,
      'Weak password change must either stay in dialog or show an error — silent close is the regression').toBeTruthy();
  });
});
