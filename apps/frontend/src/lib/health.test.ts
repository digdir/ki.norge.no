import { describe, expect, test } from 'vitest';
import {
  formatDuration,
  HEALTH_ENTRIES,
  httpStatusFor,
  memoize,
  runHealthChecks,
  type HealthConfig,
  type HealthReport,
} from './health';

const CONFIG: HealthConfig = {
  umbracoUrl: 'https://cms.intern.example',
  umbracoPublicUrl: 'https://cms-offentlig.example',
  esEndpoint: 'https://es.intern.example',
  esApiKey: 'hemmelig-nokkel-123',
  esIndex: 'ki-content',
};

type Handler = (url: string, init?: RequestInit) => Promise<Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Handlers = { umbraco?: Handler; proxy?: Handler; backoffice?: Handler; es?: Handler };

function fakeFetch(handlers: Handlers): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/umbraco/management/api/v1/server/status')) {
      return (handlers.backoffice ?? (async () => json({ serverStatus: 'Run' })))(url, init);
    }
    if (url.startsWith(CONFIG.umbracoUrl)) return (handlers.umbraco ?? (async () => json({ total: 3 })))(url, init);
    if (url.startsWith(CONFIG.umbracoPublicUrl)) return (handlers.proxy ?? (async () => json({ total: 3 })))(url, init);
    if (url.startsWith(CONFIG.esEndpoint)) return (handlers.es ?? (async () => json({ hits: {} })))(url, init);
    throw new Error(`unexpected url ${url}`);
  }) as typeof fetch;
}

const run = (handlers: Handlers, config = CONFIG, timeoutMs = 3000) =>
  runHealthChecks(config, { fetch: fakeFetch(handlers), now: Date.now, timeoutMs });

/** Never answers, but respects abort, like a CMS that hangs. */
const henger: Handler = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });

describe('formatDuration', () => {
  test('writes TimeSpan like ASP.NET', () => {
    expect(formatDuration(95)).toBe('00:00:00.0950000');
    expect(formatDuration(0)).toBe('00:00:00.0000000');
    expect(formatDuration(3_723_004)).toBe('01:02:03.0040000');
  });

  test('negative time becomes zero, not an odd number', () => {
    expect(formatDuration(-5)).toBe('00:00:00.0000000');
  });
});

