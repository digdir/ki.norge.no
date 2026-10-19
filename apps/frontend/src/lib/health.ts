/**
 * Helsesjekken bak /health.
 *
 * Formatet er det samme som info.altinn.no/health, altså ASP.NET HealthChecks:
 * samme vakt overvåker begge portalene, og da holder én regel på «status» for
 * begge.
 *
 * Svaret er offentlig og sier bare hvordan det står til. Ingen adresser, ingen
 * feilmeldinger, ingen versjoner.
 *
 * Settet med sjekker er det samme i alle miljøer. Da dekker én regel i vakta
 * både prod og tt02, og tt02 tester det samme som prod.
 */

export type HealthStatus = 'Healthy' | 'Degraded' | 'Unhealthy';

export interface HealthEntry {
  status: HealthStatus;
  duration: string;
  tags: string[];
}

export interface HealthReport {
  status: HealthStatus;
  totalDuration: string;
  entries: Record<string, HealthEntry>;
}

export interface HealthConfig {
  umbracoUrl: string;
  /** Adressen nettleseren henter bilder fra. I prod en proxy, på tt02 lik umbracoUrl. Tom betyr umbracoUrl, som i umbraco.ts. */
  umbracoPublicUrl: string;
  esEndpoint: string;
  esApiKey: string;
  esIndex: string;
}

export interface HealthDeps {
  fetch: typeof fetch;
  now: () => number;
  timeoutMs?: number;
}

const RANK: Record<HealthStatus, number> = { Healthy: 0, Degraded: 1, Unhealthy: 2 };

/** TimeSpan som ASP.NET skriver den: 95 ms blir «00:00:00.0950000». */
export function formatDuration(ms: number): string {
  const whole = Math.max(0, Math.round(ms));
  const h = Math.floor(whole / 3_600_000);
  const m = Math.floor((whole % 3_600_000) / 60_000);
  const s = Math.floor((whole % 60_000) / 1000);
  const fraction = String((whole % 1000) * 10_000).padStart(7, '0');
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${fraction}`;
}

/**
 * fetch kalt som metode, deps.fetch(...), får deps som this. Node bryr seg ikke,
 * men Cloudflare Workers kaster «Illegal invocation», og da feiler alle sjekkene
 * på null ms i drift mens de er grønne lokalt.
 */
function callFetch(deps: HealthDeps, input: string, init: RequestInit): Promise<Response> {
  const f = deps.fetch;
  return f(input, init);
}

async function timed(
  deps: HealthDeps,
  probe: (signal: AbortSignal) => Promise<boolean>,
): Promise<{ ok: boolean; ms: number }> {
  const t0 = deps.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 3000);
  try {
    const ok = await probe(controller.signal);
    return { ok, ms: deps.now() - t0 };
  } catch {
    return { ok: false, ms: deps.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 200 OK er ikke nok. Hopper Umbraco over ventende migreringer, svarer Delivery
 * API-et 200 med en tom liste, og da er nettstedet tomt uten at noe feiler.
 * Derfor kreves minst ett publisert element.
 */
async function checkUmbraco(config: HealthConfig, deps: HealthDeps): Promise<HealthEntry> {
  const { ok, ms } = await timed(deps, async (signal) => {
    const res = await callFetch(deps, `${config.umbracoUrl}/umbraco/delivery/api/v2/content?take=1`, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { total?: unknown };
    return typeof body.total === 'number' && body.total > 0;
  });
  return {
    status: ok ? 'Healthy' : 'Unhealthy',
    duration: formatDuration(ms),
    tags: ['dependencies', 'critical'],
  };
}

/**
 * Sidene henter data fra umbracoUrl, men nettleseren henter bildene fra den
 * offentlige adressen, i prod en proxy-worker. Da proxyen var av i #600, var
 * nettstedet uten bilder i ti minutter mens alt annet svarte. Den feilen ser
 * bare en sjekk mot den offentlige adressen, og den gir Degraded, fordi sidene
 * fortsatt rendres. Den kaller Delivery API gjennom proxyen, ikke en bildefil,
 * så den fanger at proxyen er nede, men ikke en feil i selve bildelagringen.
 *
 * Sjekken kjører også der den offentlige adressen er lik den interne, som på
 * tt02. Den tester da samme vei som nettleseren, og settet blir likt i alle miljøer.
 */
async function checkCmsProxy(config: HealthConfig, deps: HealthDeps): Promise<HealthEntry> {
  const publicUrl = config.umbracoPublicUrl || config.umbracoUrl;
  const { ok, ms } = await timed(deps, async (signal) => {
    const res = await callFetch(deps, `${publicUrl}/umbraco/delivery/api/v2/content?take=1`, {
      headers: { Accept: 'application/json' },
      signal,
    });
    return res.ok;
  });
  return {
    status: ok ? 'Healthy' : 'Degraded',
    duration: formatDuration(ms),
    tags: ['dependencies'],
  };
}

/**
 * Redaktørene trenger backofficet, men nettstedet virker uten det, så feil her
 * gir Degraded. server/status er åpen uten innlogging og svarer «Run» bare når
 * Umbraco er ferdig startet og ikke venter på installasjon eller oppgradering.
 */
async function checkBackoffice(config: HealthConfig, deps: HealthDeps): Promise<HealthEntry> {
  const { ok, ms } = await timed(deps, async (signal) => {
    const res = await callFetch(deps, `${config.umbracoUrl}/umbraco/management/api/v1/server/status`, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { serverStatus?: unknown };
    return body.serverStatus === 'Run';
  });
  return {
    status: ok ? 'Healthy' : 'Degraded',
    duration: formatDuration(ms),
    tags: ['dependencies'],
  };
}

/**
 * Nede søk er ikke nede nettsted, så feil her gir Degraded. Kallet er et søk
 * med size 0 og ikke et indeks-oppslag, fordi nøkkelen bare har lesetilgang,
 * og det er nøyaktig det søket bruker.
 *
 * Mangler nøkkelen, faller søket tilbake på Umbracos enkle søk. Det er også
 * Degraded, så en nøkkel som forsvinner i drift synes i vakta.
 */
async function checkElasticsearch(config: HealthConfig, deps: HealthDeps): Promise<HealthEntry> {
  if (!config.esEndpoint || !config.esApiKey) {
    return { status: 'Degraded', duration: formatDuration(0), tags: ['dependencies'] };
  }
  const { ok, ms } = await timed(deps, async (signal) => {
    const res = await callFetch(deps, `${config.esEndpoint}/${config.esIndex}/_search`, {
      method: 'POST',
      headers: { Authorization: `ApiKey ${config.esApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: 0, track_total_hits: false }),
      signal,
    });
    return res.ok;
  });
  return {
    status: ok ? 'Healthy' : 'Degraded',
    duration: formatDuration(ms),
    tags: ['dependencies'],
  };
}

