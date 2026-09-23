import { describe, it, expect } from 'vitest';
import { bypassesCache, resolvePreview, timingSafeEqual } from './preview';

const SECRET = '59cfdda7b9140784c3c80149b5348d81';

describe('timingSafeEqual', () => {
  it('er sann for like strenger', () => {
    expect(timingSafeEqual(SECRET, SECRET)).toBe(true);
  });

  it('er usann for ulik lengde og for ulikt innhold', () => {
    expect(timingSafeEqual(SECRET, SECRET.slice(0, -1))).toBe(false);
    expect(timingSafeEqual(SECRET, SECRET.replace(/.$/, 'X'))).toBe(false);
  });

  it('håndterer tomme strenger', () => {
    expect(timingSafeEqual('', '')).toBe(true);
    expect(timingSafeEqual('', SECRET)).toBe(false);
  });
});

describe('resolvePreview', () => {
  it('slipper gjennom med riktig hemmelighet i URL-en, og setter cookien', () => {
    expect(
      resolvePreview({ secretParam: SECRET, cookieValue: undefined, configuredSecret: SECRET }),
    ).toEqual({ isPreview: true, shouldSetCookie: true });
  });

  it('slipper gjennom på cookien alene, uten å sette den på nytt', () => {
    expect(
      resolvePreview({ secretParam: null, cookieValue: SECRET, configuredSecret: SECRET }),
    ).toEqual({ isPreview: true, shouldSetCookie: false });
  });

  // Selve lekkasjen: ?preview=true uten hemmelighet ga utkast til hvem som helst.
  it('avviser forespørsel uten hemmelighet', () => {
    expect(
      resolvePreview({ secretParam: null, cookieValue: undefined, configuredSecret: SECRET }),
    ).toEqual({ isPreview: false, shouldSetCookie: false });
  });

  it('avviser feil hemmelighet i URL-en', () => {
    expect(
      resolvePreview({ secretParam: 'gjett', cookieValue: undefined, configuredSecret: SECRET }),
    ).toEqual({ isPreview: false, shouldSetCookie: false });
  });

  // Cookien er klient-kontrollert, så et flagg ville vært trivielt å forfalske.
  it('avviser forfalsket cookie', () => {
    expect(
      resolvePreview({ secretParam: null, cookieValue: '1', configuredSecret: SECRET }),
    ).toEqual({ isPreview: false, shouldSetCookie: false });
  });

  it('er av når ingen hemmelighet er konfigurert, uansett hva som sendes inn', () => {
    expect(
      resolvePreview({ secretParam: '', cookieValue: '', configuredSecret: '' }),
    ).toEqual({ isPreview: false, shouldSetCookie: false });
    expect(
      resolvePreview({ secretParam: SECRET, cookieValue: SECRET, configuredSecret: '' }),
    ).toEqual({ isPreview: false, shouldSetCookie: false });
  });
});

describe('bypassesCache', () => {
  const side = (query: string) => new URL(`https://ki.norge.no/artikler/x${query}`);

  it('slipper vanlige sider inn i cachen', () => {
    expect(bypassesCache(side(''), false)).toBe(false);
    expect(bypassesCache(side('?side=2'), false)).toBe(false);
  });

  // Med bare dommen fikk ?secret=<ekte verdi> public, s-maxage så lenge frontend manglet hemmeligheten.
  it('holder forsøk utenfor cachen også når de ikke slapp gjennom', () => {
    expect(bypassesCache(side('?preview=true'), false)).toBe(true);
    expect(bypassesCache(side(`?preview=true&secret=${SECRET}`), false)).toBe(true);
    expect(bypassesCache(side('?secret=gjett'), false)).toBe(true);
  });

  it('holder godkjent forhåndsvisning utenfor cachen, også uten noe i URL-en', () => {
    expect(bypassesCache(side(''), true)).toBe(true);
  });
});
