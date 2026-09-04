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

describe('verifyTurnstile', () => {
  test('slipper gjennom når Turnstile ikke er satt opp, slik at lokal dev virker', async () => {
    const { verifyTurnstile } = await importWith('', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await verifyTurnstile('', 'ukjent')).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('avviser tomt token uten å spørre Cloudflare', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await verifyTurnstile('', '1.2.3.4')).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('godtar token når siteverify svarer success', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ success: true }));
    expect(await verifyTurnstile('token', '1.2.3.4')).toBe(true);
  });

  test('avviser token når siteverify svarer success false', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ success: false, 'error-codes': ['invalid-input-response'] }),
    );
    expect(await verifyTurnstile('brukt-token', '1.2.3.4')).toBe(false);
  });

  test('avviser når Cloudflare ikke svarer, i motsetning til hastighetsgrensa', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('nettverk'));
    expect(await verifyTurnstile('token', '1.2.3.4')).toBe(false);
  });

  test('sender secret i kroppen, aldri i URL-en', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ success: true }));

    await verifyTurnstile('token', '1.2.3.4');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(String(url)).not.toContain(KEYS.secret);
    expect(String(init?.body)).toContain('remoteip=1.2.3.4');
  });

  test('utelater remoteip når IP-en er ukjent', async () => {
    const { verifyTurnstile } = await importWith(KEYS.site, KEYS.secret);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ success: true }));

    await verifyTurnstile('token', 'ukjent');

    expect(String(fetchSpy.mock.calls[0][1]?.body)).not.toContain('remoteip');
  });
});
