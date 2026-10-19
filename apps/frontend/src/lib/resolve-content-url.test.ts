import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import contentRoutesConfig from '../../../../shared/content-routes.json';
import { resolveContentUrl, fetchAllPublishedContent } from './umbraco';

// resolveContentUrl and fetchAllPublishedContent call the Delivery API via global
// fetch. We mock fetch for ancestor lookups and for pagination. Flat
// content types do not look up ancestors, so they need no fetch.

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

  test('a flat type resolves to a {slug} path without an ancestor lookup', async () => {
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

  test('kalenderhendelse resolves to /kalender/{slug}', async () => {
    const url = await resolveContentUrl({
      contentType: 'kalenderhendelse',
      id: '1',
      properties: { slug: 'markedsdialog' },
    });
    expect(url).toBe('/kalender/markedsdialog');
  });

  test('a singleton type resolves to a fixed path', async () => {
    expect(await resolveContentUrl({ contentType: 'forside', id: '1', properties: {} })).toBe('/');
    expect(await resolveContentUrl({ contentType: 'omOss', id: '2', properties: {} })).toBe('/om-oss');
  });

  test('an unknown content type gives null (no route)', async () => {
    const url = await resolveContentUrl({
      contentType: 'globaleInnstillinger',
      id: '1',
      properties: {},
    });
    expect(url).toBeNull();
  });

  test('a nested type fetches ancestors and builds the full path', async () => {
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

  test('a nested type without ancestors gives null', async () => {
    global.fetch = vi.fn(async () => jsonResponse({ total: 0, items: [] })) as unknown as typeof fetch;

    const url = await resolveContentUrl({
      contentType: 'veiledningSteg',
      id: '7',
      properties: { slug: 'steg' },
    });
    expect(url).toBeNull();
  });

  describe('covers every route in content-routes.json', () => {
    // With correct ancestors every type in the file must give a valid path, never null.
    test.each(Object.keys(contentRoutesConfig.routes))('%s gives a path (not null)', async (type) => {
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

  test('paginates until total is fetched (the second page is not cut)', async () => {
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
    expect(nodes[total - 1].id).toBe('id-149'); // kept from the second page
    expect(fetchSpy).toHaveBeenCalledTimes(2); // 100 + 50
  });

  test('a failing page stops the crawl without throwing', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500 } as unknown as Response)) as unknown as typeof fetch;
    await expect(fetchAllPublishedContent()).resolves.toEqual([]);
  });
});
