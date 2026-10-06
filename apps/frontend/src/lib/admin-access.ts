/**
 * Admin-tilgangen bak /status og forbi kommer-snart-veggen.
 *
 * Cookien bar verdien 1, og middlewaren sjekket bare at den fantes. Hvem som
 * helst som satte ki_admin=1 selv, kom inn. Nå bærer den en HMAC av
 * ADMIN_SECRET, som bare den som har hemmeligheten kan lage. Hemmeligheten selv
 * havner aldri i cookien, så en lekket cookie avslører ikke nøkkelen i
 * /admin-tilgang-lenken. Roteres hemmeligheten, slutter alle gamle cookier å gjelde.
 *
 * Utløpet står i cookien og er med i HMAC-en, så serveren avviser den etter 30
 * dager selv om nettleseren skulle beholde den. Før gjaldt en stjålet cookie til
 * hemmeligheten ble rotert.
 */

import { pathFromMarkdownPath } from './markdown-paths';
import { withinRateLimit } from './rate-limit';

const encoder = new TextEncoder();

// Statussiden og API-et den henter fra hører sammen: beskytter du bare siden,
// ligger dataene fortsatt åpne på API-ruta.
const ADMIN_ONLY_PATHS = new Set(['/status', '/api/status-checks']);

const withoutTrailingSlash = (path: string) => path.replace(/\/+$/, '') || '/';

/**
 * Om stien er en av admin-rutene, slik ruteren ser den. Astro svarer også på
 * /api/status-checks/ og /status.md, og et eksakt oppslag på url.pathname slapp
 * dem forbi uten cookie.
 */
export function requiresAdmin(pathname: string): boolean {
  let path = pathname;
  try {
    path = decodeURI(pathname);
  } catch {
    // Ugyldig prosentkoding når aldri en rute, så den rå stien holder.
  }
  const page = pathFromMarkdownPath(withoutTrailingSlash(path)) ?? path;
  return ADMIN_ONLY_PATHS.has(withoutTrailingSlash(page));
}

/** Sammenligner uten å avsløre gjennom tiden hvor langt de to strengene er like. */
export function safeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const COOKIE_PATTERN = /^v2\.(\d{1,12})\.([0-9a-f]{64})$/;

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`ki_admin ${payload}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Cookie-verdien, `v2.<utløp i sekunder>.<HMAC>`. Uten hemmelighet finnes det ingen gyldig verdi. */
export async function adminToken(secret: string, now = Date.now()): Promise<string | null> {
  if (!secret) return null;
  const payload = `v2.${Math.floor(now / 1000) + ADMIN_COOKIE_MAX_AGE}`;
  return `${payload}.${await sign(secret, payload)}`;
}

export async function isAdminCookie(value: string | undefined, secret: string, now = Date.now()): Promise<boolean> {
  if (!value || !secret) return false;
  const match = COOKIE_PATTERN.exec(value);
  if (!match) return false;
  const expires = Number(match[1]);
  if (expires * 1000 <= now) return false;
  return safeEqual(match[2], await sign(secret, `v2.${expires}`));
}

export function keyMatches(key: string | null, secret: string): boolean {
  return Boolean(key && secret && safeEqual(key, secret));
}

// Nøkkelen kan sendes fra skjemaet, så den ikke havner i historikken og loggene
// slik den gjør i ?key=-lenken. Lenken virker fortsatt.
const FORM_HTML = `<!doctype html>
<html lang="no">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Admin-tilgang | KI Norge</title>
</head>
<body>
  <main>
    <h1>Admin-tilgang</h1>
    <form method="post" action="/admin-tilgang">
      <label for="key">Nøkkel</label>
      <input id="key" name="key" type="password" autocomplete="current-password" required />
      <button type="submit">Logg inn</button>
    </form>
  </main>
</body>
</html>`;

const NO_STORE = { 'Cache-Control': 'no-store' };

// Siden har ingen skript og skal ikke kunne rammes inn, for den tar imot nøkkelen.
const FORM_CSP = "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

async function submittedKey(request: Request): Promise<string | null> {
  if (request.method === 'POST') {
    try {
      const value = (await request.formData()).get('key');
      return typeof value === 'string' ? value : null;
    } catch {
      return null;
    }
  }
  return new URL(request.url).searchParams.get('key');
}

/**
 * /admin-tilgang. Uten nøkkel vises skjemaet. Hvert forsøk med nøkkel teller mot
 * TILTAK_LIMIT med eget prefiks, så forsøkene får sin egen teller og ikke deler
 * den med «Del KI-tiltak».
 */
export async function handleAdminAccess(
  request: Request,
  secret: string,
  withinLimit: (request: Request) => Promise<boolean> = (r) => withinRateLimit('TILTAK_LIMIT', r, 'admin-tilgang:'),
): Promise<Response> {
  const key = await submittedKey(request);
  if (key === null) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Ugyldig nøkkel', { status: 401, headers: NO_STORE });
    }
    return new Response(FORM_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': FORM_CSP, ...NO_STORE },
    });
  }

  if (!(await withinLimit(request))) {
    return new Response('For mange forsøk. Prøv igjen om et minutt.', {
      status: 429,
      headers: { 'Retry-After': '60', ...NO_STORE },
    });
  }

  const token = keyMatches(key, secret) ? await adminToken(secret) : null;
  if (!token) return new Response('Ugyldig nøkkel', { status: 401, headers: NO_STORE });

  const res = new Response('Tilgang gitt! Du blir videresendt...', {
    status: 302,
    headers: { Location: '/status', ...NO_STORE },
  });
  res.headers.append('Set-Cookie', `ki_admin=${token}; Path=/; Max-Age=${ADMIN_COOKIE_MAX_AGE}; SameSite=Lax; HttpOnly; Secure`);
  return res;
}