describe('runHealthChecks', () => {
  test('everything up gives Healthy and 200', async () => {
    const r = await run({});
    expect(r.status).toBe('Healthy');
    expect(r.entries.umbraco.status).toBe('Healthy');
    expect(r.entries['cms-proxy'].status).toBe('Healthy');
    expect(r.entries.backoffice.status).toBe('Healthy');
    expect(r.entries.elasticsearch.status).toBe('Healthy');
    expect(httpStatusFor(r.status)).toBe(200);
  });

  // One rule in the monitor should cover both environments, and tt02 should test the same as prod.
  test.each([
    ['prod, with its own proxy', CONFIG],
    ['tt02, public address equal to the internal one', { ...CONFIG, umbracoPublicUrl: CONFIG.umbracoUrl }],
    ['local, without a public address and without a search key', { ...CONFIG, umbracoPublicUrl: '', esApiKey: '' }],
  ])('same set of checks in %s', async (_miljø, config) => {
    const r = await run({}, config);
    expect(Object.keys(r.entries)).toEqual([...HEALTH_ENTRIES]);
  });

  test('cms-proxy checks the public address also when it equals the internal one', async () => {
    const kalt: string[] = [];
    await run({ umbraco: async (url) => { kalt.push(url); return json({ total: 3 }); } }, { ...CONFIG, umbracoPublicUrl: CONFIG.umbracoUrl });
    expect(kalt.filter((u) => u.includes('/delivery/api/'))).toHaveLength(2);
  });

  test('cms-proxy uses the internal address when the public one is missing, like umbraco.ts', async () => {
    const r = await run({ umbraco: async () => json({}, 502) }, { ...CONFIG, umbracoPublicUrl: '' });
    expect(r.entries['cms-proxy'].status).toBe('Degraded');
  });

  // #600: the proxy was off, the site was without images, and everything else responded.
  test('public CMS address down gives Degraded, since the pages still render', async () => {
    const r = await run({ proxy: async () => { throw new Error('ENOTFOUND cms-offentlig.example'); } });
    expect(r.entries['cms-proxy'].status).toBe('Degraded');
    expect(r.entries.umbraco.status).toBe('Healthy');
    expect(r.status).toBe('Degraded');
    expect(httpStatusFor(r.status)).toBe(200);
  });

  // The site works without the backoffice, but the editors cannot publish.
  test('backoffice down gives Degraded and 200, not Unhealthy', async () => {
    const r = await run({ backoffice: async () => json({}, 502) });
    expect(r.entries.backoffice.status).toBe('Degraded');
    expect(r.entries.umbraco.status).toBe('Healthy');
    expect(r.status).toBe('Degraded');
    expect(httpStatusFor(r.status)).toBe(200);
  });

  test.each(['Upgrade', 'Install', 'BootFailed'])('backoffice answering %s is Degraded', async (serverStatus) => {
    const r = await run({ backoffice: async () => json({ serverStatus }) });
    expect(r.entries.backoffice.status).toBe('Degraded');
  });

  test('backoffice answering something other than JSON is Degraded', async () => {
    const r = await run({ backoffice: async () => new Response('<html>innlogging</html>', { status: 200 }) });
    expect(r.entries.backoffice.status).toBe('Degraded');
  });

  test('backoffice is checked on the internal address, without login', async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    await run({ backoffice: async (url, init) => { seen = { url, init }; return json({ serverStatus: 'Run' }); } });
    expect(seen!.url).toBe('https://cms.intern.example/umbraco/management/api/v1/server/status');
    expect(JSON.stringify(seen!.init?.headers)).not.toMatch(/authorization|api-key/i);
  });

  test('backoffice that hangs gives Degraded within the time limit', async () => {
    const t0 = Date.now();
    const r = await run({ backoffice: henger }, CONFIG, 50);
    expect(r.entries.backoffice.status).toBe('Degraded');
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  // The trap from the Umbraco upgrades: migrations skipped, the API answers
  // 200 with an empty list, and the site is empty without anything failing.
  test('Delivery API answering 200 with an empty list is Unhealthy', async () => {
    const r = await run({ umbraco: async () => json({ total: 0, items: [] }) });
    expect(r.entries.umbraco.status).toBe('Unhealthy');
    expect(r.status).toBe('Unhealthy');
    expect(httpStatusFor(r.status)).toBe(503);
  });

  test('Delivery API answering something other than JSON with total is Unhealthy', async () => {
    const r = await run({ umbraco: async () => new Response('<html>vedlikehold</html>', { status: 200 }) });
    expect(r.entries.umbraco.status).toBe('Unhealthy');
  });

  test('error status from the CMS is Unhealthy', async () => {
    const r = await run({ umbraco: async () => json({}, 502) });
    expect(r.entries.umbraco.status).toBe('Unhealthy');
  });

  test('network error towards the CMS is Unhealthy', async () => {
    const r = await run({ umbraco: async () => { throw new Error('ENOTFOUND cms.intern.example'); } });
    expect(r.entries.umbraco.status).toBe('Unhealthy');
  });

  test('a CMS that hangs gives Unhealthy within the time limit, not a response that never comes', async () => {
    const t0 = Date.now();
    const r = await run({ umbraco: henger }, CONFIG, 50);
    expect(r.entries.umbraco.status).toBe('Unhealthy');
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  test('search down gives Degraded and 200, since the site works', async () => {
    const r = await run({ es: async () => json({}, 503) });
    expect(r.entries.elasticsearch.status).toBe('Degraded');
    expect(r.status).toBe('Degraded');
    expect(httpStatusFor(r.status)).toBe(200);
  });

  test('CMS and search down at the same time gives Unhealthy', async () => {
    const r = await run({ umbraco: async () => json({}, 500), es: async () => json({}, 500) });
    expect(r.status).toBe('Unhealthy');
  });

  // Without a key, search falls back to Umbraco's simple search. A key that
  // disappears in production should show, not make the check disappear.
  test('search that is not set up is Degraded without calling anything', async () => {
    let kalt = false;
    const r = await run({ es: async () => { kalt = true; return json({}); } }, { ...CONFIG, esApiKey: '' });
    expect(r.entries.elasticsearch.status).toBe('Degraded');
    expect(r.status).toBe('Degraded');
    expect(kalt).toBe(false);
  });

  // Node accepts fetch called as a method on any object. Cloudflare
  // Workers throws "Illegal invocation", and then all the checks fail at zero ms
  // in production while they are green locally. This fake fetch behaves like Workers.
  test('fetch is called without this, as Workers requires', async () => {
    const vanlig = fakeFetch({});
    const somWorkers = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return vanlig(input, init);
    } as typeof fetch;
    const r = await runHealthChecks(CONFIG, { fetch: somWorkers, now: Date.now });
    expect(r.entries.umbraco.status).toBe('Healthy');
    expect(r.entries.elasticsearch.status).toBe('Healthy');
  });

  test('the CMS is called the way the pages do, without an API key', async () => {
    let headers: HeadersInit | undefined;
    await run({ umbraco: async (_url, init) => { headers = init?.headers; return json({ total: 1 }); } });
    expect(JSON.stringify(headers)).not.toMatch(/api-key/i);
  });

  // The key only has read access. An index lookup would fail on permissions
  // and give Degraded forever.
  test('search is checked with a read call with size 0, with ApiKey', async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    await run({ es: async (url, init) => { seen = { url, init }; return json({ hits: {} }); } });
    expect(seen!.url).toBe('https://es.intern.example/ki-content/_search');
    expect(seen!.init?.method).toBe('POST');
    expect(JSON.parse(String(seen!.init?.body))).toMatchObject({ size: 0 });
    expect(JSON.stringify(seen!.init?.headers)).toContain('ApiKey hemmelig-nokkel-123');
  });

  test('the response reveals neither addresses, keys nor error messages', async () => {
    const utfall = [
      await run({}),
      await run({ umbraco: async () => { throw new Error('ENOTFOUND cms.intern.example'); } }),
      await run({ es: async () => { throw new Error('401 for es.intern.example'); } }),
    ];
    for (const r of utfall) {
      const tekst = JSON.stringify(r);
      expect(tekst).not.toContain('intern.example');
      expect(tekst).not.toContain('offentlig.example');
      expect(tekst).not.toContain('hemmelig');
      expect(tekst).not.toMatch(/ENOTFOUND|401|error|exception/i);
    }
  });

  test('has the same shape as info.altinn.no/health', async () => {
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

  test('reuses a finished result within ttl, and runs again afterwards', async () => {
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

  test('a bad result is also reused, so a storm against a sick CMS does not make things worse', async () => {
    let klokke = 0;
    let kjøringer = 0;
    const hent = memoize(async () => { kjøringer += 1; return rapport('Unhealthy'); }, () => klokke, 15_000);
    await hent();
    klokke += 5_000;
    expect((await hent()).status).toBe('Unhealthy');
    expect(kjøringer).toBe(1);
  });

  // What #4 measured: 200 concurrent calls after expiry gave 200 rounds against the CMS and search.
  test('200 concurrent calls after expiry give one run, the rest get the previous result', async () => {
    let klokke = 0;
    let kjøringer = 0;
    let slipp: (r: HealthReport) => void = () => {};
    const hent = memoize(
      () => { kjøringer += 1; return kjøringer === 1 ? Promise.resolve(rapport('Healthy')) : new Promise((r) => { slipp = r; }); },
      () => klokke,
      15_000,
    );
    await hent();
    klokke += 20_000;

    const svar = Array.from({ length: 200 }, () => hent());
    slipp(rapport('Degraded'));
    const resultater = await Promise.all(svar);

    expect(kjøringer).toBe(2);
    expect(resultater.filter((x) => x.status === 'Healthy')).toHaveLength(199);
    expect(resultater.filter((x) => x.status === 'Degraded')).toHaveLength(1);
  });

  test('a cold isolate without a result lets everyone through until the first response', async () => {
    let kjøringer = 0;
    const hent = memoize(async () => { kjøringer += 1; return rapport('Healthy'); }, () => 0, 15_000);
    await Promise.all([hent(), hent(), hent()]);
    expect(kjøringer).toBe(3);
  });

  test('a refresh that hangs lets go after the time limit', async () => {
    let klokke = 0;
    let kjøringer = 0;
    const hent = memoize(
      () => { kjøringer += 1; return kjøringer === 1 ? Promise.resolve(rapport('Healthy')) : new Promise<HealthReport>(() => {}); },
      () => klokke,
      15_000,
      10_000,
    );
    await hent();
    klokke += 20_000;
    void hent();
    klokke += 5_000;
    await hent();
    expect(kjøringer).toBe(2);

    klokke += 6_000;
    void hent();
    expect(kjøringer).toBe(3);
  });

  // The guard only matters when the old refresh fails. If it succeeds, it renews
  // the cache, and then the next call gets a fresh response regardless of the marker.
  test('an old refresh that fails does not reset the marker of the new one', async () => {
    let klokke = 0;
    let kjøringer = 0;
    const avvis: Array<(e: Error) => void> = [];
    const hent = memoize(
      () => {
        kjøringer += 1;
        return kjøringer === 1 ? Promise.resolve(rapport('Healthy')) : new Promise<HealthReport>((_r, rej) => avvis.push(rej));
      },
      () => klokke,
      15_000,
      10_000,
    );
    await hent();
    klokke += 20_000;
    const gammel = hent();
    klokke += 11_000;
    void hent();
    expect(kjøringer).toBe(3);

    avvis[0](new Error('timeout'));
    await gammel.catch(() => {});
    klokke += 1;
    expect((await hent()).status).toBe('Healthy');
    expect(kjøringer).toBe(3);
  });
});
