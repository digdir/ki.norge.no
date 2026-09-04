/**
 * Cloudflare Turnstile, brukt på «Del KI-tiltak».
 *
 * Hvorfor Turnstile og ikke bare en IP-grense: målgruppa er ansatte i offentlig
 * sektor, og en hel kommune kan ligge bak én utgående IP. En stram IP-grense
 * ville stengt ute reelle brukere, samtidig som en bot med roterende IP-er går
 * rundt den. Turnstile skiller på «er dette en nettleser med et menneske»,
 * som er det spørsmålet vi faktisk vil ha svar på.
 *
 * Samme env-mønster som src/lib/graph-email.ts. Site key er offentlig og ligger
 * i vars, secret key er en secret.
 */

const SITE_KEY: string = process.env.TURNSTILE_SITE_KEY || import.meta.env.TURNSTILE_SITE_KEY || '';
const SECRET_KEY: string = process.env.TURNSTILE_SECRET_KEY || import.meta.env.TURNSTILE_SECRET_KEY || '';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Sann bare når begge nøklene er satt. Logges som boolsk tilstedeværelse,
 * aldri som lengde eller innhold, siden CodeQL sporer verdier avledet av en
 * secret til loggen.
 */
export const turnstileIsConfigured = Boolean(SITE_KEY && SECRET_KEY);

/** Site key er offentlig og sendes til nettleseren av ki-tiltak.astro. */
export const turnstileSiteKey = SITE_KEY;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Sjekker tokenet fra widgeten mot Cloudflare.
 *
 * Tokenet er engangs og varer i 300 sekunder. Klienten må derfor hente et nytt
 * ved neste forsøk, og skjemaet nullstiller widgeten når en innsending feiler.
 */
export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!turnstileIsConfigured) return true;
  if (token.length === 0) return false;

  const body = new URLSearchParams({ secret: SECRET_KEY, response: token });
  if (ip !== 'ukjent') body.set('remoteip', ip);

  try {
    const response = await fetch(SITEVERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      console.error('[turnstile] siteverify svarte ikke ok', { status: response.status });
      return false;
    }

    const data: unknown = await response.json();
    if (!isObject(data)) return false;

    if (data.success !== true) {
      // Feilkodene kommer fra Cloudflare, ikke fra innsenderen, og sier noe om
      // oppsettet vårt. De logges, men sendes aldri videre til klienten.
      console.error('[turnstile] token avvist', { codes: data['error-codes'] });
      return false;
    }
    return true;
  } catch {
    // Nettverksfeil mot Cloudflare. Vi avviser heller enn å slippe gjennom:
    // dette er en sikkerhetskontroll, i motsetning til hastighetsgrensa.
    console.error('[turnstile] kunne ikke nå siteverify');
    return false;
  }
}
