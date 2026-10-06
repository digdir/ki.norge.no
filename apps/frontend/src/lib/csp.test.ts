import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { FALLBACK_CSP, INLINE_SCRIPT_FILES } from './csp';

/**
 * script-src har ikke 'unsafe-inline'. Astro hasher skriptene det bundler selv,
 * men ikke is:inline. Et is:inline-skript som ikke er hashet, blir blokkert i
 * nettleseren uten at bygget eller testene merker noe. Derfor skal hvert av dem
 * være en fil i INLINE_SCRIPT_FILES, som astro.config.mjs hasher.
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

describe('inline-skript og CSP', () => {
  const files = astroFiles(SRC_DIR).filter((f) => inlineScripts(readFileSync(f, 'utf8')).length > 0);

  test('script-src i reservepolicyen tillater ikke inline', () => {
    const scriptSrc = FALLBACK_CSP.split('; ').find((d) => d.startsWith('script-src '));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  test('finner is:inline-skriptene', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test.each(files.map((f) => [relative(SRC_DIR, f), f]))('%s', (_navn, full) => {
    const source = readFileSync(full, 'utf8');
    for (const tag of inlineScripts(source)) {
      const variable = tag.match(/set:html=\{(\w+)\}/)?.[1];
      expect(variable, `${tag} må hente skriptet fra en fil med set:html, ikke ha det inline.`).toBeDefined();

      const importPath = source.match(new RegExp(`import ${variable} from '([^']+)\\?raw'`))?.[1];
      expect(importPath, `${variable} må importeres med ?raw.`).toBeDefined();

      const file = relative(FRONTEND_DIR, resolve(dirname(full), importPath!));
      expect(INLINE_SCRIPT_FILES, `${file} mangler i INLINE_SCRIPT_FILES og blir ikke hashet.`).toContain(file);
    }
  });
});
