import type { APIRoute } from 'astro';
import { validateTiltakForm } from '../../components/ki-tiltak/validateTiltakForm';
import { emailIsConfigured, sendTiltakEmail } from '../../lib/graph-email';
import { buildEmail, parseTiltakForm } from '../../lib/ki-tiltak-email';
import { clientKey, withinRateLimit } from '../../lib/rate-limit';
import { turnstileIsConfigured, verifyTurnstile } from '../../lib/turnstile';

export const prerender = false;

/**
 * Tar imot «Del KI-tiltak» og videresender innsendingen til redaksjonens
 * postboks. Ruta er uten mellomlagring, både fordi svaret er per innsending og
 * fordi cache-infoportal ellers ville delt det mellom brukere.
 *
 * Ruta er åpen, og driver en Graph-legitimasjon som kan sende e-post. To
 * kontroller står foran den: Turnstile skiller mennesker fra boter, og
 * hastighetsgrensa demper mengden fra én kilde. Se src/lib/turnstile.ts for
 * hvorfor rekkefølgen er slik.
 */

/** Rikelig for et skjema der beskrivelsen er begrenset til 400 tegn. */
const BODY_MAX_BYTES = 8 * 1024;

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function readToken(body: unknown): string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return '';
  const value = (body as Record<string, unknown>).turnstileToken;
  return typeof value === 'string' ? value : '';
}

export const POST: APIRoute = async ({ request }) => {
  try {
    // Først, siden den er lokal og ikke trenger kroppen.
    if (!(await withinRateLimit('TILTAK_LIMIT', request))) {
      return jsonResponse({ error: 'rate_limited' }, 429);
    }

    const raw = await request.text();
    if (raw.length > BODY_MAX_BYTES) {
      return jsonResponse({ error: 'too_large' }, 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }

    const form = parseTiltakForm(body);
    if (form === null) return jsonResponse({ error: 'invalid_body' }, 400);

    // Samme validering som i nettleseren. Klienten er ikke til å stole på, så
    // den kjøres her også. Oppslag mot Enhetsregisteret utelates med vilje:
    // det er en hjelp til datakvalitet, ikke en sikkerhetskontroll.
    const errors = validateTiltakForm(form);
    if (errors.length > 0) {
      return jsonResponse({ error: 'validation', fields: errors.map((f) => f.field) }, 400);
    }

    // Etter valideringen, slik at en åpenbart ugyldig kropp ikke koster en
    // rundtur til Cloudflare. Tokenet er engangs, så klienten henter et nytt
    // ved neste forsøk.
    if (!(await verifyTurnstile(readToken(body), clientKey(request)))) {
      return jsonResponse({ error: 'turnstile_failed' }, 403);
    }

    if (!emailIsConfigured) {
      console.error('[ki-tiltak] innsending mottatt, men e-post er ikke konfigurert');
      return jsonResponse({ error: 'not_configured' }, 503);
    }

    if (!turnstileIsConfigured) {
      // Verifiseringen slipper gjennom når nøklene mangler, slik at lokal dev
      // virker. I drift er det en feil, og den skal være synlig i loggen.
      console.error('[ki-tiltak] Turnstile er ikke konfigurert, innsending slapp gjennom ukontrollert');
    }

    const { subject, text } = buildEmail(form);
    const result = await sendTiltakEmail(subject, text, form.kontaktinfo.trim());

    if (!result.ok) {
      // Årsaken logges, men sendes ikke videre. Den sier noe om oppsettet vårt
      // og hører ikke hjemme hos innsenderen.
      console.error('[ki-tiltak] kunne ikke sende innsending', { reason: result.reason });
      return jsonResponse({ error: 'send_failed' }, 502);
    }

    return jsonResponse({ ok: true }, 202);
  } catch (err) {
    console.error('[ki-tiltak] uventet feil', err);
    return jsonResponse({ error: 'unexpected' }, 500);
  }
};
