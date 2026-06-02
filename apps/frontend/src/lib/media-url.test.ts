import { describe, expect, test, beforeAll } from 'vitest';

// Regresjonsvern for media-URL-helperne. Umbraco Delivery API gir relative
// media-URLer (/media/...); på Cloudflare hentes de fra frontend-domenet i
// stedet for CMS og gir 404. Helperne gjør dem absolutte mot CMS-hosten.
//
// umbraco.ts leser UMBRACO_PUBLIC_URL fra env ved import, så vi setter en kjent
// host FØR dynamisk import. Da avhenger ikke assertions av .env-innhold.
const CMS = 'https://cms.test.example';

let lib: typeof import('./umbraco');

beforeAll(async () => {
  process.env.UMBRACO_URL = CMS;
  process.env.UMBRACO_PUBLIC_URL = CMS;
  lib = await import('./umbraco');
});

describe('toAbsoluteMediaUrl', () => {
  test('prefikser relativ /media med CMS-host', () => {
    expect(lib.toAbsoluteMediaUrl('/media/x/foo.jpg')).toBe(`${CMS}/media/x/foo.jpg`);
  });
  test('lar allerede-absolutt URL passere', () => {
    expect(lib.toAbsoluteMediaUrl('https://cdn.example/x.jpg')).toBe('https://cdn.example/x.jpg');
  });
  test('rører ikke ikke-media relative URLer (f.eks. /og-image.png)', () => {
    expect(lib.toAbsoluteMediaUrl('/og-image.png')).toBe('/og-image.png');
  });
  test('tom/undefined gir undefined', () => {
    expect(lib.toAbsoluteMediaUrl(undefined)).toBeUndefined();
    expect(lib.toAbsoluteMediaUrl('')).toBeUndefined();
  });
});

describe('getMediaUrl', () => {
  test('gjør media-objektets url absolutt', () => {
    expect(lib.getMediaUrl({ url: '/media/a/b.jpg' } as never)).toBe(`${CMS}/media/a/b.jpg`);
  });
  test('undefined media gir undefined', () => {
    expect(lib.getMediaUrl(undefined)).toBeUndefined();
  });
});

describe('absolutizeMediaUrls (RichText-brødtekst)', () => {
  test('absolutiserer img src', () => {
    expect(lib.absolutizeMediaUrls('<img src="/media/a/b.jpg" alt="x" />'))
      .toBe(`<img src="${CMS}/media/a/b.jpg" alt="x" />`);
  });
  test('absolutiserer a href (fil-lenke)', () => {
    expect(lib.absolutizeMediaUrls('<a href="/media/a/doc.pdf">PDF</a>'))
      .toBe(`<a href="${CMS}/media/a/doc.pdf">PDF</a>`);
  });
  test('rører ikke interne ruter', () => {
    expect(lib.absolutizeMediaUrls('<a href="/artikler/x">lenke</a>'))
      .toBe('<a href="/artikler/x">lenke</a>');
  });
  test('matcher ikke srcset (kun src/href)', () => {
    const html = '<img srcset="/media/a.jpg 1x" />';
    expect(lib.absolutizeMediaUrls(html)).toBe(html);
  });
  test('unngår dobbel-prefiks på allerede absolutt URL', () => {
    const html = `<img src="${CMS}/media/a.jpg" />`;
    expect(lib.absolutizeMediaUrls(html)).toBe(html);
  });
  test('håndterer flere bilder i samme html', () => {
    expect(lib.absolutizeMediaUrls('<img src="/media/a.jpg"/><img src="/media/b.jpg"/>'))
      .toBe(`<img src="${CMS}/media/a.jpg"/><img src="${CMS}/media/b.jpg"/>`);
  });
});
