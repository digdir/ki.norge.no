import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { FALLBACK_CSP, INLINE_SCRIPT_FILES } from './csp';

/**
 * script-src does not have 'unsafe-inline'. Astro hashes the scripts it bundles itself,
 * but not is:inline. An is:inline script that is not hashed gets blocked in
 * the browser without the build or the tests noticing. Therefore each of them must
 * be a file in INLINE_SCRIPT_FILES, which astro.config.mjs hashes.
 */

const FRONTEND_DIR = new URL('../..', import.meta.url).pathname;
const SRC_DIR = join(FRONTEND_DIR, 'src');

function astroFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return astroFiles(full);
    return entry.endsWith('.astro') ? [full] : [];
  });
}

function inlineScripts(source: string): string[] {
  return [...source.matchAll(/<script\b[^>]*\bis:inline\b[^>]*>/g)].map((m) => m[0]);
}

describe('inline scripts and CSP', () => {
  const files = astroFiles(SRC_DIR).filter((f) => inlineScripts(readFileSync(f, 'utf8')).length > 0);

  test('script-src in the fallback policy does not allow inline', () => {
    const scriptSrc = FALLBACK_CSP.split('; ').find((d) => d.startsWith('script-src '));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  test('finds the is:inline scripts', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test.each(files.map((f) => [relative(SRC_DIR, f), f]))('%s', (_navn, full) => {
    const source = readFileSync(full, 'utf8');
    for (const tag of inlineScripts(source)) {
      const variable = tag.match(/set:html=\{(\w+)\}/)?.[1];
      expect(variable, `${tag} must load the script from a file with set:html, not have it inline.`).toBeDefined();

      const importPath = source.match(new RegExp(`import ${variable} from '([^']+)\\?raw'`))?.[1];
      expect(importPath, `${variable} must be imported with ?raw.`).toBeDefined();

      const file = relative(FRONTEND_DIR, resolve(dirname(full), importPath!));
      expect(INLINE_SCRIPT_FILES, `${file} is missing from INLINE_SCRIPT_FILES and is not hashed.`).toContain(file);
    }
  });
});
