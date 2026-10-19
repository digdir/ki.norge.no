import { describe, expect, test, beforeAll } from 'vitest';

// Regression guard for the media URL helpers. The Umbraco Delivery API gives relative
// media URLs (/media/...); on Cloudflare they are fetched from the frontend domain
// instead of the CMS and give 404. The helpers make them absolute against the CMS host.
//
// umbraco.ts reads UMBRACO_PUBLIC_URL from env at import, so we set a known
// host BEFORE the dynamic import. Then the assertions do not depend on .env content.
const CMS = 'https://cms.test.example';

let lib: typeof import('./umbraco');

beforeAll(async () => {
  process.env.UMBRACO_URL = CMS;
  process.env.UMBRACO_PUBLIC_URL = CMS;
  lib = await import('./umbraco');
});

describe('toAbsoluteMediaUrl', () => {
  test('prefixes relative /media with the CMS host', () => {
    expect(lib.toAbsoluteMediaUrl('/media/x/foo.jpg')).toBe(`${CMS}/media/x/foo.jpg`);
  });
  test('lets an already absolute URL pass', () => {
    expect(lib.toAbsoluteMediaUrl('https://cdn.example/x.jpg')).toBe('https://cdn.example/x.jpg');
  });
  test('does not touch non-media relative URLs (e.g. /og-image.png)', () => {
    expect(lib.toAbsoluteMediaUrl('/og-image.png')).toBe('/og-image.png');
  });
  test('empty/undefined gives undefined', () => {
    expect(lib.toAbsoluteMediaUrl(undefined)).toBeUndefined();
    expect(lib.toAbsoluteMediaUrl('')).toBeUndefined();
  });
});

describe('getMediaUrl', () => {
  test('makes the media object url absolute and optimizes by default (content width, webp)', () => {
    expect(lib.getMediaUrl({ url: '/media/a/b.jpg' } as never))
      .toBe(`${CMS}/media/a/b.jpg?width=${lib.MEDIA_WIDTH.content}&format=webp&quality=80`);
  });
  test('respects an explicit width (e.g. hero)', () => {
    expect(lib.getMediaUrl({ url: '/media/a/b.jpg' } as never, lib.MEDIA_WIDTH.hero))
      .toBe(`${CMS}/media/a/b.jpg?width=${lib.MEDIA_WIDTH.hero}&format=webp&quality=80`);
  });
  test('undefined media gives undefined', () => {
    expect(lib.getMediaUrl(undefined)).toBeUndefined();
  });
});

describe('toAbsoluteMediaUrl with width (delivery resizing)', () => {
  test('adds width/format/quality to a relative media URL', () => {
    expect(lib.toAbsoluteMediaUrl('/media/x/foo.jpg', 800))
      .toBe(`${CMS}/media/x/foo.jpg?width=800&format=webp&quality=80`);
  });
  test('adds params to an already absolute media URL', () => {
    expect(lib.toAbsoluteMediaUrl('https://cdn.example/x.jpg', 800))
      .toBe('https://cdn.example/x.jpg?width=800&format=webp&quality=80');
  });
  test('skips SVG (vectors must not be rasterized)', () => {
    expect(lib.toAbsoluteMediaUrl('/media/x/logo.svg', 800)).toBe(`${CMS}/media/x/logo.svg`);
  });
  test('skips GIF (keeps animation)', () => {
    expect(lib.toAbsoluteMediaUrl('/media/x/anim.gif', 800)).toBe(`${CMS}/media/x/anim.gif`);
  });
  test('without width the media URL is untouched (e.g. og:image)', () => {
    expect(lib.toAbsoluteMediaUrl('/media/x/foo.jpg')).toBe(`${CMS}/media/x/foo.jpg`);
  });
});

describe('absolutizeMediaUrls (RichText body text)', () => {
  test('makes img src absolute', () => {
    expect(lib.absolutizeMediaUrls('<img src="/media/a/b.jpg" alt="x" />'))
      .toBe(`<img src="${CMS}/media/a/b.jpg" alt="x" />`);
  });
  test('makes a href absolute (file link)', () => {
    expect(lib.absolutizeMediaUrls('<a href="/media/a/doc.pdf">PDF</a>'))
      .toBe(`<a href="${CMS}/media/a/doc.pdf">PDF</a>`);
  });
  test('does not touch internal routes', () => {
    expect(lib.absolutizeMediaUrls('<a href="/artikler/x">lenke</a>'))
      .toBe('<a href="/artikler/x">lenke</a>');
  });
  test('does not match srcset (only src/href)', () => {
    const html = '<img srcset="/media/a.jpg 1x" />';
    expect(lib.absolutizeMediaUrls(html)).toBe(html);
  });
  test('avoids a double prefix on an already absolute URL', () => {
    const html = `<img src="${CMS}/media/a.jpg" />`;
    expect(lib.absolutizeMediaUrls(html)).toBe(html);
  });
  test('handles several images in the same html', () => {
    expect(lib.absolutizeMediaUrls('<img src="/media/a.jpg"/><img src="/media/b.jpg"/>'))
      .toBe(`<img src="${CMS}/media/a.jpg"/><img src="${CMS}/media/b.jpg"/>`);
  });
});
