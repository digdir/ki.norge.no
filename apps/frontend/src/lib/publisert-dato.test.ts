import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { sammenlignPublisertDato, velgPublisertDato } from './umbraco';

/**
 * «Publisert»-datoen skal komme fra createDate, aldri fra updateDate.
 *
 * Med updateDate flyttet datoen seg hver gang en redaktør rettet en skrivefeil.
 * Målt i prod hadde 5 av 36 daterte noder over 30 dagers avvik, den verste 88
 * dager: en artikkel opprettet 11. juni viste 8. september.
 *
 * Statiske sjekker framfor render-tester, samme begrunnelse som i
 * jsonld-plassering.test.ts: feilen er strukturell og synlig i kilden, og
 * forrangen i ArticleLayout kan låses uten å rendre en Astro-komponent.
 */

const umbracoKilde = readFileSync(new URL('./umbraco.ts', import.meta.url).pathname, 'utf-8');
const articleLayoutKilde = readFileSync(
  new URL('../components/shared/ArticleLayout.astro', import.meta.url).pathname,
  'utf-8',
);

describe('publishedAt-kilden', () => {
  test('ingen publishedAt hentes fra updateDate', () => {
    const treff = umbracoKilde
      .split('\n')
      .map((linje, i) => ({ linje: linje.trim(), nr: i + 1 }))
      .filter(({ linje }) => /^publishedAt:\s*[A-Za-z_$][\w$.]*\.updateDate\b/.test(linje));

    expect(treff.map((t) => `linje ${t.nr}: ${t.linje}`)).toEqual([]);
  });

  test('publishedAt tilordnes bare fra godkjente kilder', () => {
    // Enten den rå createDate, eller den løste kjeden i velgPublisertDato, eller
    // base.publishedAt som selv er createDate. Aldri noe annet.
    const godkjent = /(\.createDate\b|velgPublisertDato\(|base\.publishedAt\b)/;
    const linjer = umbracoKilde.split('\n').map((l) => l.trim());

    const tilordninger = linjer
      .map((linje, i) => {
        if (!/^publishedAt:/.test(linje)) return null;
        // Typeerklæringer i interface-ene er ikke tilordninger.
        if (/^publishedAt\??:\s*(string|number)\s*;?$/.test(linje)) return null;
        // Verdien kan ligge på linja under når uttrykket er brutt.
        return linje === 'publishedAt:' ? `${linje} ${linjer[i + 1] ?? ''}` : linje;
      })
      .filter((l): l is string => l !== null);

    // Minst mapItem, veiledningGuide, kalenderhendelse og søketreffet.
    expect(tilordninger.length).toBeGreaterThanOrEqual(4);
    expect(tilordninger.filter((t) => !godkjent.test(t))).toEqual([]);
  });
});

describe('byline-datoen vinner over publishedAt', () => {
  test('ArticleLayout beholder forrangen', () => {
    // Redaktøren kan overstyre datoen i artikkelByline-blokka. Den skal vinne
    // også etter at publishedAt byttet kilde, ellers mister redaksjonen den
    // eneste måten å sette en dato selv.
    expect(articleLayoutKilde).toMatch(/byline\?\.dato\s*\|\|\s*publishedAt/);
  });

  test('forrangen står før datoformateringen', () => {
    const iForrang = articleLayoutKilde.indexOf('byline?.dato');
    const iFormat = articleLayoutKilde.indexOf('toLocaleDateString');
    expect(iForrang).toBeGreaterThan(-1);
    expect(iFormat).toBeGreaterThan(iForrang);
  });
});

describe('velgPublisertDato: rekkefoelgen', () => {
  const OPPRETTET = '2026-06-01T10:00:00Z';
  const BYLINE = '2026-07-01T10:00:00Z';
  const OVERSTYRT = '2026-08-01T10:00:00Z';
  const medByline = (dato: string) => [
    { contentType: 'artikkelTekst', content: {} },
    { contentType: 'artikkelByline', content: { dato } },
  ];

  test('publisertDato vinner over baade byline og opprettet', () => {
    expect(
      velgPublisertDato({
        publisertDato: OVERSTYRT,
        publishedAt: OPPRETTET,
        innhold: medByline(BYLINE),
      }),
    ).toBe(OVERSTYRT);
  });

  test('byline vinner naar publisertDato staar tom', () => {
    expect(
      velgPublisertDato({ publisertDato: '', publishedAt: OPPRETTET, innhold: medByline(BYLINE) }),
    ).toBe(BYLINE);
  });

  test('opprettet brukes naar ingen av de to er satt', () => {
    expect(
      velgPublisertDato({ publisertDato: '', publishedAt: OPPRETTET, innhold: medByline('') }),
    ).toBe(OPPRETTET);
  });

  test('tom streng og bare mellomrom teller som ikke satt', () => {
    expect(velgPublisertDato({ publisertDato: '   ', publishedAt: OPPRETTET })).toBe(OPPRETTET);
  });

  test('uten noen dato i det hele tatt gir undefined', () => {
    expect(velgPublisertDato({})).toBeUndefined();
    expect(velgPublisertDato(null)).toBeUndefined();
  });

  test('sortering bruker samme kjede, nyeste foerst, udaterte sist', () => {
    const a = { publishedAt: OPPRETTET };
    const b = { publisertDato: OVERSTYRT, publishedAt: OPPRETTET };
    const c = {};
    expect([a, b, c].sort(sammenlignPublisertDato)).toEqual([b, a, c]);
  });
});
