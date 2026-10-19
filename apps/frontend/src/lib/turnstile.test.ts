import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * turnstile.ts reads the keys at module level, so each test stubs env and
 * imports the module again. That tests the actual behaviour, not a
 * rewritten copy of it.
 */
async function importWith(siteKey: string, secretKey: string) {
  vi.resetModules();
  vi.stubEnv('TURNSTILE_SITE_KEY', siteKey);
  vi.stubEnv('TURNSTILE_SECRET_KEY', secretKey);
  return import('./turnstile');
}

const KEYS = { site: '1x00000000000000000000AA', secret: '1x0000000000000000000000000000000AA' };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('turnstileIsConfigured', () => {
  test('requires both keys', async () => {
    expect((await importWith('', '')).turnstileIsConfigured).toBe(false);
    expect((await importWith(KEYS.site, '')).turnstileIsConfigured).toBe(false);
    expect((await importWith('', KEYS.secret)).turnstileIsConfigured).toBe(false);
    expect((await importWith(KEYS.site, KEYS.secret)).turnstileIsConfigured).toBe(true);
  });
});

/** Cloudflare's test keys answer with example.com, so the response here is set by hand. */
function siteverifyAnswer(body: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(body));
}

const SOLVED_IN_PROD = { success: true, hostname: 'ki.norge.no' };

describe('verifyTurnstile', () => {
  test('rejects when the secret is missing in production, without asking Cloudflare', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await verifyTurnstile('token', '1.2.3.4', 'ki.norge.no')).toBe('not_configured');
    expect(await verifyTurnstile('token', '1.2.3.4', 'ki.test.norge.no')).toBe('not_configured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('lets through on localhost when Turnstile is not set up', async () => {
    const { verifyTurnstile } = await importWith('', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await verifyTurnstile('', 'ukjent', 'localhost')).toBe('ok');
    expect(await verifyTurnstile('', 'ukjent', '127.0.0.1')).toBe('ok');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('rejects an empty token without asking Cloudflare', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await verifyTurnstile('', '1.2.3.4', 'ki.norge.no')).toBe('rejected');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test.each([
    'ki.norge.no',
    'ki.test.norge.no',
    'ki-norge-frontend-prod.digitaliseringsdirektoratet.workers.dev',
    'ki-norge-frontend-tt02.digitaliseringsdirektoratet.workers.dev',
  ])('accepts a token solved on %s', async (hostname) => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    siteverifyAnswer({ success: true, hostname });
    expect(await verifyTurnstile('token', '1.2.3.4', 'ki.norge.no')).toBe('ok');
  });

  test.each(['example.com', 'ki.norge.no.example.com', ''])('rejects a token solved on "%s"', async (hostname) => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    siteverifyAnswer({ success: true, hostname });
    expect(await verifyTurnstile('token', '1.2.3.4', 'ki.norge.no')).toBe('rejected');
  });

  test('rejects a token without hostname in the response', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    siteverifyAnswer({ success: true });
    expect(await verifyTurnstile('token', '1.2.3.4', 'ki.norge.no')).toBe('rejected');
  });

  test('accepts localhost only when the request also comes there', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    siteverifyAnswer({ success: true, hostname: 'localhost' });
    expect(await verifyTurnstile('token', '1.2.3.4', 'localhost')).toBe('ok');
    expect(await verifyTurnstile('token', '1.2.3.4', 'ki.norge.no')).toBe('rejected');
  });

  test('rejects the token when siteverify answers success false', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    siteverifyAnswer({ success: false, 'error-codes': ['invalid-input-response'] });
    expect(await verifyTurnstile('brukt-token', '1.2.3.4', 'ki.norge.no')).toBe('rejected');
  });

  test('rejects when Cloudflare does not respond, unlike the rate limit', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    expect(await verifyTurnstile('token', '1.2.3.4', 'ki.norge.no')).toBe('rejected');
  });

  test('rejects when siteverify answers with an error status', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    expect(await verifyTurnstile('token', '1.2.3.4', 'ki.norge.no')).toBe('rejected');
  });

  test('sends the secret in the body, never in the URL', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    const fetchSpy = siteverifyAnswer(SOLVED_IN_PROD);

    await verifyTurnstile('token', '1.2.3.4', 'ki.norge.no');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(String(url)).not.toContain(KEYS.secret);
    expect(String(init?.body)).toContain('remoteip=1.2.3.4');
  });

  test('leaves out remoteip when the IP is unknown', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    const fetchSpy = siteverifyAnswer(SOLVED_IN_PROD);

    await verifyTurnstile('token', 'ukjent', 'ki.norge.no');

    expect(String(fetchSpy.mock.calls[0][1]?.body)).not.toContain('remoteip');
  });
});
