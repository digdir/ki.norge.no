import { describe, expect, test } from 'vitest';
import { adminToken, isAdminCookie, keyMatches, safeEqual } from './admin-access';

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

  test('er stabil, og avslører ikke hemmeligheten', async () => {
    const a = await adminToken(HEMMELIG);
    expect(a).toBe(await adminToken(HEMMELIG));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain(HEMMELIG);
  });

  test('ny hemmelighet gir ny verdi', async () => {
    expect(await adminToken(HEMMELIG)).not.toBe(await adminToken(`${HEMMELIG}-rotert`));
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

  test('uten hemmelighet slipper ingenting inn, heller ikke tom cookie', async () => {
    expect(await isAdminCookie('', '')).toBe(false);
    expect(await isAdminCookie('1', '')).toBe(false);
    expect(await isAdminCookie(undefined, HEMMELIG)).toBe(false);
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
