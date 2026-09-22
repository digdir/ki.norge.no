import { describe, expect, test } from 'vitest';
import {
  formatDuration,
  httpStatusFor,
  memoize,
  runHealthChecks,
  type HealthConfig,
  type HealthReport,
} from './health';

const CONFIG: HealthConfig = {
  umbracoUrl: 'https://cms.intern.example',
  esEndpoint: 'https://es.intern.example',
  esApiKey: 'hemmelig-nokkel-123',
  esIndex: 'ki-content',
};

type Handler = (url: string, init?: RequestInit) => Promise<Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeFetch(handlers: { umbraco?: Handler; es?: Handler }): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(CONFIG.umbracoUrl)) return (handlers.umbraco ?? (async () => json({ total: 3 })))(url, init);
    if (url.startsWith(CONFIG.esEndpoint)) return (handlers.es ?? (async () => json({ hits: {} })))(url, init);
    throw new Error(`uventet url ${url}`);
  }) as typeof fetch;
}

const run = (handlers: { umbraco?: Handler; es?: Handler }, config = CONFIG, timeoutMs = 3000) =>
  runHealthChecks(config, { fetch: fakeFetch(handlers), now: Date.now, timeoutMs });

/** Svarer aldri, men respekterer avbrudd, som et CMS som henger. */
const henger: Handler = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });

describe('formatDuration', () => {
  test('skriver TimeSpan som ASP.NET', () => {
    expect(formatDuration(95)).toBe('00:00:00.0950000');
    expect(formatDuration(0)).toBe('00:00:00.0000000');
    expect(formatDuration(3_723_004)).toBe('01:02:03.0040000');
  });

  test('negativ tid blir null, ikke et rart tall', () => {
    expect(formatDuration(-5)).toBe('00:00:00.0000000');
  });
});

describe('runHealthChecks', () => {
  test('alt oppe gir Healthy og 200', async () => {
    const r = await run({});
    expect(r.status).toBe('Healthy');
    expect(r.entries.umbraco.status).toBe('Healthy');
    expect(r.entries.elasticsearch.status).toBe('Healthy');
    expect(httpStatusFor(r.status)).toBe(200);
  });

  // Fella fra Umbraco-oppgraderingene: migreringer hoppet over, API-et svarer
  // 200 med tom liste, og nettstedet er tomt uten at noe feiler.
  test('Delivery API som svarer 200 med tom liste er Unhealthy', async () => {
    const r = await run({ umbraco: async () => json({ total: 0, items: [] }) });
    expect(r.entries.umbraco.status).toBe('Unhealthy');
    expect(r.status).toBe('Unhealthy');
    expect(httpStatusFor(r.status)).toBe(503);
  });

  test('Delivery API som svarer noe annet enn JSON med total er Unhealthy', async () => {
    const r = await run({ umbraco: async () => new Response('<html>vedlikehold</html>', { status: 200 }) });
    expect(r.entries.umbraco.status).toBe('Unhealthy');
  });

  test('feilstatus fra CMS er Unhealthy', async () => {
    const r = await run({ umbraco: async () => json({}, 502) });
    expect(r.entries.umbraco.status).toBe('Unhealthy');
  });

  test('nettverksfeil mot CMS er Unhealthy', async () => {
    const r = await run({ umbraco: async () => { throw new Error('ENOTFOUND cms.intern.example'); } });
    expect(r.entries.umbraco.status).toBe('Unhealthy');
  });

  test('CMS som henger gir Unhealthy innen tidsgrensen, ikke et svar som aldri kommer', async () => {
    const t0 = Date.now();
    const r = await run({ umbraco: henger }, CONFIG, 50);
    expect(r.entries.umbraco.status).toBe('Unhealthy');
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  test('søk nede gir Degraded og 200, for nettstedet virker', async () => {
    const r = await run({ es: async () => json({}, 503) });
    expect(r.entries.elasticsearch.status).toBe('Degraded');
    expect(r.status).toBe('Degraded');
    expect(httpStatusFor(r.status)).toBe(200);
  });

  test('CMS og søk nede samtidig gir Unhealthy', async () => {
    const r = await run({ umbraco: async () => json({}, 500), es: async () => json({}, 500) });
    expect(r.status).toBe('Unhealthy');
  });

  test('søk som ikke er satt opp blir utelatt, ikke rapportert nede', async () => {
    const r = await run({}, { ...CONFIG, esApiKey: '' });
    expect(r.entries.elasticsearch).toBeUndefined();
    expect(r.status).toBe('Healthy');
  });

  test('CMS kalles som sidene gjør, uten API-nøkkel', async () => {
    let headers: HeadersInit | undefined;
    await run({ umbraco: async (_url, init) => { headers = init?.headers; return json({ total: 1 }); } });
    expect(JSON.stringify(headers)).not.toMatch(/api-key/i);
  });

  // Nøkkelen har bare lesetilgang. Et indeks-oppslag ville feilet på rettigheter
  // og gitt Degraded for alltid.
  test('søk sjekkes med et lesekall med size 0, med ApiKey', async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    await run({ es: async (url, init) => { seen = { url, init }; return json({ hits: {} }); } });
    expect(seen!.url).toBe('https://es.intern.example/ki-content/_search');
    expect(seen!.init?.method).toBe('POST');
    expect(JSON.parse(String(seen!.init?.body))).toMatchObject({ size: 0 });
    expect(JSON.stringify(seen!.init?.headers)).toContain('ApiKey hemmelig-nokkel-123');
  });

  test('svaret avslører verken adresser, nøkler eller feilmeldinger', async () => {
    const utfall = [
      await run({}),
      await run({ umbraco: async () => { throw new Error('ENOTFOUND cms.intern.example'); } }),
      await run({ es: async () => { throw new Error('401 for es.intern.example'); } }),
    ];
    for (const r of utfall) {
      const tekst = JSON.stringify(r);
      expect(tekst).not.toContain('intern.example');
      expect(tekst).not.toContain('hemmelig');
      expect(tekst).not.toMatch(/ENOTFOUND|401|error|exception/i);
    }
  });

  test('har samme form som info.altinn.no/health', async () => {
    const r = await run({});
    expect(Object.keys(r).sort()).toEqual(['entries', 'status', 'totalDuration']);
    for (const e of Object.values(r.entries)) {
      expect(Object.keys(e).sort()).toEqual(['duration', 'status', 'tags']);
      expect(e.duration).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{7}$/);
    }
    expect(r.entries.umbraco.tags).toContain('critical');
  });
});

describe('memoize', () => {
  const rapport = (status: HealthReport['status']): HealthReport => ({ status, totalDuration: '00:00:00.0000000', entries: {} });

  test('gjenbruker et ferdig resultat innenfor ttl, og kjører på nytt etterpå', async () => {
    let klokke = 1_000;
    let kjøringer = 0;
    const hent = memoize(async () => { kjøringer += 1; return rapport('Healthy'); }, () => klokke, 15_000);

    await hent();
    klokke += 14_000;
    await hent();
    expect(kjøringer).toBe(1);

    klokke += 2_000;
    await hent();
    expect(kjøringer).toBe(2);
  });

  test('et dårlig resultat gjenbrukes også, så en storm mot et sykt CMS ikke gjør vondt verre', async () => {
    let klokke = 0;
    let kjøringer = 0;
    const hent = memoize(async () => { kjøringer += 1; return rapport('Unhealthy'); }, () => klokke, 15_000);
    await hent();
    klokke += 5_000;
    expect((await hent()).status).toBe('Unhealthy');
    expect(kjøringer).toBe(1);
  });
});