export const HEALTH_ENTRIES = ['umbraco', 'cms-proxy', 'backoffice', 'elasticsearch'] as const;

export async function runHealthChecks(config: HealthConfig, deps: HealthDeps): Promise<HealthReport> {
  const t0 = deps.now();
  const [umbraco, cmsProxy, backoffice, elasticsearch] = await Promise.all([
    checkUmbraco(config, deps),
    checkCmsProxy(config, deps),
    checkBackoffice(config, deps),
    checkElasticsearch(config, deps),
  ]);

  const entries: Record<(typeof HEALTH_ENTRIES)[number], HealthEntry> = {
    umbraco,
    'cms-proxy': cmsProxy,
    backoffice,
    elasticsearch,
  };

  const worst = Object.values(entries).reduce<HealthStatus>(
    (acc, e) => (RANK[e.status] > RANK[acc] ? e.status : acc),
    'Healthy',
  );

  return { status: worst, totalDuration: formatDuration(deps.now() - t0), entries };
}

/** Samme konvensjon som ASP.NET: Degraded svarer 200, bare Unhealthy gir 503. */
export function httpStatusFor(status: HealthStatus): number {
  return status === 'Unhealthy' ? 503 : 200;
}

/**
 * Hver forespørsel mot /health kan komme utenfra, og hver kjøring gjør kall mot
 * CMS og søk. Uten en grense er /health en måte å belaste CMS-et på.
 *
 * Et ferdig resultat gjenbrukes i ttlMs. Når det er gått ut, oppdaterer én
 * forespørsel, og alle som kommer imens får det forrige resultatet. Da blir det
 * én runde kall per ttl per isolat, uansett hvor mange som spør. Unntaket er et
 * kaldt isolat uten noe resultat å vise, der slipper alle gjennom til første svar.
 *
 * Kjøringen som pågår deles ikke. På Workers kan en forespørsel som venter på
 * I/O startet av en annen forespørsel henge når den første avsluttes, så hver
 * forespørsel venter bare på sin egen. Oppdateringen markeres med et tidspunkt,
 * ikke et flagg, så en avbrutt oppdatering ikke fryser en gammel status for alltid.
 */
export function memoize(
  run: () => Promise<HealthReport>,
  now: () => number,
  ttlMs: number,
  refreshTimeoutMs = 10_000,
): () => Promise<HealthReport> {
  let cached: { at: number; report: HealthReport } | null = null;
  let refreshStartedAt: number | null = null;
  return async () => {
    const t = now();
    const fresh = cached !== null && t - cached.at < ttlMs;
    const refreshing = refreshStartedAt !== null && t - refreshStartedAt < refreshTimeoutMs;
    if (cached && (fresh || refreshing)) return cached.report;

    refreshStartedAt = t;
    try {
      const report = await run();
      cached = { at: now(), report };
      return report;
    } finally {
      // Har en nyere oppdatering tatt over etter tidsgrensen, er markeringen dens.
      if (refreshStartedAt === t) refreshStartedAt = null;
    }
  };
}
