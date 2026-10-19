import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { clientKey, withinRateLimit } from './rate-limit';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('clientKey', () => {
  test('uses CF-Connecting-IP, which Cloudflare sets and the client cannot override', () => {
    const request = new Request('https://ki.norge.no/api/ki-tiltak', {
      headers: { 'CF-Connecting-IP': '203.0.113.7' },
    });
    expect(clientKey(request)).toBe('203.0.113.7');
  });

  test('falls back to one shared bucket without the header', () => {
    expect(clientKey(new Request('https://ki.norge.no/api/ki-tiltak'))).toBe('ukjent');
  });

  test('ignores X-Forwarded-For, which the client can make up', () => {
    const request = new Request('https://ki.norge.no/api/ki-tiltak', {
      headers: { 'X-Forwarded-For': '203.0.113.9' },
    });
    expect(clientKey(request)).toBe('ukjent');
  });
});

describe('withinRateLimit', () => {
  test('lets through without a binding, so the node adapter in dev and the tests work', async () => {
    const request = new Request('https://ki.norge.no/api/search', {
      headers: { 'CF-Connecting-IP': '203.0.113.7' },
    });
    expect(await withinRateLimit('SEARCH_LIMIT', request)).toBe(true);
    expect(await withinRateLimit('TILTAK_LIMIT', request)).toBe(true);
  });
});
