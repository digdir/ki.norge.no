import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import contentRoutesConfig from '../../../../shared/content-routes.json';
import { buildUrlForContent, NEEDS_ANCESTORS } from './umbraco';

type Item = { contentType: string; id?: string; properties?: Record<string, unknown> };

function item(contentType: string, slug?: string, id = 'abc'): Item {
  return { contentType, id, properties: slug !== undefined ? { slug } : {} };
}

// Vakter mot at routes-fila og pattern-interpolatoren divergerer fra implementasjonen.
// Hvis du legger til en ny content type i shared/content-routes.json:
//   1) Speil endringen i apps/cms-umbraco/content-routes.json (CMS-mirror).
//   2) Hvis pattern bruker {<X>.slug}: legg til X i ancestor-mocken her.

describe('buildUrlForContent', () => {
  describe('flate content types (kun {slug} eller statisk)', () => {
    test.each([
      ['artikkel', 'min-artikkel', '/artikler/min-artikkel'],
      ['eksempel', 'min-case', '/caser/min-case'],
      ['enkelVeiledning', 'kom-igang', '/veiledning/kom-igang'],
      ['veiledningGuide', 'sett-igang-med-ki', '/veiledning/sett-igang-med-ki'],
      ['side', 'kontakt', '/kontakt'],
    ])('%s med slug %s → %s', (type, slug, expected) => {
      expect(buildUrlForContent(item(type, slug), [])).toBe(expected);
    });

    test.each([
      ['forside', '/'],
      ['omOss', '/om-oss'],
      ['sandkasse', '/sandkasse'],
      ['artikler', '/artikler'],
      ['eksempler', '/eksempler'],
      ['kalender', '/kalender'],
      ['kalenderhendelse', '/kalender'],
      ['veiledninger', '/veiledning'],
    ])('%s (statisk rute) → %s', (type, expected) => {
      expect(buildUrlForContent(item(type, 'irrelevant'), [])).toBe(expected);
    });
  });

  describe('nestede content types (ancestor-slug)', () => {
    test('veiledningSteg krever veiledningGuide-ancestor', () => {
      const guide = { contentType: 'veiledningGuide', properties: { slug: 'guide-a' } };
      expect(buildUrlForContent(item('veiledningSteg', 'steg-1'), [guide]))
        .toBe('/veiledning/guide-a/steg-1');
    });

    test('stegartikkel krever både veiledningGuide og veiledningSteg', () => {
      const guide = { contentType: 'veiledningGuide', properties: { slug: 'guide-a' } };
      const step = { contentType: 'veiledningSteg', properties: { slug: 'steg-1' } };
      expect(buildUrlForContent(item('stegartikkel', 'artikkel-x'), [guide, step]))
        .toBe('/veiledning/guide-a/steg-1/artikkel-x');
    });

    test('stegartikkel uten ancestors faller tilbake til "#"', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(buildUrlForContent(item('stegartikkel', 'foo'), [])).toBe('#');
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    test('veiledningSteg uten guide-ancestor faller tilbake til "#"', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(buildUrlForContent(item('veiledningSteg', 'steg'), [])).toBe('#');
      warn.mockRestore();
    });
  });

  describe('NEEDS_ANCESTORS-avledning fra patterns', () => {
    test('inkluderer typer hvis pattern refererer ancestor-slug', () => {
      expect(NEEDS_ANCESTORS.has('veiledningSteg')).toBe(true);
      expect(NEEDS_ANCESTORS.has('stegartikkel')).toBe(true);
    });

    test('utelukker flate typer', () => {
      expect(NEEDS_ANCESTORS.has('artikkel')).toBe(false);
      expect(NEEDS_ANCESTORS.has('forside')).toBe(false);
      expect(NEEDS_ANCESTORS.has('veiledningGuide')).toBe(false);
    });

    test('matcher det patterns faktisk bruker', () => {
      // Sann kilde: shared/content-routes.json. Hvis fila får nye nestede types,
      // skal NEEDS_ANCESTORS automatisk plukke dem opp.
      for (const [type, pattern] of Object.entries(contentRoutesConfig.routes)) {
        const hasAncestorToken = /\{[a-zA-Z][a-zA-Z0-9]*\.slug\}/.test(pattern);
        expect(NEEDS_ANCESTORS.has(type)).toBe(hasAncestorToken);
      }
    });
  });

  describe('feilhåndtering', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
      warnSpy.mockRestore();
    });

    test('ukjent content type returnerer "#" og varsler én gang per type', () => {
      expect(buildUrlForContent(item('helt-ny-type', 'foo'), [])).toBe('#');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      // Andre kall: ingen ny warn (varsler én gang per type)
      buildUrlForContent(item('helt-ny-type', 'foo'), []);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    test('warn-meldingen peker brukeren mot shared/content-routes.json', () => {
      buildUrlForContent(item('annen-helt-ny-type'), []);
      const msg = String(warnSpy.mock.calls[0]?.[0] ?? '');
      expect(msg).toContain('annen-helt-ny-type');
      expect(msg).toMatch(/shared\/content-routes\.json/);
    });
  });

  describe('alle routes i JSON er dekt', () => {
    // Sikrer at hver rute i fila gir en gyldig URL (ikke "#") når riktige
    // ancestors finnes. Fanger feilstavede patterns og glemte ancestor-mocks.
    test.each(Object.keys(contentRoutesConfig.routes))('%s gir ikke "#" med riktig data', (type) => {
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
