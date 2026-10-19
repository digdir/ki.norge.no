import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import contentRoutesConfig from '../../../../shared/content-routes.json';
import { buildUrlForContent, NEEDS_ANCESTORS } from './umbraco';

type Item = { contentType: string; id?: string; properties?: Record<string, unknown> };

function item(contentType: string, slug?: string, id = 'abc'): Item {
  return { contentType, id, properties: slug !== undefined ? { slug } : {} };
}

// Guards against the routes file and the pattern interpolator diverging from the implementation.
// shared/content-routes.json is the only source. The CMS mirror is generated at build
// (scripts/sync-content-routes.js), so it must not be edited by hand.
// If you add a new content type in shared/content-routes.json and the pattern
// uses {<X>.slug}: add X to the ancestor mock here.

describe('buildUrlForContent', () => {
  describe('flat content types (only {slug} or static)', () => {
    test.each([
      ['artikkel', 'min-artikkel', '/artikler/min-artikkel'],
      ['eksempel', 'min-case', '/eksempler/min-case'],
      ['enkelVeiledning', 'kom-igang', '/veiledning/kom-igang'],
      ['veiledningGuide', 'sett-igang-med-ki', '/veiledning/sett-igang-med-ki'],
      ['side', 'en-side', '/en-side'],
      ['kalenderhendelse', 'markedsdialog', '/kalender/markedsdialog'],
    ])('%s with slug %s → %s', (type, slug, expected) => {
      expect(buildUrlForContent(item(type, slug), [])).toBe(expected);
    });

    test.each([
      ['forside', '/'],
      ['omOss', '/om-oss'],
      ['sandkasse', '/sandkasse'],
      ['artikler', '/artikler'],
      ['eksempler', '/eksempler'],
      ['kalender', '/kalender'],
      ['veiledninger', '/veiledning'],
    ])('%s (static route) → %s', (type, expected) => {
      expect(buildUrlForContent(item(type, 'irrelevant'), [])).toBe(expected);
    });
  });

  describe('nested content types (ancestor slug)', () => {
    test('veiledningSteg requires a veiledningGuide ancestor', () => {
      const guide = { contentType: 'veiledningGuide', properties: { slug: 'guide-a' } };
      expect(buildUrlForContent(item('veiledningSteg', 'steg-1'), [guide]))
        .toBe('/veiledning/guide-a/steg-1');
    });

    test('stegartikkel requires both veiledningGuide and veiledningSteg', () => {
      const guide = { contentType: 'veiledningGuide', properties: { slug: 'guide-a' } };
      const step = { contentType: 'veiledningSteg', properties: { slug: 'steg-1' } };
      expect(buildUrlForContent(item('stegartikkel', 'artikkel-x'), [guide, step]))
        .toBe('/veiledning/guide-a/steg-1/artikkel-x');
    });

    test('stegartikkel without ancestors falls back to "#"', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(buildUrlForContent(item('stegartikkel', 'foo'), [])).toBe('#');
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    test('veiledningSteg without a guide ancestor falls back to "#"', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(buildUrlForContent(item('veiledningSteg', 'steg'), [])).toBe('#');
      warn.mockRestore();
    });
  });

  describe('NEEDS_ANCESTORS derivation from patterns', () => {
    test('includes types whose pattern references an ancestor slug', () => {
      expect(NEEDS_ANCESTORS.has('veiledningSteg')).toBe(true);
      expect(NEEDS_ANCESTORS.has('stegartikkel')).toBe(true);
    });

    test('excludes flat types', () => {
      expect(NEEDS_ANCESTORS.has('artikkel')).toBe(false);
      expect(NEEDS_ANCESTORS.has('forside')).toBe(false);
      expect(NEEDS_ANCESTORS.has('veiledningGuide')).toBe(false);
    });

    test('matches what the patterns actually use', () => {
      // Source of truth: shared/content-routes.json. If the file gets new nested types,
      // NEEDS_ANCESTORS must pick them up automatically.
      for (const [type, pattern] of Object.entries(contentRoutesConfig.routes)) {
        const hasAncestorToken = /\{[a-zA-Z][a-zA-Z0-9]*\.slug\}/.test(pattern);
        expect(NEEDS_ANCESTORS.has(type)).toBe(hasAncestorToken);
      }
    });
  });

  describe('error handling', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
      warnSpy.mockRestore();
    });

    test('an unknown content type returns "#" and warns once per type', () => {
      expect(buildUrlForContent(item('helt-ny-type', 'foo'), [])).toBe('#');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      // Second call: no new warn (warns once per type)
      buildUrlForContent(item('helt-ny-type', 'foo'), []);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    test('the warn message points the user to shared/content-routes.json', () => {
      buildUrlForContent(item('annen-helt-ny-type'), []);
      const msg = String(warnSpy.mock.calls[0]?.[0] ?? '');
      expect(msg).toContain('annen-helt-ny-type');
      expect(msg).toMatch(/shared\/content-routes\.json/);
    });
  });

  describe('all routes in the JSON are covered', () => {
    // Ensures every route in the file gives a valid URL (not "#") when the right
    // ancestors exist. Catches misspelled patterns and forgotten ancestor mocks.
    test.each(Object.keys(contentRoutesConfig.routes))('%s does not give "#" with the right data', (type) => {
      const ancestors = [
        { contentType: 'veiledningGuide', properties: { slug: 'g' } },
        { contentType: 'veiledningSteg', properties: { slug: 's' } },
      ];
      const url = buildUrlForContent(item(type, 'min-slug'), ancestors);
      expect(url).not.toBe('#');
      expect(url.startsWith('/')).toBe(true);
    });
  });
});
