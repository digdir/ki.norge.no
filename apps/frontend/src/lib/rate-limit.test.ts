import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { clientKey, withinRateLimit } from './rate-limit';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('clientKey', () => {
  test('bruker CF-Connecting-IP, som Cloudflare setter og klienten ikke kan overstyre', () => {
    const request = new Request('https://ki.norge.no/api/ki-tiltak', {
      headers: { 'CF-Connecting-IP': '203.0.113.7' },
    });
    expect(clientKey(request)).toBe('203.0.113.7');
  });

  test('faller tilbake til én felles bøtte uten headeren', () => {
    expect(clientKey(new Request('https://ki.norge.no/api/ki-tiltak'))).toBe('ukjent');
  });

  test('ignorerer X-Forwarded-For, som klienten kan finne på selv', () => {
    const request = new Request('https://ki.norge.no/api/ki-tiltak', {
      headers: { 'X-Forwarded-For': '203.0.113.9' },
    });
    expect(clientKey(request)).toBe('ukjent');
  });
});

describe('withinRateLimit', () => {
  test('slipper gjennom uten binding, slik at node-adapteren i dev og testene virker', async () => {
    const request = new Request('https://ki.norge.no/api/search', {
      headers: { 'CF-Connecting-IP': '203.0.113.7' },
    });
    expect(await withinRateLimit('SEARCH_LIMIT', request)).toBe(true);
    expect(await withinRateLimit('TILTAK_LIMIT', request)).toBe(true);
  });
});
