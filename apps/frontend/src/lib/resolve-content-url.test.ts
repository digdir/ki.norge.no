import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import contentRoutesConfig from '../../../../shared/content-routes.json';
import { resolveContentUrl, fetchAllPublishedContent } from './umbraco';

// resolveContentUrl og fetchAllPublishedContent kaller Delivery API via global
// fetch. Vi mocker fetch for ancestor-oppslag og for paginering. Flate
// content-typer slår ikke opp ancestors, så for dem trengs ingen fetch.

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const realFetch = global.fetch;

describe('resolveContentUrl', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = realFetch;
  });

  test('flat type resolver til {slug}-sti uten ancestor-oppslag', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const url = await resolveContentUrl({
      contentType: 'artikkel',
      id: '1',
      properties: { slug: 'min-artikkel' },
    });

    expect(url).toBe('/artikler/min-artikkel');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('kalenderhendelse resolver til /kalender/{slug}', async () => {
    const url = await resolveContentUrl({
      contentType: 'kalenderhendelse',
      id: '1',
      properties: { slug: 'markedsdialog' },
    });
    expect(url).toBe('/kalender/markedsdialog');
  });

  test('singleton-type resolver til fast sti', async () => {
    expect(await resolveContentUrl({ contentType: 'forside', id: '1', properties: {} })).toBe('/');
    expect(await resolveContentUrl({ contentType: 'omOss', id: '2', properties: {} })).toBe('/om-oss');
  });

  test('ukjent content type gir null (ingen rute)', async () => {
    const url = await resolveContentUrl({
      contentType: 'globaleInnstillinger',
      id: '1',
      properties: {},
    });
    expect(url).toBeNull();
  });

  test('nested type henter ancestors og bygger full sti', async () => {
    global.fetch = vi.fn(async (input: unknown) => {
      expect(String(input)).toContain('fetch=ancestors:42');
      return jsonResponse({
        total: 2,
        items: [
          { contentType: 'veiledningGuide', properties: { slug: 'guide-a' } },
          { contentType: 'veiledningSteg', properties: { slug: 'steg-1' } },
        ],
      });
    }) as unknown as typeof fetch;

    const url = await resolveContentUrl({
      contentType: 'stegartikkel',
      id: '42',
      properties: { slug: 'artikkel-x' },
    });
    expect(url).toBe('/veiledning/guide-a/steg-1/artikkel-x');
  });

  test('nested type uten ancestors gir null', async () => {
    global.fetch = vi.fn(async () => jsonResponse({ total: 0, items: [] })) as unknown as typeof fetch;

    const url = await resolveContentUrl({
      contentType: 'veiledningSteg',
      id: '7',
      properties: { slug: 'steg' },
    });
    expect(url).toBeNull();
  });

  describe('dekker hver rute i content-routes.json', () => {
    // Med korrekte ancestors skal hver type i fila gi en gyldig sti, aldri null.
    test.each(Object.keys(contentRoutesConfig.routes))('%s gir en sti (ikke null)', async (type) => {
      global.fetch = vi.fn(async () =>
        jsonResponse({
          total: 2,
          items: [
            { contentType: 'veiledningGuide', properties: { slug: 'g' } },
            { contentType: 'veiledningSteg', properties: { slug: 's' } },
          ],
        }),
      ) as unknown as typeof fetch;

      const url = await resolveContentUrl({ contentType: type, id: 'x', properties: { slug: 'min-slug' } });
      expect(url).not.toBeNull();
      expect(url?.startsWith('/')).toBe(true);
    });
  });
});

describe('fetchAllPublishedContent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = realFetch;
  });

  test('paginerer til total er hentet (andre side blir ikke kuttet)', async () => {
    const total = 150;
    const fetchSpy = vi.fn(async (input: unknown) => {
      const url = new URL(String(input));
      const skip = Number(url.searchParams.get('skip') ?? '0');
      const take = Number(url.searchParams.get('take') ?? '100');
      const items = [];
      for (let i = skip; i < Math.min(skip + take, total); i++) {
        items.push({
          id: `id-${i}`,
          contentType: 'artikkel',
          updateDate: '2026-01-01T00:00:00Z',
          properties: { slug: `s-${i}` },
        });
      }
      return jsonResponse({ total, items });
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const nodes = await fetchAllPublishedContent();

    expect(nodes).toHaveLength(total);
    expect(nodes[0].id).toBe('id-0');
    expect(nodes[total - 1].id).toBe('id-149'); // bevart fra andre side
    expect(fetchSpy).toHaveBeenCalledTimes(2); // 100 + 50
  });

  test('en feilende side stopper crawlen uten å kaste', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500 } as unknown as Response)) as unknown as typeof fetch;
    await expect(fetchAllPublishedContent()).resolves.toEqual([]);
  });
});
