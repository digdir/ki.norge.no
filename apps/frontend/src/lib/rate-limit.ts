/**
 * Hastighetsgrense for de offentlige API-rutene, bygget på Cloudflares
 * innebygde rate limiting-binding.
 *
 * Hvorfor bindingen og ikke en WAF-regel i dashbordet: rate limiting-regler
 * gjelder per sone, og workeren serveres fra workers.dev fram til DNS for
 * ki.norge.no er satt opp. Bindingen kjører inne i workeren og virker derfor
 * allerede i dag. Legg gjerne en soneregel utenpå senere, den avviser før
 * workeren i det hele tatt starter.
 *
 * Cloudflare beskriver bindingen som «permissive, eventually consistent», og
 * tellerne er lokale til hvert datasenter, ikke globale. Det holder her:
 * trafikken vår lander i praksis i én til to colo-er, og formålet er å bremse
 * masseinnsending, ikke å føre nøyaktig regnskap.
 */

/** Bindingens form. Vi bruker bare limit(), så resten er utelatt. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface WorkerBindings {
  TILTAK_LIMIT?: RateLimiter;
  SEARCH_LIMIT?: RateLimiter;
}

export type LimiterName = keyof WorkerBindings;

/** undefined betyr «ikke forsøkt ennå», null betyr «finnes ikke her». */
let cachedBindings: WorkerBindings | null | undefined;

/**
 * Bindinger finnes bare i workerd. Importen er dynamisk og pakket inn, slik at
 * node-adapteren i dev (DEV_USE_NODE=1) og unit-testene faller gjennom til null
 * i stedet for å kræsje på en modul som ikke finnes der.
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
 * Nøkkelen vi teller på. CF-Connecting-IP settes av Cloudflare og kan ikke
 * overstyres av klienten. Uten header havner alle i samme bøtte, som er den
 * strenge varianten og bare gjelder utenfor Cloudflare.
 */
export function clientKey(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'ukjent';
}

/**
 * Sant når kallet skal slippe gjennom.
 *
 * Slipper med vilje gjennom når bindingen mangler eller feiler. En manglende
 * grense skal ikke ta ned skjemaet eller søket, og alvorligheten er lav: dette
 * er en bremse, ikke en tilgangskontroll.
 */
export async function withinRateLimit(name: LimiterName, request: Request): Promise<boolean> {
  const bindings = await loadBindings();
  const limiter = bindings?.[name];
  if (!limiter) return true;

  try {
    const { success } = await limiter.limit({ key: clientKey(request) });
    return success;
  } catch {
    console.error('[rate-limit] bindingen svarte ikke, slipper gjennom', { limiter: name });
    return true;
  }
}
