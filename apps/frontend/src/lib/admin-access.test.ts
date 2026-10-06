import { describe, expect, test } from 'vitest';
import { ADMIN_COOKIE_MAX_AGE, adminToken, handleAdminAccess, isAdminCookie, keyMatches, requiresAdmin, safeEqual } from './admin-access';

const HEMMELIG = 'en-lang-og-tilfeldig-hemmelighet';

describe('safeEqual', () => {
  test('like strenger er like', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
  });

  test('ulike strenger og ulik lengde er ulike', () => {
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', 'a')).toBe(false);
  });
});

describe('adminToken', () => {
  test('uten hemmelighet finnes ingen gyldig verdi', async () => {
    expect(await adminToken('')).toBeNull();
  });

  test('bærer utløpet, og avslører ikke hemmeligheten', async () => {
    const now = Date.UTC(2026, 9, 6);
    const token = (await adminToken(HEMMELIG, now))!;
    expect(token).toMatch(/^v2\.\d+\.[0-9a-f]{64}$/);
    expect(Number(token.split('.')[1])).toBe(now / 1000 + ADMIN_COOKIE_MAX_AGE);
    expect(token).not.toContain(HEMMELIG);
  });

  test('ny hemmelighet gir ny verdi', async () => {
    const now = Date.now();
    expect(await adminToken(HEMMELIG, now)).not.toBe(await adminToken(`${HEMMELIG}-rotert`, now));
  });
});

describe('isAdminCookie', () => {
  // Hullet som ble funnet: middlewaren sjekket bare at cookien fantes.
  test('en egenlaget ki_admin=1 slipper ikke inn', async () => {
    expect(await isAdminCookie('1', HEMMELIG)).toBe(false);
  });

  test('verdien fra /admin-tilgang slipper inn', async () => {
    expect(await isAdminCookie((await adminToken(HEMMELIG))!, HEMMELIG)).toBe(true);
  });

  test('en gammel cookie slutter å gjelde når hemmeligheten roteres', async () => {
    const gammel = (await adminToken(HEMMELIG))!;
    expect(await isAdminCookie(gammel, `${HEMMELIG}-rotert`)).toBe(false);
  });

  test('avvises etter 30 dager, selv om nettleseren beholder den', async () => {
    const satt = Date.now();
    const token = (await adminToken(HEMMELIG, satt))!;
    expect(await isAdminCookie(token, HEMMELIG, satt + (ADMIN_COOKIE_MAX_AGE - 60) * 1000)).toBe(true);
    expect(await isAdminCookie(token, HEMMELIG, satt + (ADMIN_COOKIE_MAX_AGE + 1) * 1000)).toBe(false);
  });

  test('et forlenget utløp gir feil signatur', async () => {
    const [versjon, utlop, sig] = (await adminToken(HEMMELIG))!.split('.');
    const forlenget = `${versjon}.${Number(utlop) + 365 * 24 * 3600}.${sig}`;
    expect(await isAdminCookie(forlenget, HEMMELIG)).toBe(false);
  });

  test('cookien fra før utløpet kom med, slipper ikke inn', async () => {
    expect(await isAdminCookie('a'.repeat(64), HEMMELIG)).toBe(false);
  });

  test('uten hemmelighet slipper ingenting inn, heller ikke tom cookie', async () => {
    expect(await isAdminCookie('', '')).toBe(false);
    expect(await isAdminCookie('1', '')).toBe(false);
    expect(await isAdminCookie(undefined, HEMMELIG)).toBe(false);
  });
});

describe('handleAdminAccess', () => {
  const URL_ = 'https://ki.norge.no/admin-tilgang';
  const alltid = async () => true;
  const post = (key: string) =>
    new Request(URL_, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key }),
    });

  test('uten nøkkel vises skjemaet, uncachet og uten mulighet for innramming', async () => {
    const res = await handleAdminAccess(new Request(URL_), HEMMELIG, alltid);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('method="post"');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });

  test('riktig nøkkel fra skjemaet gir cookie og videresending', async () => {
    const res = await handleAdminAccess(post(HEMMELIG), HEMMELIG, alltid);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/status');
    const cookie = res.headers.get('Set-Cookie')!;
    const verdi = cookie.match(/^ki_admin=([^;]+)/)![1];
    expect(await isAdminCookie(verdi, HEMMELIG)).toBe(true);
    expect(cookie).toContain(`Max-Age=${ADMIN_COOKIE_MAX_AGE}`);
  });

  test('lenken med ?key= virker fortsatt', async () => {
    const res = await handleAdminAccess(new Request(`${URL_}?key=${HEMMELIG}`), HEMMELIG, alltid);
    expect(res.status).toBe(302);
  });

  test('feil nøkkel gir 401 uten cookie', async () => {
    for (const req of [post('feil'), new Request(`${URL_}?key=feil`), post('')]) {
      const res = await handleAdminAccess(req, HEMMELIG, alltid);
      expect(res.status).toBe(401);
      expect(res.headers.get('Set-Cookie')).toBeNull();
    }
  });

  test('over grensen gir 429, også med riktig nøkkel', async () => {
    const res = await handleAdminAccess(post(HEMMELIG), HEMMELIG, async () => false);
    expect(res.status).toBe(429);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  test('å vise skjemaet teller ikke som forsøk', async () => {
    let forsok = 0;
    await handleAdminAccess(new Request(URL_), HEMMELIG, async () => (forsok++, true));
    expect(forsok).toBe(0);
  });

  test('uten hemmelighet slipper ingen nøkkel inn', async () => {
    expect((await handleAdminAccess(post(''), '', alltid)).status).toBe(401);
    expect((await handleAdminAccess(post('noe'), '', alltid)).status).toBe(401);
  });
});

describe('keyMatches', () => {
  test('riktig nøkkel', () => {
    expect(keyMatches(HEMMELIG, HEMMELIG)).toBe(true);
  });

  test('feil, tom eller manglende nøkkel, eller manglende hemmelighet', () => {
    expect(keyMatches('feil', HEMMELIG)).toBe(false);
    expect(keyMatches('', HEMMELIG)).toBe(false);
    expect(keyMatches(null, HEMMELIG)).toBe(false);
    expect(keyMatches('', '')).toBe(false);
  });
});

describe('requiresAdmin', () => {
  test('de beskyttede rutene', () => {
    expect(requiresAdmin('/status')).toBe(true);
    expect(requiresAdmin('/api/status-checks')).toBe(true);
  });

  // Begge svarte 200 uten cookie i prod, fordi sjekken var et eksakt oppslag.
  test('skråstrek til slutt slipper ikke forbi', () => {
    expect(requiresAdmin('/api/status-checks/')).toBe(true);
    expect(requiresAdmin('/api/status-checks//')).toBe(true);
    expect(requiresAdmin('/status/')).toBe(true);
  });

  test('markdown-varianten av statussiden er også beskyttet', () => {
    expect(requiresAdmin('/status.md')).toBe(true);
    expect(requiresAdmin('/status/.md')).toBe(true);
  });

  test('prosentkodet sti beskyttes som den dekodede', () => {
    expect(requiresAdmin('/api/status%2Dchecks')).toBe(true);
    expect(requiresAdmin('/%73tatus')).toBe(true);
  });

  test('vanlige sider og ugyldig koding krever ikke admin', () => {
    expect(requiresAdmin('/')).toBe(false);
    expect(requiresAdmin('/statusside')).toBe(false);
    expect(requiresAdmin('/artikler/status')).toBe(false);
    expect(requiresAdmin('/api/search')).toBe(false);
    expect(requiresAdmin('/%E0%A4%A')).toBe(false);
  });
});
