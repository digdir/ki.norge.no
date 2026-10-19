/**
 * Cloudflare Turnstile, used on "Del KI-tiltak".
 *
 * Why Turnstile and not just an IP limit: the audience is public sector
 * employees, and a whole municipality can sit behind one outgoing IP. A strict IP limit
 * would shut out real users, while a bot with rotating IPs goes
 * around it. Turnstile distinguishes on "is this a browser with a human",
 * which is the question we actually want answered.
 *
 * Same env pattern as src/lib/graph-email.ts. The site key is public and lives
 * in vars, the secret key is a secret.
 */

const SITE_KEY: string = process.env.TURNSTILE_SITE_KEY || import.meta.env.TURNSTILE_SITE_KEY || '';
const SECRET_KEY: string = process.env.TURNSTILE_SECRET_KEY || import.meta.env.TURNSTILE_SECRET_KEY || '';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * True only when both keys are set. Logged as boolean presence,
 * never as length or content, since CodeQL tracks values derived from a
 * secret to the log.
 */
export const turnstileIsConfigured = Boolean(SITE_KEY && SECRET_KEY);

/** The site key is public and is sent to the browser by ki-tiltak.astro. */
export const turnstileSiteKey = SITE_KEY;

/**
 * The hosts the form is used on. The site key is the same in tt02 and prod, so a token
 * solved on one of them is valid against both. The list is checked against hostname in the response from
 * siteverify, which is where the widget was solved.
 */
const FORM_HOSTNAMES = new Set([
  'ki.norge.no',
  'ki.test.norge.no',
  'ki-norge-frontend-prod.digitaliseringsdirektoratet.workers.dev',
  'ki-norge-frontend-tt02.digitaliseringsdirektoratet.workers.dev',
]);

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export type TurnstileResult = 'ok' | 'rejected' | 'not_configured';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFormHostname(solvedOn: unknown, requestHostname: string): boolean {
  if (typeof solvedOn !== 'string') return false;
  if (FORM_HOSTNAMES.has(solvedOn)) return true;
  return LOCAL_HOSTNAMES.has(requestHostname) && solvedOn === requestHostname;
}

/**
 * Checks the token from the widget against Cloudflare.
 *
 * If the keys are missing, the submission is rejected. The exception is local development, decided
 * by the hostname in the request and not by an env var that can be forgotten in production.
 *
 * The token is single-use and lasts 300 seconds. The client must therefore fetch a new one
 * on the next attempt, and the form resets the widget when a submission fails.
 */
export async function verifyTurnstile(
  token: string,
  ip: string,
  requestHostname: string,
): Promise<TurnstileResult> {
  if (!turnstileIsConfigured) {
    if (LOCAL_HOSTNAMES.has(requestHostname)) {
      console.warn('[turnstile] not configured, letting through on localhost');
      return 'ok';
    }
    console.error('[turnstile] not configured, submission rejected');
    return 'not_configured';
  }
  if (token.length === 0) return 'rejected';

  const body = new URLSearchParams({ secret: SECRET_KEY, response: token });
  if (ip !== 'ukjent') body.set('remoteip', ip);

  try {
    const response = await fetch(SITEVERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      console.error('[turnstile] siteverify did not respond ok', { status: response.status });
      return 'rejected';
    }

    const data: unknown = await response.json();
    if (!isObject(data)) return 'rejected';

    if (data.success !== true) {
      // The error codes come from Cloudflare, not from the submitter, and say something about
      // our setup. They are logged, but never passed on to the client.
      console.error('[turnstile] token rejected', { codes: data['error-codes'] });
      return 'rejected';
    }
    if (!isFormHostname(data.hostname, requestHostname)) {
      console.error('[turnstile] token solved on another host', { hostname: data.hostname });
      return 'rejected';
    }
    return 'ok';
  } catch {
    // Network error towards Cloudflare. We reject rather than let through:
    // this is a security control, unlike the rate limit.
    console.error('[turnstile] could not reach siteverify');
    return 'rejected';
  }
}
