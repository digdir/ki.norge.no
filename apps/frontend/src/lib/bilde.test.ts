import { describe, expect, test, beforeAll } from 'vitest';

// URL-reglene for bildene. umbraco.ts leser UMBRACO_PUBLIC_URL ved import, så
// hosten settes før dynamisk import.
const CMS = 'https://cms.test.example';

let bilde: typeof import('./bilde');
let umbraco: typeof import('./umbraco');

beforeAll(async () => {
  process.env.UMBRACO_URL = CMS;
  process.env.UMBRACO_PUBLIC_URL = CMS;
  bilde = await import('./bilde');
  umbraco = await import('./umbraco');
});

const foto = { id: '1', url: '/media/abc/foto.jpg', extension: 'jpg', width: 3000, height: 2000 };
const URL = `${CMS}/media/abc/foto.jpg`;

describe('lagBilde med format', () => {
  test('kutter rundt fokuspunktet i formatets form, med rxy før width og height', () => {
    const b = bilde.lagBilde({ ...foto, focalPoint: { left: 0.9, top: 0.15 } }, 'kort');
    expect(b?.src).toBe(`${URL}?rxy=0.9,0.15&width=1200&height=900&format=webp&quality=80`);
    expect(b?.posisjon).toBe('90% 15%');
  });

  test('srcset har alle bredder i formatet, og hver har formatets høyde', () => {
    const b = bilde.lagBilde(foto, 'bred');
    expect(b?.srcset).toBe(
      [600, 900, 1200, 1600]
        .map((w) => `${URL}?width=${w}&height=${Math.round((w * 9) / 16)}&format=webp&quality=80 ${w}w`)
        .join(', '),
    );
  });

  test('width og height er formatets form, ikke originalens', () => {
    const b = bilde.lagBilde(foto, 'topp');
    expect([b?.width, b?.height]).toEqual([2000, 1333]);
  });

  test('uten fokuspunkt kutter bildeserveren fra midten', () => {
    expect(bilde.lagBilde(foto, 'kort')?.src).toBe(`${URL}?width=1200&height=900&format=webp&quality=80`);
  });

  test('ber ikke om flere piksler enn originalen har i formatets form', () => {
    const lite = { ...foto, width: 858, height: 508 };
    const b = bilde.lagBilde(lite, 'kort');
    expect(b?.srcset?.split(', ').map((s) => s.split(' ')[1])).toEqual(['400w', '600w', '677w']);
    expect([b?.width, b?.height]).toEqual([677, 508]);
  });

  test('gjentar ikke en bredde når originalen treffer en kandidat', () => {
    const b = bilde.lagBilde({ ...foto, width: 800, height: 600 }, 'kort');
    expect(b?.srcset?.split(', ').map((s) => s.split(' ')[1])).toEqual(['400w', '600w', '800w']);
  });

  test('format står før quality', () => {
    const src = bilde.lagBilde(foto, 'kort')!.src;
    expect(src.indexOf('format=')).toBeLessThan(src.indexOf('quality='));
  });
});

describe('lagBilde uten format', () => {
  test('skalerer bare, og bruker ikke fokuspunktet', () => {
    const b = bilde.lagBilde({ ...foto, focalPoint: { left: 0.2, top: 0.2 } });
    expect(b?.src).toBe(`${URL}?width=1600&format=webp&quality=80`);
    expect([b?.width, b?.height]).toEqual([1600, 1067]);
  });
});

describe('SVG og GIF', () => {
  test.each(['svg', 'gif'])('%s leveres som originalen, uten srcset', (extension) => {
    const b = bilde.lagBilde({ ...foto, url: `/media/abc/fil.${extension}`, extension }, 'kort');
    expect(b?.src).toBe(`${CMS}/media/abc/fil.${extension}`);
    expect(b?.srcset).toBeUndefined();
  });

  test('typen leses fra extension, ikke fra URL-en', () => {
    expect(bilde.lagBilde({ ...foto, url: '/media/abc/uten-endelse', extension: 'svg' }, 'kort')?.src).toBe(`${CMS}/media/abc/uten-endelse`);
    expect(bilde.lagBilde({ ...foto, url: '/media/abc/logo.svg', extension: 'png' }, 'kort')?.srcset).toBeDefined();
  });

  test('i et format får boksen formatets høyde, og CSS kutter rundt fokuspunktet', () => {
    const b = bilde.lagBilde({ ...foto, extension: 'svg', focalPoint: { left: 0.25, top: 0.5 } }, 'kort');
    expect([b?.width, b?.height]).toEqual([3000, 2250]);
    expect(b?.posisjon).toBe('25% 50%');
  });
});

describe('uten bilde', () => {
  test.each([
    ['uten media', undefined],
    ['med tom URL', { ...foto, url: '' }],
  ])('gir undefined %s', (_, media) => {
    expect(bilde.lagBilde(media, 'kort')).toBeUndefined();
  });
});

describe('velgKortbilde', () => {
  test('hopper over tomme picker-objekter fra Delivery API', () => {
    const tom = { id: '', url: '' };
    expect(umbraco.velgKortbilde({ lenkekortBilde: tom, artikkelBilde: foto }, tom)?.url).toBe(foto.url);
  });
});
