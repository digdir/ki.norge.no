import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * turnstile.ts leser nøklene på modulnivå, så hver test stubber env og
 * importerer modulen på nytt. Da testes den faktiske oppførselen, ikke en
 * omskrevet kopi av den.
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
  test('krever begge nøklene', async () => {
    expect((await importWith('', '')).turnstileIsConfigured).toBe(false);
    expect((await importWith(KEYS.site, '')).turnstileIsConfigured).toBe(false);
    expect((await importWith('', KEYS.secret)).turnstileIsConfigured).toBe(false);
    expect((await importWith(KEYS.site, KEYS.secret)).turnstileIsConfigured).toBe(true);
  });
});

/** Cloudflares testnøkler svarer med example.com, så svaret her settes for hånd. */
function siteverifyAnswer(body: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(body));
}

const SOLVED_IN_PROD = { success: true, hostname: 'ki.norge.no' };

describe('verifyTurnstile', () => {
  test('avviser når hemmeligheten mangler i drift, uten å spørre Cloudflare', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await verifyTurnstile('token', '1.2.3.4', 'ki.norge.no')).toBe('not_configured');
    expect(await verifyTurnstile('token', '1.2.3.4', 'ki.test.norge.no')).toBe('not_configured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('slipper gjennom på localhost når Turnstile ikke er satt opp', async () => {
    const { verifyTurnstile } = await importWith('', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await verifyTurnstile('', 'ukjent', 'localhost')).toBe('ok');
    expect(await verifyTurnstile('', 'ukjent', '127.0.0.1')).toBe('ok');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('avviser tomt token uten å spørre Cloudflare', async () => {
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
  ])('godtar token løst på %s', async (hostname) => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    siteverifyAnswer({ success: true, hostname });
    expect(await verifyTurnstile('token', '1.2.3.4', 'ki.norge.no')).toBe('ok');
  });

  test.each(['example.com', 'ki.norge.no.example.com', ''])('avviser token løst på «%s»', async (hostname) => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    siteverifyAnswer({ success: true, hostname });
    expect(await verifyTurnstile('token', '1.2.3.4', 'ki.norge.no')).toBe('rejected');
  });

  test('avviser token uten hostname i svaret', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    siteverifyAnswer({ success: true });
    expect(await verifyTurnstile('token', '1.2.3.4', 'ki.norge.no')).toBe('rejected');
  });

  test('godtar localhost bare når forespørselen også kommer dit', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    siteverifyAnswer({ success: true, hostname: 'localhost' });
    expect(await verifyTurnstile('token', '1.2.3.4', 'localhost')).toBe('ok');
    expect(await verifyTurnstile('token', '1.2.3.4', 'ki.norge.no')).toBe('rejected');
  });

  test('avviser token når siteverify svarer success false', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    siteverifyAnswer({ success: false, 'error-codes': ['invalid-input-response'] });
    expect(await verifyTurnstile('brukt-token', '1.2.3.4', 'ki.norge.no')).toBe('rejected');
  });

  test('avviser når Cloudflare ikke svarer, i motsetning til hastighetsgrensa', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('nettverk'));
    expect(await verifyTurnstile('token', '1.2.3.4', 'ki.norge.no')).toBe('rejected');
  });

  test('avviser når siteverify svarer med feilstatus', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    expect(await verifyTurnstile('token', '1.2.3.4', 'ki.norge.no')).toBe('rejected');
  });

  test('sender secret i kroppen, aldri i URL-en', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    const fetchSpy = siteverifyAnswer(SOLVED_IN_PROD);

    await verifyTurnstile('token', '1.2.3.4', 'ki.norge.no');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(String(url)).not.toContain(KEYS.secret);
    expect(String(init?.body)).toContain('remoteip=1.2.3.4');
  });

  test('utelater remoteip når IP-en er ukjent', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    const fetchSpy = siteverifyAnswer(SOLVED_IN_PROD);

    await verifyTurnstile('token', 'ukjent', 'ki.norge.no');

    expect(String(fetchSpy.mock.calls[0][1]?.body)).not.toContain('remoteip');
  });
});
