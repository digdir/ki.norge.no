import { describe, expect, test, vi, afterEach } from 'vitest';

// Same approach as sitemap.test.ts: mock only the crawl. resolveContentUrl stays
// real, so route lookup and path exclusion are tested for what they actually do.
vi.mock('./umbraco', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./umbraco')>();
  return { ...actual, fetchAllPublishedContent: vi.fn() };
});

import { fetchAllPublishedContent, type RawContentNode } from './umbraco';
import { generateLlmsTxt } from './llms-txt';

const mockedCrawl = vi.mocked(fetchAllPublishedContent);

// A separate base per test, otherwise the internal hourly cache leaks between the tests.
let baseCounter = 0;
async function llmsFor(nodes: RawContentNode[]): Promise<{ text: string; base: string }> {
  baseCounter += 1;
  const base = `https://l${baseCounter}.example`;
  mockedCrawl.mockResolvedValue(nodes);
  return { text: await generateLlmsTxt(base), base };
}

function sectionOf(text: string, heading: string): string {
  const start = text.indexOf(`## ${heading}`);
  if (start === -1) return '';
  const next = text.indexOf('\n## ', start + 1);
  return next === -1 ? text.slice(start) : text.slice(start, next);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generateLlmsTxt', () => {
  test('has H1 and a blockquote summary at the top', async () => {
    const { text } = await llmsFor([]);
    const lines = text.split('\n');
    expect(lines[0]).toBe('# KI Norge');
    expect(text).toContain('\n> ');
  });

  test('nodes become markdown links with absolute URL and ingress', async () => {
    const { text, base } = await llmsFor([
      {
        id: '1',
        contentType: 'artikkel',
        properties: { slug: 'ki-i-skolen', tittel: 'KI i skolen', ingress: 'Kort om KI i skolen.' },
      },
    ]);
    expect(text).toContain(`- [KI i skolen](${base}/artikler/ki-i-skolen): Kort om KI i skolen.`);
  });

  test('groups by content type and sorts by path within the section', async () => {
    const { text } = await llmsFor([
      { id: '1', contentType: 'artikkel', properties: { slug: 'b', tittel: 'B' } },
      { id: '2', contentType: 'artikkel', properties: { slug: 'a', tittel: 'A' } },
      { id: '3', contentType: 'eksempel', properties: { slug: 'c', tittel: 'C' } },
    ]);

    const artikler = sectionOf(text, 'Artikler');
    expect(artikler.indexOf('/artikler/a')).toBeLessThan(artikler.indexOf('/artikler/b'));
    expect(artikler).not.toContain('/eksempler/c');
    expect(sectionOf(text, 'Eksempler')).toContain('/eksempler/c');
  });

  test('title falls back to heroTittel and then the node name', async () => {
    const { text } = await llmsFor([
      { id: '1', name: 'Artikler', contentType: 'artikler', properties: { heroTittel: 'Aktuelt' } },
      { id: '2', name: 'Eksempler', contentType: 'eksempler', properties: {} },
    ]);
    expect(text).toContain('[Aktuelt]');
    expect(text).toContain('[Eksempler]');
  });

  test('a long ingress is cut at a word boundary', async () => {
    const long = 'ord '.repeat(200).trim();
    const { text } = await llmsFor([
      { id: '1', contentType: 'artikkel', properties: { slug: 'a', tittel: 'A', ingress: long } },
    ]);
    const line = text.split('\n').find((l) => l.startsWith('- [A]'))!;
    expect(line.length).toBeLessThan(300);
    expect(line.endsWith('…')).toBe(true);
    expect(line).not.toContain('or…');
  });

  test('an ingress without letters is dropped as summary', async () => {
    const { text } = await llmsFor([
      { id: '1', contentType: 'artikkel', properties: { slug: 'a', tittel: 'A', ingress: '______' } },
    ]);
    const line = text.split('\n').find((l) => l.startsWith('- [A]'))!;
    expect(line).not.toContain('___');
    expect(line.endsWith(')')).toBe(true);
  });

  test('an unmapped type and an excluded path are left out', async () => {
    const { text } = await llmsFor([
      { id: '1', contentType: 'globaleInnstillinger', properties: {} },
      { id: '2', contentType: 'side', properties: { slug: '404', tittel: 'Ikke funnet' } },
      { id: '3', contentType: 'artikkel', properties: { slug: 'ok', tittel: 'OK' } },
    ]);
    expect(text).not.toContain('[Ikke funnet]');
    expect(text).not.toContain('globaleInnstillinger');
    expect(text).toContain('[OK]');
  });

  test('the same path from several nodes is included only once', async () => {
    const { text } = await llmsFor([
      { id: '1', contentType: 'artikkel', properties: { slug: 'dupe', tittel: 'Første' } },
      { id: '2', contentType: 'artikkel', properties: { slug: 'dupe', tittel: 'Andre' } },
    ]);
    const hits = text.split('\n').filter((l) => l.includes('/artikler/dupe'));
    expect(hits).toHaveLength(1);
  });

  test('brackets in the title are escaped so the markdown link does not break', async () => {
    const { text } = await llmsFor([
      { id: '1', contentType: 'artikkel', properties: { slug: 'a', tittel: 'KI [pilot]' } },
    ]);
    expect(text).toContain('- [KI \\[pilot\\]](');
  });

  test('an unknown content type with a route ends up under Andre sider', async () => {
    const { text } = await llmsFor([
      { id: '1', contentType: 'kalenderhendelse', properties: { slug: 'fagdag', tittel: 'Fagdag' } },
    ]);
    // kalenderhendelse is known, so it must NOT end up in the fallback section.
    expect(sectionOf(text, 'Kalender')).toContain('[Fagdag]');
    expect(text).not.toContain('## Andre sider');
  });

  test('an empty crawl still gives a valid document with the endpoint section', async () => {
    const { text, base } = await llmsFor([]);
    expect(text).toContain('## Maskinlesbare endepunkter');
    expect(text).toContain(`${base}/sitemap.xml`);
    expect(text).toContain(`${base}/robots.txt`);
  });
});
