import { describe, it, expect } from 'vitest';
import { tekstliste, eksempelMerkelapper } from './eksempel-merkelapper';

describe('tekstliste', () => {
  it('gir tom liste når feltet ikke finnes i CMS-et', () => {
    expect(tekstliste(undefined)).toEqual([]);
    expect(tekstliste(null)).toEqual([]);
  });

  it('gir tom liste for tomt felt', () => {
    expect(tekstliste([])).toEqual([]);
    expect(tekstliste('')).toEqual([]);
    expect(tekstliste(['', '  '])).toEqual([]);
  });

  it('beholder rekkefølgen fra CMS-et og trimmer', () => {
    expect(tekstliste([' Prediktiv KI', 'Generativ KI '])).toEqual(['Prediktiv KI', 'Generativ KI']);
  });

  it('tåler enkeltverdi', () => {
    expect(tekstliste('Offentlig sektor')).toEqual(['Offentlig sektor']);
  });

  it('hopper over verdier som ikke er tekst', () => {
    expect(tekstliste(['Generativ KI', 3, { navn: 'x' }])).toEqual(['Generativ KI']);
    expect(tekstliste({ navn: 'x' })).toEqual([]);
  });
});

describe('eksempelMerkelapper', () => {
  it('gir ingen merkelapp uten felt', () => {
    expect(eksempelMerkelapper({})).toEqual([]);
    expect(eksempelMerkelapper({ sektor: [], kiType: [] })).toEqual([]);
  });

  it('setter sektor før type KI', () => {
    expect(eksempelMerkelapper({ kiType: ['Generativ KI', 'Agentisk KI'], sektor: ['Offentlig sektor'] })).toEqual([
      'Offentlig sektor',
      'Generativ KI',
      'Agentisk KI',
    ]);
  });

  it('viser bare det som er satt', () => {
    expect(eksempelMerkelapper({ kiType: ['Språkteknologi'] })).toEqual(['Språkteknologi']);
    expect(eksempelMerkelapper({ sektor: ['Privat sektor'] })).toEqual(['Privat sektor']);
  });

  it('fjerner duplikater', () => {
    expect(eksempelMerkelapper({ kiType: ['Generativ KI', 'Generativ KI'] })).toEqual(['Generativ KI']);
  });
});
