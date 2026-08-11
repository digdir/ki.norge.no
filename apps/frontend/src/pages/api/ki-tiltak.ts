import type { APIRoute } from 'astro';
import { validateTiltakForm } from '../../components/ki-tiltak/validateTiltakForm';
import { emailIsConfigured, sendTiltakEmail } from '../../lib/graph-email';
import { buildEmail, parseTiltakForm } from '../../lib/ki-tiltak-email';

export const prerender = false;

/**
 * Tar imot «Del KI-tiltak» og videresender innsendingen til redaksjonens
 * postboks. Ruta er uten mellomlagring, både fordi svaret er per innsending og
 * fordi cache-infoportal ellers ville delt det mellom brukere.
 */

/** Rikelig for et skjema der beskrivelsen er begrenset til 400 tegn. */
const BODY_MAX_BYTES = 8 * 1024;

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const POST: APIRoute = async ({ request }) => {
  try {
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

    if (!emailIsConfigured) {
      console.error('[ki-tiltak] innsending mottatt, men e-post er ikke konfigurert');
      return jsonResponse({ error: 'not_configured' }, 503);
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
