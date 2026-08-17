import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * JSON-LD skal ligge i Layout sin head-slot, aldri i standard-slotten.
 *
 * Årsaken er layout og ikke SEO: main har negativ toppmargin, og kompensasjonen
 * treffer `main > :first-child`. Et <script> rendres ikke, så når det havnet
 * først i main forsvant padding-en og sidens overskrift la seg oppå headeren.
 * Det skjedde i #678 på fire oversiktssider og var live i tre dager.
 *
 * En statisk sjekk framfor en render-test, fordi feilen er strukturell og
 * synlig i kilden.
 */

const PAGES_DIR = new URL('../pages', import.meta.url).pathname;

function astroFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return astroFiles(full);
    return entry.endsWith('.astro') ? [full] : [];
  });
}

// Fjerner innholdet i hver <Fragment slot="head">...</Fragment>, slik at det som
// står igjen er alt som havner i standard-slotten.
function utenforHeadSlot(source: string): string {
  return source.replace(/<Fragment\s+slot="head">[\s\S]*?<\/Fragment>/g, '');
}

describe('JSON-LD ligger i head-slotten', () => {
  const files = astroFiles(PAGES_DIR);

  test('finner sidefiler å sjekke', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  test.each(files.map((f) => [f.slice(PAGES_DIR.length + 1), f]))(
    '%s',
    (_navn, full) => {
      const source = readFileSync(full, 'utf8');
      if (!source.includes('application/ld+json')) return;

      expect(
        utenforHeadSlot(source),
        'JSON-LD utenfor <Fragment slot="head">. Et script som første barn i main ' +
          'fjerner kompensasjonen for negativ toppmargin, og overskriften kolliderer med headeren.',
      ).not.toContain('application/ld+json');
    },
  );
});
