import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * JSON-LD must be in Layout's head slot, never in the default slot.
 *
 * The reason is layout and not SEO: main has a negative top margin, and the compensation
 * targets `main > :first-child`. A <script> is not rendered, so when it ended up
 * first in main the padding disappeared and the page heading sat on top of the header.
 * That happened in #678 on four overview pages and was live for three days.
 *
 * A static check rather than a render test, because the bug is structural and
 * visible in the source.
 */

const PAGES_DIR = new URL('../pages', import.meta.url).pathname;

function astroFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return astroFiles(full);
    return entry.endsWith('.astro') ? [full] : [];
  });
}

// Removes the content of each <Fragment slot="head">...</Fragment>, so that what
// remains is everything that ends up in the default slot.
function utenforHeadSlot(source: string): string {
  return source.replace(/<Fragment\s+slot="head">[\s\S]*?<\/Fragment>/g, '');
}

describe('JSON-LD is in the head slot', () => {
  const files = astroFiles(PAGES_DIR);

  test('finds page files to check', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  test.each(files.map((f) => [f.slice(PAGES_DIR.length + 1), f]))(
    '%s',
    (_navn, full) => {
      const source = readFileSync(full, 'utf8');
      if (!source.includes('application/ld+json')) return;

      expect(
        utenforHeadSlot(source),
        'JSON-LD outside <Fragment slot="head">. A script as the first child in main ' +
          'removes the compensation for the negative top margin, and the heading collides with the header.',
      ).not.toContain('application/ld+json');
    },
  );
});
