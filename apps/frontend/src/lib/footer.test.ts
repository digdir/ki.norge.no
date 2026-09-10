import { describe, expect, test } from 'vitest';
import { footerLenke6 } from './footer';

describe('footerLenke6', () => {
  test('tekst og URL satt gir oppføringen', () => {
    expect(footerLenke6({ footerLenke6Tekst: 'Ledige stillinger', footerLenke6Url: '/ledige-stillingar' }))
      .toEqual({ text: 'Ledige stillinger', url: '/ledige-stillingar' });
  });

  test('tom gir ingen oppføring, og ingen fallback', () => {
    expect(footerLenke6({})).toBeNull();
    expect(footerLenke6({ footerLenke6Tekst: '', footerLenke6Url: '' })).toBeNull();
    expect(footerLenke6(null)).toBeNull();
    expect(footerLenke6(undefined)).toBeNull();
  });

  test('bare det ene feltet er ikke nok', () => {
    expect(footerLenke6({ footerLenke6Tekst: 'Ledige stillinger' })).toBeNull();
    expect(footerLenke6({ footerLenke6Url: '/ledige-stillingar' })).toBeNull();
  });

  test('bare mellomrom teller som tomt', () => {
    expect(footerLenke6({ footerLenke6Tekst: '  ', footerLenke6Url: '  ' })).toBeNull();
    expect(footerLenke6({ footerLenke6Tekst: ' Ledige stillinger ', footerLenke6Url: ' /jobb ' }))
      .toEqual({ text: 'Ledige stillinger', url: '/jobb' });
  });
});
