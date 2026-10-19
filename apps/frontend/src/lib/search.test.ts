import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

// search.ts reads the ES setup at import, so env is set before the dynamic import.
const ES = 'https://es.test.example';

let hybridSearch: typeof import('./search').hybridSearch;
const kall: { url: string; body: string }[] = [];
let svar: ((url: string) => Response)[] = [];

const treff = (title: string) => ({ _source: { title, url: `https://ki.norge.no/${title}`, type: 'artikkel', body: 'Tekst' } });
const json = (data: unknown) => () => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const msearch = (...responses: unknown[]) => json({ responses });
const probe = (max_score: number) => ({ status: 200, hits: { max_score, hits: [] } });
const modellNede = {
  status: 400,
  error: { type: 'status_exception', reason: 'Trained model deployment [.multilingual-e5-large] is not allocated to any nodes' },
};

beforeAll(async () => {
  vi.stubEnv('ES_ENDPOINT', ES);
  vi.stubEnv('ES_API_KEY', 'nøkkel');
  vi.stubEnv('KI_INDEX', 'ki-content');
  // On Workers fetch throws "Illegal invocation" if it is called as a method on
  // another object. Node does not care, so the fake fetch does it instead.
  vi.stubGlobal(
    'fetch',
    vi.fn(function (this: unknown, input: string, init?: RequestInit) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      kall.push({ url: String(input), body: String(init?.body ?? '') });
      const neste = svar.shift();
      if (!neste) throw new Error(`unexpected call to ${input}`);
      return Promise.resolve(neste(String(input)));
    }),
  );
  ({ hybridSearch } = await import('./search'));
});

afterEach(() => {
  kall.length = 0;
  svar = [];
  vi.restoreAllMocks();
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('hybridSearch', () => {
  test('a regular hit comes from the hybrid part, with one call', async () => {
    svar = [msearch(probe(5), { status: 200, hits: { hits: [treff('KI-veileder')] } })];
    const resultat = await hybridSearch('veileder');
    expect(resultat.map((r) => r.title)).toEqual(['KI-veileder']);
    expect(kall.map((k) => k.url)).toEqual([`${ES}/ki-content/_msearch`]);
  });

  test('if the hybrid part fails, it is logged and BM25 is used instead', async () => {
    const logg = vi.spyOn(console, 'error').mockImplementation(() => {});
    svar = [msearch(probe(5), modellNede), json({ hits: { hits: [treff('Personvern og KI')] } })];

    const resultat = await hybridSearch('personvern');

    expect(resultat.map((r) => r.title)).toEqual(['Personvern og KI']);
    expect(kall[1].url).toBe(`${ES}/ki-content/_search`);
    expect(JSON.parse(kall[1].body)).toEqual({
      size: 12,
      _source: ['title', 'url', 'type', 'body'],
      query: { multi_match: { query: 'personvern', fields: ['title^2', 'body'] } },
    });
    expect(logg).toHaveBeenCalledTimes(1);
    const [, detaljer] = logg.mock.calls[0];
    expect(detaljer).toEqual({ status: 400, type: 'status_exception', reason: modellNede.error.reason });
    expect(JSON.stringify(logg.mock.calls)).not.toContain('personvern');
  });

  test('if the lexical probe fails, an error with status and type is thrown', async () => {
    svar = [msearch({ status: 503, error: { type: 'search_phase_execution_exception' } }, modellNede)];
    await expect(hybridSearch('personvern')).rejects.toThrow(/503.*search_phase_execution_exception/);
    expect(kall).toHaveLength(1);
  });

  test('below the relevance gate gives an empty list, without fallback even if the hybrid part failed', async () => {
    svar = [msearch(probe(0.4), modellNede)];
    expect(await hybridSearch('middag')).toEqual([]);
    expect(kall).toHaveLength(1);
  });
});
