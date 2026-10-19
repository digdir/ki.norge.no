import { describe, expect, test } from 'vitest';
import { AI_CRAWLERS, CONTENT_SIGNAL, DISALLOWED_PATHS } from './robots';
import { EXCLUDED_PATH_PREFIXES, isExcludedPath } from './sitemap';
import { GET } from '../pages/robots.txt';

async function robotsFor(hostname: string): Promise<string> {
  const response = await (GET as any)({ url: new URL(`https://${hostname}/robots.txt`) });
  return response.text();
}

// Groups in robots.txt are not merged. An agent uses the most specific
// group that matches its name, and then sees nothing of what is under "*".
function groupFor(body: string, userAgent: string): string | null {
  const groups = body.split(/\n\s*\n(?=User-agent:)/);
  const match = groups.find((g) =>
    g.split('\n').some((line) => line.trim().toLowerCase() === `user-agent: ${userAgent.toLowerCase()}`),
  );
  return match ?? null;
}

describe('robots.txt in production', () => {
  test('the wildcard group has all the Disallow lines', async () => {
    const body = await robotsFor('ki.norge.no');
    const group = groupFor(body, '*');

    expect(group).not.toBeNull();
    for (const path of DISALLOWED_PATHS) {
      expect(group).toContain(`Disallow: ${path}`);
    }
  });

  // Content-Signal is an HTTP header, not a robots.txt directive. It was here
  // until August 2026, but is not in the robots.txt specification, so
  // Lighthouse and Search Console rejected the whole file as invalid. If it ends up here
  // again, the SEO score drops back to 92 without anything else looking wrong.
  test('does not send Content-Signal as a robots.txt directive', async () => {
    const body = await robotsFor('ki.norge.no');

    expect(body).not.toContain('Content-Signal:');
    expect(body).not.toContain(CONTENT_SIGNAL);
  });

  test('every AI crawler has a group that repeats the same rules', async () => {
    const body = await robotsFor('ki.norge.no');

    for (const crawler of AI_CRAWLERS) {
      const group = groupFor(body, crawler);
      expect(group, `missing group for ${crawler}`).not.toBeNull();
      // Without this a named crawler would be free to crawl /api/ and /media/.
      for (const path of DISALLOWED_PATHS) {
        expect(group, `${crawler} is missing Disallow: ${path}`).toContain(`Disallow: ${path}`);
      }
    }
  });

  test('points to the sitemap and llms.txt', async () => {
    const body = await robotsFor('ki.norge.no');
    expect(body).toContain('Sitemap: https://ki.norge.no/sitemap.xml');
    expect(body).toContain('https://ki.norge.no/llms.txt');
    // The predecessor, which lived in public/ and described the CMS as Strapi.
    expect(body).not.toContain('/llm.txt');
  });

  test('responds text/plain with UTF-8 so æøå in the comments survive', async () => {
    const response = await (GET as any)({ url: new URL('https://ki.norge.no/robots.txt') });
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toContain('språkmodeller');
  });
});

describe('robots.txt outside production', () => {
  test('blocks everything', async () => {
    const body = await robotsFor('ki-norge-frontend-tt02.digitaliseringsdirektoratet.workers.dev');
    expect(body).toContain('User-agent: *');
    expect(body).toContain('Disallow: /');
    expect(body).not.toContain('Sitemap:');
  });
});

describe('robots.txt and sitemap are kept in sync', () => {
  test('everything robots blocks is also kept out of the sitemap', () => {
    for (const path of DISALLOWED_PATHS) {
      // /media/ -> /media, which is the form the sitemap gate checks.
      const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
      expect(isExcludedPath(normalized), `${path} is missing from the sitemap exclusions`).toBe(true);
    }
  });

  test('the sitemap exclusions are covered by robots', () => {
    for (const prefix of EXCLUDED_PATH_PREFIXES) {
      const covered = DISALLOWED_PATHS.some(
        (path) => path === prefix || path === `${prefix}/`,
      );
      expect(covered, `${prefix} is missing from robots.txt`).toBe(true);
    }
  });
});
