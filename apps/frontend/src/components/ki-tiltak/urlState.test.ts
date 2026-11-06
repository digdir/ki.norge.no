import { describe, expect, test } from 'vitest';
import { FILTERVALG, IKKE_DEFINERT, TOMT_FILTER } from '../../lib/ki-tiltak';
import { lesUrlTilstand, skrivUrlTilstand } from './urlState';

const BASE = 'https://ki.norge.no/ki-tiltak';
const fagomrade = FILTERVALG.fagomrade[0];
const [fase1, fase2] = FILTERVALG.fase;

describe('lesUrlTilstand', () => {
  test('an empty query string gives the empty filter on page 1', () => {
    expect(lesUrlTilstand(new URLSearchParams())).toEqual({ filter: TOMT_FILTER, page: 1 });
  });

  test('reads search, repeated filter values and page', () => {
    const params = new URLSearchParams();
    params.set('sok', 'chatbot');
    params.append('fase', fase1);
    params.append('fase', fase2);
    params.append('kitype', IKKE_DEFINERT);
    params.set('side', '3');

    const { filter, page } = lesUrlTilstand(params);
    expect(filter.query).toBe('chatbot');
    expect(filter.fase).toEqual([fase1, fase2]);
    expect(filter.kiType).toEqual([IKKE_DEFINERT]);
    expect(page).toBe(3);
  });

  test('drops unknown and duplicate filter values', () => {
    const params = new URLSearchParams([
      ['fagomrade', 'Finnes ikke'],
      ['fagomrade', fagomrade],
      ['fagomrade', fagomrade],
    ]);
    expect(lesUrlTilstand(params).filter.fagomrade).toEqual([fagomrade]);
  });

  test.each(['0', '-2', 'abc', ''])('falls back to page 1 for side=%s', (side) => {
    expect(lesUrlTilstand(new URLSearchParams({ side })).page).toBe(1);
  });
});

describe('skrivUrlTilstand', () => {
  test('leaves the plain page with its plain address', () => {
    expect(skrivUrlTilstand(new URL(BASE), { filter: TOMT_FILTER, page: 1 }).href).toBe(BASE);
  });

  test('keeps other parameters, such as the open tiltak', () => {
    const url = skrivUrlTilstand(new URL(`${BASE}?tiltak=abc&sok=gammel`), {
      filter: { ...TOMT_FILTER, query: 'ny' },
      page: 2,
    });
    expect(url.searchParams.get('tiltak')).toBe('abc');
    expect(url.searchParams.get('sok')).toBe('ny');
    expect(url.searchParams.get('side')).toBe('2');
  });

  test('removes values that are no longer set', () => {
    const url = skrivUrlTilstand(new URL(`${BASE}?sok=x&fase=${encodeURIComponent(fase1)}&side=4`), {
      filter: TOMT_FILTER,
      page: 1,
    });
    expect(url.href).toBe(BASE);
  });

  test('round-trips through lesUrlTilstand', () => {
    const state = {
      filter: { ...TOMT_FILTER, query: 'tale til tekst', fagomrade: [fagomrade], fase: [fase1, fase2] },
      page: 5,
    };
    const url = skrivUrlTilstand(new URL(BASE), state);
    expect(lesUrlTilstand(url.searchParams)).toEqual(state);
  });
});
