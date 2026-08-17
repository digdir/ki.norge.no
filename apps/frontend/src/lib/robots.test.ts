import { describe, expect, test } from 'vitest';
import { AI_CRAWLERS, CONTENT_SIGNAL, DISALLOWED_PATHS } from './robots';
import { EXCLUDED_PATH_PREFIXES, isExcludedPath } from './sitemap';
import { GET } from '../pages/robots.txt';

async function robotsFor(hostname: string): Promise<string> {
  const response = await (GET as any)({ url: new URL(`https://${hostname}/robots.txt`) });
  return response.text();
}

// Grupper i robots.txt slås ikke sammen. En agent bruker den mest spesifikke
// gruppen som matcher navnet, og ser da ingenting av det som står under "*".
function groupFor(body: string, userAgent: string): string | null {
  const groups = body.split(/\n\s*\n(?=User-agent:)/);
  const match = groups.find((g) =>
    g.split('\n').some((line) => line.trim().toLowerCase() === `user-agent: ${userAgent.toLowerCase()}`),
  );
  return match ?? null;
}

describe('robots.txt i produksjon', () => {
  test('wildcard-gruppen har alle Disallow-linjene', async () => {
    const body = await robotsFor('ki.norge.no');
    const group = groupFor(body, '*');

    expect(group).not.toBeNull();
    for (const path of DISALLOWED_PATHS) {
      expect(group).toContain(`Disallow: ${path}`);
    }
  });

  // Content-Signal er en HTTP-header, ikke et robots.txt-direktiv. Det lå her
  // fram til august 2026, men står ikke i robots.txt-spesifikasjonen, så
  // Lighthouse og Search Console forkastet hele fila som ugyldig. Havner det inn
  // igjen, faller SEO-scoren tilbake til 92 uten at noe annet ser galt ut.
  test('sender ikke Content-Signal som robots.txt-direktiv', async () => {
    const body = await robotsFor('ki.norge.no');

    expect(body).not.toContain('Content-Signal:');
    expect(body).not.toContain(CONTENT_SIGNAL);
  });

  test('hver AI-crawler har en gruppe som gjentar de samme reglene', async () => {
    const body = await robotsFor('ki.norge.no');

    for (const crawler of AI_CRAWLERS) {
      const group = groupFor(body, crawler);
      expect(group, `mangler gruppe for ${crawler}`).not.toBeNull();
      // Uten dette ville en navngitt crawler fått crawle /api/ og /status fritt.
      for (const path of DISALLOWED_PATHS) {
        expect(group, `${crawler} mangler Disallow: ${path}`).toContain(`Disallow: ${path}`);
      }
    }
  });

  test('peker på sitemap og llms.txt', async () => {
    const body = await robotsFor('ki.norge.no');
    expect(body).toContain('Sitemap: https://ki.norge.no/sitemap.xml');
    expect(body).toContain('https://ki.norge.no/llms.txt');
    // Forgjengeren, som lå i public/ og beskrev CMS-et som Strapi.
    expect(body).not.toContain('/llm.txt');
  });

  test('svarer text/plain med UTF-8 så æøå i kommentarene overlever', async () => {
    const response = await (GET as any)({ url: new URL('https://ki.norge.no/robots.txt') });
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toContain('språkmodeller');
  });
});

describe('robots.txt utenfor produksjon', () => {
  test('stenger alt', async () => {
    const body = await robotsFor('ki-norge-frontend-tt02.digitaliseringsdirektoratet.workers.dev');
    expect(body).toContain('User-agent: *');
    expect(body).toContain('Disallow: /');
    expect(body).not.toContain('Sitemap:');
  });
});

describe('robots.txt og sitemap holdes i takt', () => {
  test('alt robots stenger ute, holdes også utenfor sitemapet', () => {
    for (const path of DISALLOWED_PATHS) {
      // /media/ -> /media, som er formen sitemap-porten sjekker.
      const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
      expect(isExcludedPath(normalized), `${path} mangler i sitemapets utelukkelse`).toBe(true);
    }
  });

  test('sitemapets utelukkelser er dekket av robots', () => {
    for (const prefix of EXCLUDED_PATH_PREFIXES) {
      const covered = DISALLOWED_PATHS.some(
        (path) => path === prefix || path === `${prefix}/`,
      );
      expect(covered, `${prefix} mangler i robots.txt`).toBe(true);
    }
  });
});
