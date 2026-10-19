import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

// Mock only the crawl (the network). resolveContentUrl stays real so the two
// exclusion gates and the route resolution are tested for what they actually do.
vi.mock('./umbraco', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./umbraco')>();
  return { ...actual, fetchAllPublishedContent: vi.fn() };
});

import { fetchAllPublishedContent, type RawContentNode } from './umbraco';
import { generateSitemapXml, isExcludedPath } from './sitemap';

const mockedCrawl = vi.mocked(fetchAllPublishedContent);

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

function lastmods(xml: string): string[] {
  return [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
}

// A separate base per test to avoid the internal hourly cache leaking between tests.
let baseCounter = 0;
function uniqueBase(): string {
  baseCounter += 1;
  return `https://t${baseCounter}.example`;
}

async function sitemapFor(nodes: RawContentNode[]): Promise<{ xml: string; base: string }> {
  const base = uniqueBase();
  mockedCrawl.mockResolvedValue(nodes);
  const xml = await generateSitemapXml(base);
  return { xml, base };
}

describe('isExcludedPath (gate 2: path prefix that mirrors robots.txt)', () => {
  test.each(['/media/bilde.png', '/api/soek', '/preview-tilgang', '/503', '/404'])(
    '%s is excluded',
    (path) => {
      expect(isExcludedPath(path)).toBe(true);
    },
  );

  test.each(['/', '/artikler', '/artikler/min-artikkel', '/kalender', '/kalender/fagdag', '/om-oss', '/sokeresultat'])(
    '%s is not excluded',
    (path) => {
      expect(isExcludedPath(path)).toBe(false);
    },
  );
});

describe('collectSitemapUrls via generateSitemapXml', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('a normal node is included, an unmapped type and an excluded path are dropped', async () => {
    const nodes: RawContentNode[] = [
      { id: '1', contentType: 'artikkel', updateDate: '2026-02-01T10:00:00Z', properties: { slug: 'ki-i-skolen' } },
      { id: '2', contentType: 'eksempel', updateDate: '2026-02-02T10:00:00Z', properties: { slug: 'chatbot' } },
      { id: '3', contentType: 'side', updateDate: '2026-02-03T10:00:00Z', properties: { slug: 'personvern' } },
      { id: '4', contentType: 'forside', properties: {} },
      // Gate 1: no route in content-routes.json → dropped.
      { id: '5', contentType: 'globaleInnstillinger', properties: {} },
      // Gate 2: a `side` with a reserved slug resolves to /404 → dropped.
      { id: '6', contentType: 'side', properties: { slug: '404' } },
    ];

    const { xml, base } = await sitemapFor(nodes);
    const found = locs(xml);

    expect(found).toContain(`${base}/artikler/ki-i-skolen`);
    expect(found).toContain(`${base}/eksempler/chatbot`);
    expect(found).toContain(`${base}/personvern`);
    expect(found).toContain(`${base}/`); // forside
    // An unmapped type gives no URL.
    expect(found.some((u) => u.includes('globaleInnstillinger') || u.endsWith('/undefined'))).toBe(false);
    // The excluded path is gone.
    expect(found.some((u) => u.endsWith('/404'))).toBe(false);
  });

  test('kalenderhendelse ends up at /kalender/{slug} (new route, end to end)', async () => {
    const nodes: RawContentNode[] = [
      { id: '1', contentType: 'kalenderhendelse', updateDate: '2026-03-03T08:30:00Z', properties: { slug: 'markedsdialog' } },
      { id: '2', contentType: 'kalender', properties: {} }, // the overview
    ];
    const { xml, base } = await sitemapFor(nodes);
    const found = locs(xml);
    expect(found).toContain(`${base}/kalender/markedsdialog`);
    expect(found).toContain(`${base}/kalender`);
  });

  test('lastmod is read from updateDate and is valid ISO 8601', async () => {
    const nodes: RawContentNode[] = [
      { id: '1', contentType: 'artikkel', updateDate: '2026-02-01T10:00:00Z', properties: { slug: 'a' } },
    ];
    const { xml } = await sitemapFor(nodes);
    const mods = lastmods(xml);
    expect(mods).toHaveLength(1);
    expect(mods[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('the same URL from several nodes is deduped, the newest lastmod is kept', async () => {
    const nodes: RawContentNode[] = [
      { id: '1', contentType: 'artikkel', updateDate: '2026-01-01T00:00:00Z', properties: { slug: 'dupe' } },
      { id: '2', contentType: 'artikkel', updateDate: '2026-05-05T00:00:00Z', properties: { slug: 'dupe' } },
    ];
    const { xml, base } = await sitemapFor(nodes);
    const found = locs(xml).filter((u) => u === `${base}/artikler/dupe`);
    expect(found).toHaveLength(1);
    expect(lastmods(xml)).toContain('2026-05-05T00:00:00.000Z');
  });

  test('an empty crawl gives a well-formed but empty urlset', async () => {
    const { xml } = await sitemapFor([]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
  });

  test('output is a well-formed sitemap 0.9 with absolute locs', async () => {
    const nodes: RawContentNode[] = [
      { id: '1', contentType: 'artikkel', updateDate: '2026-02-01T10:00:00Z', properties: { slug: 'a' } },
      { id: '2', contentType: 'side', properties: { slug: 'en-side' } },
    ];
    const { xml } = await sitemapFor(nodes);

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);

    for (const loc of locs(xml)) {
      expect(() => new URL(loc)).not.toThrow();
      expect(loc.startsWith('https://')).toBe(true);
    }
  });
});
