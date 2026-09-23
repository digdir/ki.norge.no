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
  umbracoPublicUrl: 'https://cms-offentlig.example',
  esEndpoint: 'https://es.intern.example',
  esApiKey: 'hemmelig-nokkel-123',
  esIndex: 'ki-content',
};

type Handler = (url: string, init?: RequestInit) => Promise<Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeFetch(handlers: { umbraco?: Handler; proxy?: Handler; es?: Handler }): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(CONFIG.umbracoUrl)) return (handlers.umbraco ?? (async () => json({ total: 3 })))(url, init);
    if (url.startsWith(CONFIG.umbracoPublicUrl)) return (handlers.proxy ?? (async () => json({ total: 3 })))(url, init);
    if (url.startsWith(CONFIG.esEndpoint)) return (handlers.es ?? (async () => json({ hits: {} })))(url, init);
    throw new Error(`uventet url ${url}`);
  }) as typeof fetch;
}

const run = (handlers: { umbraco?: Handler; proxy?: Handler; es?: Handler }, config = CONFIG, timeoutMs = 3000) =>
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
    expect(r.entries['cms-proxy'].status).toBe('Healthy');
    expect(r.entries.elasticsearch.status).toBe('Healthy');
    expect(httpStatusFor(r.status)).toBe(200);
  });

  // #600: proxyen var av, nettstedet var uten bilder, og alt annet svarte.
  test('offentlig CMS-adresse nede gir Degraded, for sidene rendres fortsatt', async () => {
    const r = await run({ proxy: async () => { throw new Error('ENOTFOUND cms-offentlig.example'); } });
    expect(r.entries['cms-proxy'].status).toBe('Degraded');
    expect(r.entries.umbraco.status).toBe('Healthy');
    expect(r.status).toBe('Degraded');
    expect(httpStatusFor(r.status)).toBe(200);
  });

  test('cms-proxy utelates når den offentlige adressen er den samme som den interne', async () => {
    const r = await run({}, { ...CONFIG, umbracoPublicUrl: CONFIG.umbracoUrl });
    expect(r.entries['cms-proxy']).toBeUndefined();
  });

  test('cms-proxy utelates når den offentlige adressen mangler', async () => {
    const r = await run({}, { ...CONFIG, umbracoPublicUrl: '' });
    expect(r.entries['cms-proxy']).toBeUndefined();
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

  // Node godtar fetch kalt som metode på et hvilket som helst objekt. Cloudflare
  // Workers kaster «Illegal invocation», og da feiler alle sjekkene på null ms
  // i drift mens de er grønne lokalt. Denne falske fetchen oppfører seg som Workers.
  test('fetch kalles uten this, slik Workers krever', async () => {
    const vanlig = fakeFetch({});
    const somWorkers = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return vanlig(input, init);
    } as typeof fetch;
    const r = await runHealthChecks(CONFIG, { fetch: somWorkers, now: Date.now });
    expect(r.entries.umbraco.status).toBe('Healthy');
    expect(r.entries.elasticsearch.status).toBe('Healthy');
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
      expect(tekst).not.toContain('offentlig.example');
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

  // Det #4 målte: 200 samtidige kall etter utløp ga 200 runder mot CMS og søk.
  test('200 samtidige kall etter utløp gir én kjøring, resten får forrige resultat', async () => {
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

  test('et kaldt isolat uten resultat slipper alle gjennom til første svar', async () => {
    let kjøringer = 0;
    const hent = memoize(async () => { kjøringer += 1; return rapport('Healthy'); }, () => 0, 15_000);
    await Promise.all([hent(), hent(), hent()]);
    expect(kjøringer).toBe(3);
  });

  test('en oppdatering som henger, slipper taket etter tidsgrensen', async () => {
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

  // Vakten betyr bare noe når den gamle oppdateringen feiler. Lykkes den, fornyer
  // den cachen, og da får neste kall et ferskt svar uansett markering.
  test('en gammel oppdatering som feiler, nullstiller ikke markeringen til den nye', async () => {
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

    avvis[0](new Error('tidsavbrudd'));
    await gammel.catch(() => {});
    klokke += 1;
    expect((await hent()).status).toBe('Healthy');
    expect(kjøringer).toBe(3);
  });
});
