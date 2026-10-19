/**
 * Rate limit for the public API routes, built on Cloudflare's
 * built-in rate limiting binding.
 *
 * Why the binding and not a WAF rule in the dashboard: rate limiting rules
 * apply per zone, and the worker is served from workers.dev until DNS for
 * ki.norge.no is set up. The binding runs inside the worker and therefore works
 * already today. Feel free to add a zone rule in front later, it rejects before
 * the worker even starts.
 *
 * Cloudflare describes the binding as "permissive, eventually consistent", and
 * the counters are local to each data centre, not global. That is enough here:
 * our traffic in practice lands in one or two colos, and the purpose is to slow down
 * mass submission, not to keep exact accounts.
 */

/** The shape of the binding. We only use limit(), so the rest is left out. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface WorkerBindings {
  TILTAK_LIMIT?: RateLimiter;
  SEARCH_LIMIT?: RateLimiter;
}

export type LimiterName = keyof WorkerBindings;

/** undefined means "not tried yet", null means "does not exist here". */
let cachedBindings: WorkerBindings | null | undefined;

/**
 * Bindings only exist in workerd. The import is dynamic and wrapped, so that
 * the node adapter in dev (DEV_USE_NODE=1) and the unit tests fall through to null
 * instead of crashing on a module that doesn't exist there.
 */
async function loadBindings(): Promise<WorkerBindings | null> {
  if (cachedBindings !== undefined) return cachedBindings;
  try {
    const specifier = 'cloudflare:workers';
    const module = (await import(/* @vite-ignore */ specifier)) as { env?: WorkerBindings };
    cachedBindings = module.env ?? null;
  } catch {
    cachedBindings = null;
  }
  return cachedBindings;
}

/**
 * The key we count on. CF-Connecting-IP is set by Cloudflare and cannot be
 * overridden by the client. Without the header everyone ends up in the same bucket, which is the
 * strict variant and only applies outside Cloudflare.
 */
export function clientKey(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'ukjent';
}

/**
 * True when the call should be let through.
 *
 * Deliberately lets through when the binding is missing or fails. A missing
 * limit should not take down the form or the search, and the severity is low: this
 * is a brake, not an access control.
 */
export async function withinRateLimit(name: LimiterName, request: Request): Promise<boolean> {
  const bindings = await loadBindings();
  const limiter = bindings?.[name];
  if (!limiter) return true;

  try {
    const { success } = await limiter.limit({ key: clientKey(request) });
    return success;
  } catch {
    console.error('[rate-limit] the binding did not respond, letting through', { limiter: name });
    return true;
  }
}
