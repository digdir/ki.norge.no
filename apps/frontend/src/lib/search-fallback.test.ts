import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

// Reservesøket mot Umbraco, som brukes når Elasticsearch ikke er satt opp.
// Prefikstabellen det hadde, ga steg lenken /veiledning/{steg} uten guiden, og
// faq en lenke til en side som ikke finnes. search.ts leser ES-oppsettet ved
// import, så env tømmes før dynamisk import.

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
      throw new Error(`uventet kall til ${url}`);
    }),
  );
  ({ hybridSearch } = await import('./search'));
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('reservesøket uten Elasticsearch', () => {
  test('lenkene kommer fra shared/content-routes.json, med guiden for et steg', async () => {
    const treff = await hybridSearch('data');
    expect(treff.map((t) => [t.type, t.url])).toEqual([
      ['artikkel', '/artikler/min-artikkel'],
      ['veiledningSteg', '/veiledning/gjor-dataene-ki-klare/aggregere-data'],
      ['side', '/personvern'],
    ]);
  });
});
