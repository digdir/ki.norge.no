import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

// /status på tt02 målte prod, fordi adressene var hardkodet. Endepunktet skal
// bare kontakte miljøets egne verter: CMS fra UMBRACO_URL, frontend fra origin.
//
// Modulen leser UMBRACO_URL ved import, så env settes FØR dynamisk import.
const CMS = 'https://kinorgeportal.tt02.dis-core.altinn.cloud';
const ORIGIN = 'https://ki.test.norge.no';

const hentet: string[] = [];
let body: { checks: { name: string; url: string }[] };

beforeAll(async () => {
  vi.stubEnv('UMBRACO_URL', CMS);
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    hentet.push(String(input));
    return new Response('ok');
  }));
  const { GET } = await import('../pages/api/status-checks');
  const res = await GET({ url: new URL(`${ORIGIN}/api/status-checks`) } as never);
  body = await res.json();
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('status-checks', () => {
  test('kontakter bare miljøets egne verter', () => {
    expect(hentet.length).toBeGreaterThan(0);
    for (const url of hentet) {
      expect([CMS, ORIGIN]).toContain(new URL(url).origin);
    }
  });

  test('frontend-sjekken går mot forespørselens origin', () => {
    expect(body.checks.find((c) => c.name === 'Frontend')?.url).toBe(`${ORIGIN}/`);
  });

  test('CMS-sjekkene går mot UMBRACO_URL', () => {
    const cms = body.checks.filter((c) => c.name.startsWith('CMS'));
    expect(cms.length).toBe(2);
    for (const c of cms) expect(c.url.startsWith(`${CMS}/`)).toBe(true);
  });
});
