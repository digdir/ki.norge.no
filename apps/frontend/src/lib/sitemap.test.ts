import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

// Mock kun crawlen (nettverket). resolveContentUrl beholdes ekte slik at de to
// utelukkelses-portene og rute-resolveringen testes for det de faktisk gjør.
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

// Egen base per test for å unngå at den interne timecachen lekker mellom tester.
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

describe('isExcludedPath (port 2: sti-prefiks som speiler robots.txt)', () => {
  test.each(['/status', '/media/bilde.png', '/api/soek', '/admin-tilgang', '/preview-tilgang', '/503', '/404'])(
    '%s er ekskludert',
    (path) => {
      expect(isExcludedPath(path)).toBe(true);
    },
  );

  test.each(['/', '/artikler', '/artikler/min-artikkel', '/kalender', '/kalender/fagdag', '/om-oss', '/sokeresultat'])(
    '%s er ikke ekskludert',
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

  test('normalt node inkluderes, umappet type og ekskludert sti droppes', async () => {
    const nodes: RawContentNode[] = [
      { id: '1', contentType: 'artikkel', updateDate: '2026-02-01T10:00:00Z', properties: { slug: 'ki-i-skolen' } },
      { id: '2', contentType: 'eksempel', updateDate: '2026-02-02T10:00:00Z', properties: { slug: 'chatbot' } },
      { id: '3', contentType: 'side', updateDate: '2026-02-03T10:00:00Z', properties: { slug: 'personvern' } },
      { id: '4', contentType: 'forside', properties: {} },
      // Port 1: ingen rute i content-routes.json → droppes.
      { id: '5', contentType: 'globaleInnstillinger', properties: {} },
      // Port 2: en `side` med reservert slug resolver til /status → droppes.
      { id: '6', contentType: 'side', properties: { slug: 'status' } },
    ];

    const { xml, base } = await sitemapFor(nodes);
    const found = locs(xml);

    expect(found).toContain(`${base}/artikler/ki-i-skolen`);
    expect(found).toContain(`${base}/eksempler/chatbot`);
    expect(found).toContain(`${base}/personvern`);
    expect(found).toContain(`${base}/`); // forside
    // Umappet type gir ingen URL.
    expect(found.some((u) => u.includes('globaleInnstillinger') || u.endsWith('/undefined'))).toBe(false);
    // Ekskludert sti er borte.
    expect(found.some((u) => u.endsWith('/status'))).toBe(false);
  });

  test('kalenderhendelse havner på /kalender/{slug} (ny rute, ende-til-ende)', async () => {
    const nodes: RawContentNode[] = [
      { id: '1', contentType: 'kalenderhendelse', updateDate: '2026-03-03T08:30:00Z', properties: { slug: 'markedsdialog' } },
      { id: '2', contentType: 'kalender', properties: {} }, // oversikten
    ];
    const { xml, base } = await sitemapFor(nodes);
    const found = locs(xml);
    expect(found).toContain(`${base}/kalender/markedsdialog`);
    expect(found).toContain(`${base}/kalender`);
  });

  test('lastmod leses fra updateDate og er gyldig ISO 8601', async () => {
    const nodes: RawContentNode[] = [
      { id: '1', contentType: 'artikkel', updateDate: '2026-02-01T10:00:00Z', properties: { slug: 'a' } },
    ];
    const { xml } = await sitemapFor(nodes);
    const mods = lastmods(xml);
    expect(mods).toHaveLength(1);
    expect(mods[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('samme URL fra flere noder dedupes, nyeste lastmod beholdes', async () => {
    const nodes: RawContentNode[] = [
      { id: '1', contentType: 'artikkel', updateDate: '2026-01-01T00:00:00Z', properties: { slug: 'dupe' } },
      { id: '2', contentType: 'artikkel', updateDate: '2026-05-05T00:00:00Z', properties: { slug: 'dupe' } },
    ];
    const { xml, base } = await sitemapFor(nodes);
    const found = locs(xml).filter((u) => u === `${base}/artikler/dupe`);
    expect(found).toHaveLength(1);
    expect(lastmods(xml)).toContain('2026-05-05T00:00:00.000Z');
  });

  test('en tom crawl gir et velformet, men tomt urlset', async () => {
    const { xml } = await sitemapFor([]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
  });

  test('output er velformet sitemap 0.9 med absolutte loc-er', async () => {
    const nodes: RawContentNode[] = [
      { id: '1', contentType: 'artikkel', updateDate: '2026-02-01T10:00:00Z', properties: { slug: 'a' } },
      { id: '2', contentType: 'side', properties: { slug: 'kontakt' } },
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
