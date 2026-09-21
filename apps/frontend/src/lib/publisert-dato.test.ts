import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

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

  test('alle publishedAt-tilordninger bruker createDate', () => {
    const tilordninger = umbracoKilde
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^publishedAt:\s*[A-Za-z_$][\w$.]*\./.test(l));

    // Minst mapItem, kalenderhendelse og søketreffet.
    expect(tilordninger.length).toBeGreaterThanOrEqual(3);
    const feil = tilordninger.filter((t) => !/\.createDate\b/.test(t));
    expect(feil).toEqual([]);
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
