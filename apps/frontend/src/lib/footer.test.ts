import { describe, expect, test } from 'vitest';
import { footerLenke6, privacyNoticeUrl } from './footer';

describe('footerLenke6', () => {
  test('text and URL set gives the entry', () => {
    expect(footerLenke6({ footerLenke6Tekst: 'Ledige stillinger', footerLenke6Url: '/ledige-stillingar' }))
      .toEqual({ text: 'Ledige stillinger', url: '/ledige-stillingar' });
  });

  test('empty gives no entry, and no fallback', () => {
    expect(footerLenke6({})).toBeNull();
    expect(footerLenke6({ footerLenke6Tekst: '', footerLenke6Url: '' })).toBeNull();
    expect(footerLenke6(null)).toBeNull();
    expect(footerLenke6(undefined)).toBeNull();
  });

  test('only one of the fields is not enough', () => {
    expect(footerLenke6({ footerLenke6Tekst: 'Ledige stillinger' })).toBeNull();
    expect(footerLenke6({ footerLenke6Url: '/ledige-stillingar' })).toBeNull();
  });

  test('only spaces count as empty', () => {
    expect(footerLenke6({ footerLenke6Tekst: '  ', footerLenke6Url: '  ' })).toBeNull();
    expect(footerLenke6({ footerLenke6Tekst: ' Ledige stillinger ', footerLenke6Url: ' /jobb ' }))
      .toEqual({ text: 'Ledige stillinger', url: '/jobb' });
  });
});

describe('privacyNoticeUrl', () => {
  test('uses the URL from the CMS when it is set', () => {
    expect(privacyNoticeUrl({ footerLenke2Url: '/personvern' })).toBe('/personvern');
  });

  test('falls back to /personvernerklaering, as the footer always has', () => {
    expect(privacyNoticeUrl(null)).toBe('/personvernerklaering');
    expect(privacyNoticeUrl({ footerLenke2Url: '' })).toBe('/personvernerklaering');
  });
});
