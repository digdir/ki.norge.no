import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

type RouteExpectation = {
  path: string;
  expectedStatus: number;
};

// Ruter som med vilje ikke finnes. Alt annet i fixturen forventes å svare 200.
const EXPECTED_404 = new Set(['/__does_not_exist__', '/personvern', '/tilgjengelighet']);

function normalizeRoute(p: string): string {
  return p.startsWith('/') ? p : `/${p}`;
}

async function loadRoutesFromFixture(): Promise<RouteExpectation[]> {
  const fixturePath = path.resolve(process.cwd(), 'tests', 'fixtures', 'ruter.md');
  const content = await fs.readFile(fixturePath, 'utf8');

  const paths = new Set<string>();

  const addRoute = (routePath: string) => {
    const normalized = normalizeRoute(routePath);
    // Dynamiske mønstre (/artikler/[slug]) har ingen konkret URL å slå opp.
    if (!normalized.includes('[')) paths.add(normalized);
  };

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();

    // Ruteoverskrift: "### /foo"
    const sectionMatch = /^###\s+(\/\S*)\s*$/.exec(line);
    if (sectionMatch) {
      addRoute(sectionMatch[1]);
      continue;
    }

    // Punktliste med ruter, f.eks. i 404-seksjonen: "- GET /personvern -> 404"
    const bulletMatch = /^-\s*(?:GET\s+)?(\/\S+)/.exec(line);
    if (bulletMatch) addRoute(bulletMatch[1]);
  }

  addRoute('/__does_not_exist__');

  return [...paths].map((p) => ({
    path: p,
    expectedStatus: EXPECTED_404.has(p) ? 404 : 200,
  }));
}

test.describe('Route smoke tests (from tests/fixtures/ruter.md)', () => {
  test('all documented routes respond as expected', async ({ page, baseURL }) => {
    expect(baseURL, 'baseURL must be set (e.g. http://localhost:4321)').toBeTruthy();

    const routes = await loadRoutesFromFixture();
    expect(routes.length).toBeGreaterThan(0);

    const failures: Array<{ path: string; status: number | null; expectedStatus: number }> = [];

    for (const route of routes) {
      const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      const status = response ? response.status() : null;
      if (status !== route.expectedStatus) {
        failures.push({ path: route.path, status, expectedStatus: route.expectedStatus });
      }
    }

    expect(failures, `Route smoke failures:\n${JSON.stringify(failures, null, 2)}`).toEqual([]);
  });
});
