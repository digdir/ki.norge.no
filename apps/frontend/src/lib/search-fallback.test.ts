import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

// The fallback search against Umbraco, used when Elasticsearch is not set up.
// The prefix table it had gave steps the link /veiledning/{steg} without the guide, and
// faq a link to a page that does not exist. search.ts reads the ES setup at
// import, so env is cleared before the dynamic import.

let hybridSearch: typeof import('./search').hybridSearch;

const sokeTreff = {
  items: [
    { id: 'a1', contentType: 'artikkel', name: 'Min artikkel', properties: { tittel: 'Min artikkel', slug: 'min-artikkel' } },
    { id: 's1', contentType: 'veiledningSteg', name: 'Aggregere data', properties: { tittel: 'Aggregere data', slug: 'aggregere-data' } },
    { id: 'f1', contentType: 'faq', name: 'Hva er KI?', properties: { sporsmal: 'Hva er KI?', slug: 'hva-er-ki' } },
    { id: 'p1', contentType: 'side', name: 'Personvern', properties: { tittel: 'Personvern', slug: 'personvern' } },
  ],
  total: 4,
};

const forfedreTilSteg = {
  items: [
    { id: 'g1', contentType: 'veiledningGuide', properties: { slug: 'gjor-dataene-ki-klare' } },
    { id: 'v1', contentType: 'veiledninger', properties: {} },
  ],
  total: 2,
};

const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

beforeAll(async () => {
  vi.stubEnv('ES_ENDPOINT', '');
  vi.stubEnv('ES_API_KEY', '');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = String(input);
      if (url.includes('fetch=ancestors')) return json(url.includes('s1') ? forfedreTilSteg : { items: [], total: 0 });
      if (url.includes('search=')) return json(sokeTreff);
      throw new Error(`unexpected call to ${url}`);
    }),
  );
  ({ hybridSearch } = await import('./search'));
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('the fallback search without Elasticsearch', () => {
  test('the links come from shared/content-routes.json, with the guide for a step', async () => {
    const treff = await hybridSearch('data');
    expect(treff.map((t) => [t.type, t.url])).toEqual([
      ['artikkel', '/artikler/min-artikkel'],
      ['veiledningSteg', '/veiledning/gjor-dataene-ki-klare/aggregere-data'],
      ['side', '/personvern'],
    ]);
  });
});
