import { describe, it, expect } from 'vitest';
import { tekstliste, eksempelMerkelapper } from './eksempel-merkelapper';

describe('tekstliste', () => {
  it('gives an empty list when the field does not exist in the CMS', () => {
    expect(tekstliste(undefined)).toEqual([]);
    expect(tekstliste(null)).toEqual([]);
  });

  it('gives an empty list for an empty field', () => {
    expect(tekstliste([])).toEqual([]);
    expect(tekstliste('')).toEqual([]);
    expect(tekstliste(['', '  '])).toEqual([]);
  });

  it('keeps the order from the CMS and trims', () => {
    expect(tekstliste([' Prediktiv KI', 'Generativ KI '])).toEqual(['Prediktiv KI', 'Generativ KI']);
  });

  it('handles a single value', () => {
    expect(tekstliste('Offentlig sektor')).toEqual(['Offentlig sektor']);
  });

  it('skips values that are not text', () => {
    expect(tekstliste(['Generativ KI', 3, { navn: 'x' }])).toEqual(['Generativ KI']);
    expect(tekstliste({ navn: 'x' })).toEqual([]);
  });
});

describe('eksempelMerkelapper', () => {
  it('gives no label without fields', () => {
    expect(eksempelMerkelapper({})).toEqual([]);
    expect(eksempelMerkelapper({ sektor: [], kiType: [] })).toEqual([]);
  });

  it('puts sector before type of AI', () => {
    expect(eksempelMerkelapper({ kiType: ['Generativ KI', 'Agentisk KI'], sektor: ['Offentlig sektor'] })).toEqual([
      'Offentlig sektor',
      'Generativ KI',
      'Agentisk KI',
    ]);
  });

  it('shows only what is set', () => {
    expect(eksempelMerkelapper({ kiType: ['Språkteknologi'] })).toEqual(['Språkteknologi']);
    expect(eksempelMerkelapper({ sektor: ['Privat sektor'] })).toEqual(['Privat sektor']);
  });

  it('removes duplicates', () => {
    expect(eksempelMerkelapper({ kiType: ['Generativ KI', 'Generativ KI'] })).toEqual(['Generativ KI']);
  });
});
