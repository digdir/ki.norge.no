import type { APIRoute } from 'astro';
import { validateTiltakForm } from '../../components/ki-tiltak/validateTiltakForm';
import { emailIsConfigured, sendTiltakEmail } from '../../lib/graph-email';
import { buildEmail, parseTiltakForm } from '../../lib/ki-tiltak-email';
import { clientKey, withinRateLimit } from '../../lib/rate-limit';
import { verifyTurnstile } from '../../lib/turnstile';

export const prerender = false;

/**
 * Receives "Del KI-tiltak" and forwards the submission to the editorial
 * mailbox. The route is uncached, both because the response is per submission
 * and because cache-infoportal would otherwise share it between users.
 *
 * The route is open and drives a Graph credential that can send email. Two
 * checks sit in front of it: Turnstile tells humans from bots, and the
 * rate limit dampens the volume from a single source. See src/lib/turnstile.ts
 * for why the order is like this.
 */

/** Plenty for a form where the description is limited to 400 characters. */
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
    // First, since it is local and does not need the body.
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

    // Same validation as in the browser. The client cannot be trusted, so
    // it runs here too. The Enhetsregisteret lookup is left out on purpose:
    // it is an aid to data quality, not a security check.
    const errors = validateTiltakForm(form);
    if (errors.length > 0) {
      return jsonResponse({ error: 'validation', fields: errors.map((f) => f.field) }, 400);
    }

    // After validation, so that an obviously invalid body does not cost a
    // round trip to Cloudflare. The token is single-use, so the client fetches
    // a new one on the next attempt.
    const turnstile = await verifyTurnstile(
      readToken(body),
      clientKey(request),
      new URL(request.url).hostname,
    );
    if (turnstile === 'not_configured') {
      return jsonResponse({ error: 'turnstile_not_configured' }, 503);
    }
    if (turnstile === 'rejected') {
      return jsonResponse({ error: 'turnstile_failed' }, 403);
    }

    if (!emailIsConfigured) {
      console.error('[ki-tiltak] submission received, but email is not configured');
      return jsonResponse({ error: 'not_configured' }, 503);
    }

    const { subject, text } = buildEmail(form);
    const result = await sendTiltakEmail(subject, text, form.kontaktinfo.trim());

    if (!result.ok) {
      // The reason is logged but not passed on. It says something about our setup
      // and does not belong with the submitter.
      console.error('[ki-tiltak] could not send submission', { reason: result.reason });
      return jsonResponse({ error: 'send_failed' }, 502);
    }

    return jsonResponse({ ok: true }, 202);
  } catch (err) {
    console.error('[ki-tiltak] unexpected error', err);
    return jsonResponse({ error: 'unexpected' }, 500);
  }
};
