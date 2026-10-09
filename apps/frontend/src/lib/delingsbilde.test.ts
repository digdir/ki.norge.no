import { readFileSync } from 'node:fs';
import { describe, expect, test, beforeAll } from 'vitest';

// umbraco.ts leser UMBRACO_PUBLIC_URL ved import, så hosten settes før dynamisk import.
const CMS = 'https://cms.test.example';
const SITE = 'https://ki.norge.no';

let lib: typeof import('./delingsbilde');

beforeAll(async () => {
  process.env.UMBRACO_URL = CMS;
  process.env.UMBRACO_PUBLIC_URL = CMS;
  lib = await import('./delingsbilde');
});

const foto = { id: '1', url: '/media/abc/foto.jpg', extension: 'jpg', width: 3954, height: 2682 };

describe('delingsbilde', () => {
  test('lager et utsnitt på 1200x630 i JPEG, og taggene sier det samme', () => {
    const bilde = lib.delingsbilde(foto, SITE);
    expect(bilde).toEqual({
      url: `${CMS}/media/abc/foto.jpg?width=1200&height=630&format=jpg&quality=80`,
      width: 1200,
      height: 630,
      type: 'image/jpeg',
    });
  });

  test('kutter rundt fokuspunktet', () => {
    const bilde = lib.delingsbilde({ ...foto, focalPoint: { left: 0.3, top: 0.2 } }, SITE);
    expect(bilde.url).toBe(`${CMS}/media/abc/foto.jpg?rxy=0.3,0.2&width=1200&height=630&format=jpg&quality=80`);
  });

  test('format står før quality', () => {
    const { url } = lib.delingsbilde(foto, SITE);
    expect(url.indexOf('format=')).toBeLessThan(url.indexOf('quality='));
  });

  test.each([
    ['uten bilde', undefined],
    ['med tom URL', { ...foto, url: '' }],
    ['med SVG', { ...foto, url: '/media/abc/logo.svg', extension: 'svg' }],
    ['med GIF', { ...foto, url: '/media/abc/anim.gif', extension: 'gif' }],
  ])('gir standardbildet %s', (_, media) => {
    expect(lib.delingsbilde(media, SITE)).toEqual({
      ...lib.STANDARD_DELINGSBILDE,
      url: `${SITE}${lib.STANDARD_DELINGSBILDE.url}`,
    });
  });

  test('taggene for standardbildet stemmer med fila', () => {
    const fil = readFileSync(new URL('../../public/og-image.png', import.meta.url));
    expect(fil.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(fil.readUInt32BE(16)).toBe(lib.STANDARD_DELINGSBILDE.width);
    expect(fil.readUInt32BE(20)).toBe(lib.STANDARD_DELINGSBILDE.height);
  });
});
