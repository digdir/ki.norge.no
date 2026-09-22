/**
 * Helsesjekken bak /health.
 *
 * Formatet er det samme som info.altinn.no/health, altså ASP.NET HealthChecks:
 * samme vakt overvåker begge portalene, og da holder én regel på «status» for
 * begge.
 *
 * Svaret er offentlig og sier bare hvordan det står til. Ingen adresser, ingen
 * feilmeldinger, ingen versjoner. Detaljene hører hjemme på /status, bak
 * admin-cookien.
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
    const res = await deps.fetch(`${config.umbracoUrl}/umbraco/delivery/api/v2/content?take=1`, {
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
 * Nede søk er ikke nede nettsted, så feil her gir Degraded. Kallet er et søk
 * med size 0 og ikke et indeks-oppslag, fordi nøkkelen bare har lesetilgang,
 * og det er nøyaktig det søket bruker.
 */
async function checkElasticsearch(config: HealthConfig, deps: HealthDeps): Promise<HealthEntry> {
  const { ok, ms } = await timed(deps, async (signal) => {
    const res = await deps.fetch(`${config.esEndpoint}/${config.esIndex}/_search`, {
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

export async function runHealthChecks(config: HealthConfig, deps: HealthDeps): Promise<HealthReport> {
  const t0 = deps.now();
  // Søk som ikke er satt opp er ikke søk som er nede. Lokalt mangler nøkkelen.
  const esConfigured = Boolean(config.esEndpoint && config.esApiKey);

  const [umbraco, elasticsearch] = await Promise.all([
    checkUmbraco(config, deps),
    esConfigured ? checkElasticsearch(config, deps) : Promise.resolve(null),
  ]);

  const entries: Record<string, HealthEntry> = { umbraco };
  if (elasticsearch) entries.elasticsearch = elasticsearch;

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
 * Hver forespørsel mot /health kan komme utenfra, og hver kjøring gjør et kall
 * mot CMS og et mot søk. Uten en grense er /health en måte å belaste CMS-et på.
 * Resultatet gjenbrukes derfor i noen sekunder per isolat.
 *
 * Bare ferdige resultater deles, aldri en kjøring som pågår. På Workers kan en
 * forespørsel som venter på I/O startet av en annen forespørsel henge når den
 * første avsluttes. Et ferdig resultat er ren data og trygt å dele.
 */
export function memoize(
  run: () => Promise<HealthReport>,
  now: () => number,
  ttlMs: number,
): () => Promise<HealthReport> {
  let cached: { at: number; report: HealthReport } | null = null;
  return async () => {
    if (cached && now() - cached.at < ttlMs) return cached.report;
    const report = await run();
    cached = { at: now(), report };
    return report;
  };
}
