import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for ki.norge.no smoke tests.
 *
 * Run: npx playwright test                     (against prod by default)
 *      npx playwright test --project=local     (against localhost)
 *      TARGET=local npx playwright test        (same)
 *
 * Auth credentials default to the unattended-install admin. Override via
 * env vars CMS_USER and CMS_PASS in CI.
 */
const TARGET = process.env.TARGET || 'prod';

const FRONTEND = TARGET === 'local'
  ? 'http://localhost:4321'
  : 'https://ki-norge-frontend-prod.digitaliseringsdirektoratet.workers.dev';

const CMS = TARGET === 'local'
  ? 'http://localhost:5000'
  : 'https://kinorgeportal.prod.dis-core.altinn.cloud';

export default defineConfig({
  testDir: '.',
  fullyParallel: false, // CMS tests share state — run sequentially
  workers: 1,
  reporter: 'list',
  timeout: 60_000,

  use: {
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'frontend',
      testDir: './frontend',
      use: { ...devices['Desktop Chrome'], baseURL: FRONTEND },
    },
    {
      name: 'cms',
      testDir: './cms',
      use: { ...devices['Desktop Chrome'], baseURL: CMS },
    },
  ],
});

export { FRONTEND, CMS };
