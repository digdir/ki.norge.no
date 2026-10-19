import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { sammenlignPublisertDato, velgPublisertDato } from './umbraco';

/**
 * The "Publisert" date must come from createDate, never from updateDate.
 *
 * With updateDate the date moved every time an editor fixed a typo.
 * Measured in prod, 5 of 36 dated nodes were off by more than 30 days, the worst by 88
 * days: an article created on 11 June showed 8 September.
 *
 * Static checks rather than render tests, same reasoning as in
 * jsonld-plassering.test.ts: the bug is structural and visible in the source, and
 * the precedence in ArticleLayout can be locked without rendering an Astro component.
 */

const umbracoKilde = readFileSync(new URL('./umbraco.ts', import.meta.url).pathname, 'utf-8');
const articleLayoutKilde = readFileSync(
  new URL('../components/shared/ArticleLayout.astro', import.meta.url).pathname,
  'utf-8',
);

describe('the publishedAt source', () => {
  test('no publishedAt is taken from updateDate', () => {
    const treff = umbracoKilde
      .split('\n')
      .map((linje, i) => ({ linje: linje.trim(), nr: i + 1 }))
      .filter(({ linje }) => /^publishedAt:\s*[A-Za-z_$][\w$.]*\.updateDate\b/.test(linje));

    expect(treff.map((t) => `line ${t.nr}: ${t.linje}`)).toEqual([]);
  });

  test('publishedAt is only assigned from approved sources', () => {
    // Either the raw createDate, or the resolved chain in velgPublisertDato, or
    // base.publishedAt which is itself createDate. Never anything else.
    const godkjent = /(\.createDate\b|velgPublisertDato\(|base\.publishedAt\b)/;
    const linjer = umbracoKilde.split('\n').map((l) => l.trim());

    const tilordninger = linjer
      .map((linje, i) => {
        if (!/^publishedAt:/.test(linje)) return null;
        // Type declarations in the interfaces are not assignments.
        if (/^publishedAt\??:\s*(string|number)\s*;?$/.test(linje)) return null;
        // The value can be on the line below when the expression is wrapped.
        return linje === 'publishedAt:' ? `${linje} ${linjer[i + 1] ?? ''}` : linje;
      })
      .filter((l): l is string => l !== null);

    // At least mapItem, veiledningGuide, kalenderhendelse and the search hit.
    expect(tilordninger.length).toBeGreaterThanOrEqual(4);
    expect(tilordninger.filter((t) => !godkjent.test(t))).toEqual([]);
  });
});

describe('the byline date wins over publishedAt', () => {
  test('ArticleLayout keeps the precedence', () => {
    // The editor can override the date in the artikkelByline block. It must win
    // also after publishedAt changed source, otherwise the editorial team loses the
    // only way to set a date themselves.
    expect(articleLayoutKilde).toMatch(/byline\?\.dato\s*\|\|\s*publishedAt/);
  });

  test('the precedence comes before the date formatting', () => {
    const iForrang = articleLayoutKilde.indexOf('byline?.dato');
    const iFormat = articleLayoutKilde.indexOf('toLocaleDateString');
    expect(iForrang).toBeGreaterThan(-1);
    expect(iFormat).toBeGreaterThan(iForrang);
  });
});

describe('velgPublisertDato: the order', () => {
  const OPPRETTET = '2026-06-01T10:00:00Z';
  const BYLINE = '2026-07-01T10:00:00Z';
  const OVERSTYRT = '2026-08-01T10:00:00Z';
  const medByline = (dato: string) => [
    { contentType: 'artikkelTekst', content: {} },
    { contentType: 'artikkelByline', content: { dato } },
  ];

  test('publisertDato wins over both byline and created', () => {
    expect(
      velgPublisertDato({
        publisertDato: OVERSTYRT,
        publishedAt: OPPRETTET,
        innhold: medByline(BYLINE),
      }),
    ).toBe(OVERSTYRT);
  });

  test('byline wins when publisertDato is empty', () => {
    expect(
      velgPublisertDato({ publisertDato: '', publishedAt: OPPRETTET, innhold: medByline(BYLINE) }),
    ).toBe(BYLINE);
  });

  test('created is used when neither of the two is set', () => {
    expect(
      velgPublisertDato({ publisertDato: '', publishedAt: OPPRETTET, innhold: medByline('') }),
    ).toBe(OPPRETTET);
  });

  test('empty string and only spaces count as not set', () => {
    expect(velgPublisertDato({ publisertDato: '   ', publishedAt: OPPRETTET })).toBe(OPPRETTET);
  });

  test('no date at all gives undefined', () => {
    expect(velgPublisertDato({})).toBeUndefined();
    expect(velgPublisertDato(null)).toBeUndefined();
  });

  test('sorting uses the same chain, newest first, undated last', () => {
    const a = { publishedAt: OPPRETTET };
    const b = { publisertDato: OVERSTYRT, publishedAt: OPPRETTET };
    const c = {};
    expect([a, b, c].sort(sammenlignPublisertDato)).toEqual([b, a, c]);
  });
});
