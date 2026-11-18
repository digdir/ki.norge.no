import { describe, expect, test } from 'vitest';
import { getMediaUrl, MEDIA_WIDTH, toMediaUrl } from './umbraco';

// #962: images are fetched through the portal address (ki.norge.no/media/...), so
// relative media URLs from the Delivery API stay relative. The frontend's /media
// route fetches them from the CMS (lib/media-proxy.ts).

describe('toMediaUrl', () => {
  test('keeps relative /media relative (served by the portal)', () => {
    expect(toMediaUrl('/media/x/foo.jpg')).toBe('/media/x/foo.jpg');
  });
  test('lets an already absolute URL pass', () => {
    expect(toMediaUrl('https://cdn.example/x.jpg')).toBe('https://cdn.example/x.jpg');
  });
  test('does not touch non-media relative URLs (e.g. /og-image.png)', () => {
    expect(toMediaUrl('/og-image.png')).toBe('/og-image.png');
    expect(toMediaUrl('/og-image.png', 800)).toBe('/og-image.png');
  });
  test('empty/undefined gives undefined', () => {
    expect(toMediaUrl(undefined)).toBeUndefined();
    expect(toMediaUrl('')).toBeUndefined();
  });
});

describe('getMediaUrl', () => {
  test('optimizes by default (content width, webp) and stays relative', () => {
    expect(getMediaUrl({ url: '/media/a/b.jpg' } as never))
      .toBe(`/media/a/b.jpg?width=${MEDIA_WIDTH.content}&format=webp&quality=80`);
  });
  test('respects an explicit width (e.g. hero)', () => {
    expect(getMediaUrl({ url: '/media/a/b.jpg' } as never, MEDIA_WIDTH.hero))
      .toBe(`/media/a/b.jpg?width=${MEDIA_WIDTH.hero}&format=webp&quality=80`);
  });
  test('undefined media gives undefined', () => {
    expect(getMediaUrl(undefined)).toBeUndefined();
  });
});

describe('toMediaUrl with width (delivery resizing)', () => {
  test('adds width/format/quality to a relative media URL', () => {
    expect(toMediaUrl('/media/x/foo.jpg', 800)).toBe('/media/x/foo.jpg?width=800&format=webp&quality=80');
  });
  test('adds params to an already absolute media URL', () => {
    expect(toMediaUrl('https://cdn.example/x.jpg', 800)).toBe('https://cdn.example/x.jpg?width=800&format=webp&quality=80');
  });
  test('skips SVG (vectors must not be rasterized)', () => {
    expect(toMediaUrl('/media/x/logo.svg', 800)).toBe('/media/x/logo.svg');
  });
  test('skips GIF (keeps animation)', () => {
    expect(toMediaUrl('/media/x/anim.gif', 800)).toBe('/media/x/anim.gif');
  });
  test('without width the media URL is untouched (e.g. og:image)', () => {
    expect(toMediaUrl('/media/x/foo.jpg')).toBe('/media/x/foo.jpg');
  });
});
