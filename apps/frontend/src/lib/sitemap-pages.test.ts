import { describe, expect, test } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import contentRoutesConfig from '../../../../shared/content-routes.json';
import { STATIC_ROUTES, isExcludedPath } from './sitemap';

// Regression net for the original bug: a new static .astro page must
// not silently drop out of the sitemap. The test lists the pages, removes dynamic
// and deliberately excluded routes, and requires each remaining static page
// to be covered either by a singleton content type or by STATIC_ROUTES.

const PAGES_DIR = fileURLToPath(new URL('../pages', import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.astro')) out.push(full);
  }
  return out;
}

function fileToRoute(file: string): string {
  let rel = relative(PAGES_DIR, file).replaceAll('\\', '/').replace(/\.astro$/, '');
  if (rel === 'index') return '/';
  rel = rel.replace(/\/index$/, '');
  return `/${rel}`;
}

// Singleton routes: fixed paths in content-routes.json (without {token}). These
// are covered by a published singleton node that the crawl picks up.
const SINGLETON_ROUTES = new Set(
  Object.values(contentRoutesConfig.routes).filter((pattern) => !pattern.includes('{')),
);

describe('the sitemap covers all static .astro pages', () => {
  const pages = walk(PAGES_DIR);

  test('there are .astro pages to check', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const file of pages) {
    const route = fileToRoute(file);

    // Dynamic (content-driven) or deliberately excluded → no sitemap decision needed.
    if (route.includes('[') || isExcludedPath(route)) continue;

    test(`${route} is covered by a singleton or STATIC_ROUTES`, () => {
      const covered = SINGLETON_ROUTES.has(route) || STATIC_ROUTES.includes(route);
      expect(
        covered,
        `Static page ${route} is missing a sitemap decision. Add it to STATIC_ROUTES in sitemap.ts, or exclude it via EXCLUDED_PATH_PREFIXES.`,
      ).toBe(true);
    });
  }
});
