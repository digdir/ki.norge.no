/**
 * The health check behind /health.
 *
 * The format is the same as info.altinn.no/health, that is ASP.NET HealthChecks:
 * the same monitor watches both portals, and then one rule on "status" is enough for
 * both.
 *
 * The response is public and only says how things stand. No addresses, no
 * error messages, no versions.
 *
 * The set of checks is the same in all environments. Then one rule in the monitor covers
 * both prod and tt02, and tt02 tests the same as prod.
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
  /** The address the browser fetches images from. In prod a proxy, on tt02 equal to umbracoUrl. Empty means umbracoUrl, as in umbraco.ts. */
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

/** TimeSpan as ASP.NET writes it: 95 ms becomes "00:00:00.0950000". */
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
 * fetch called as a method, deps.fetch(...), gets deps as this. Node doesn't care,
 * but Cloudflare Workers throws "Illegal invocation", and then all the checks fail
 * at zero ms in production while they are green locally.
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
 * 200 OK is not enough. If Umbraco skips pending migrations, the Delivery
 * API answers 200 with an empty list, and then the site is empty without anything failing.
 * That is why at least one published item is required.
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
 * The pages fetch data from umbracoUrl, but the browser fetches the images from the
 * public address, in prod a proxy worker. When the proxy was off in #600, the
 * site was without images for ten minutes while everything else responded. Only a check
 * against the public address sees that failure, and it gives Degraded, because the pages
 * still render. It calls the Delivery API through the proxy, not an image file,
 * so it catches the proxy being down, but not a failure in the image storage itself.
 *
 * The check also runs where the public address equals the internal one, as on
 * tt02. It then tests the same path as the browser, and the set is the same in all environments.
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
 * The editors need the backoffice, but the site works without it, so a failure here
 * gives Degraded. server/status is open without login and answers "Run" only when
 * Umbraco has finished starting and is not waiting for installation or upgrade.
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
 * Search down is not site down, so a failure here gives Degraded. The call is a search
 * with size 0 and not an index lookup, because the key only has read access,
 * and that is exactly what search uses.
 *
 * If the key is missing, search falls back to Umbraco's simple search. That is also
 * Degraded, so a key that disappears in production shows up in the monitor.
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

/** Same convention as ASP.NET: Degraded answers 200, only Unhealthy gives 503. */
export function httpStatusFor(status: HealthStatus): number {
  return status === 'Unhealthy' ? 503 : 200;
}

/**
 * Every request to /health can come from outside, and every run makes calls to
 * the CMS and search. Without a limit, /health is a way to put load on the CMS.
 *
 * A finished result is reused for ttlMs. When it has expired, one
 * request refreshes, and everyone arriving meanwhile gets the previous result. That gives
 * one round of calls per ttl per isolate, no matter how many ask. The exception is a
 * cold isolate with no result to show, where everyone gets through until the first response.
 *
 * The run in progress is not shared. On Workers, a request waiting on
 * I/O started by another request can hang when the first one finishes, so each
 * request only waits on its own. The refresh is marked with a timestamp,
 * not a flag, so an aborted refresh doesn't freeze an old status forever.
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
      // If a newer refresh has taken over after the time limit, the marker is its own.
      if (refreshStartedAt === t) refreshStartedAt = null;
    }
  };
}
