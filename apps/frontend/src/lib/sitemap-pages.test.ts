import { describe, expect, test } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import contentRoutesConfig from '../../../../shared/content-routes.json';
import { STATIC_ROUTES, isExcludedPath } from './sitemap';

// Regresjonsnett for den opprinnelige feilen: en ny statisk .astro-side skal
// ikke falle stille ut av sitemapet. Testen lister sidene, fjerner dynamiske
// og bevisst ekskluderte ruter, og krever at hver gjenværende statiske side
// enten dekkes av en singleton-innholdstype eller står i STATIC_ROUTES.

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

// Singleton-ruter: faste stier i content-routes.json (uten {token}). Disse
// dekkes av et publisert singleton-node som crawlen plukker opp.
const SINGLETON_ROUTES = new Set(
  Object.values(contentRoutesConfig.routes).filter((pattern) => !pattern.includes('{')),
);

describe('sitemap dekker alle statiske .astro-sider', () => {
  const pages = walk(PAGES_DIR);

  test('det finnes .astro-sider å sjekke', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const file of pages) {
    const route = fileToRoute(file);

    // Dynamisk (innholdsdrevet) eller bevisst ekskludert → ingen sitemap-beslutning nødvendig.
    if (route.includes('[') || isExcludedPath(route)) continue;

    test(`${route} er dekket av en singleton eller STATIC_ROUTES`, () => {
      const covered = SINGLETON_ROUTES.has(route) || STATIC_ROUTES.includes(route);
      expect(
        covered,
        `Statisk side ${route} mangler en sitemap-beslutning. Legg den til STATIC_ROUTES i sitemap.ts, eller ekskluder den via EXCLUDED_PATH_PREFIXES.`,
      ).toBe(true);
    });
  }
});
