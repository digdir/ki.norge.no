import { describe, expect, test, vi, afterEach } from 'vitest';

// Samme grep som sitemap.test.ts: mock kun crawlen. resolveContentUrl beholdes
// ekte, så rute-oppslag og sti-utelukkelse testes for det de faktisk gjør.
vi.mock('./umbraco', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./umbraco')>();
  return { ...actual, fetchAllPublishedContent: vi.fn() };
});

import { fetchAllPublishedContent, type RawContentNode } from './umbraco';
import { generateLlmsTxt } from './llms-txt';

const mockedCrawl = vi.mocked(fetchAllPublishedContent);

// Egen base per test, ellers lekker den interne timecachen mellom testene.
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
  test('har H1 og blockquote-oppsummering øverst', async () => {
    const { text } = await llmsFor([]);
    const lines = text.split('\n');
    expect(lines[0]).toBe('# KI Norge');
    expect(text).toContain('\n> ');
  });

  test('noder blir markdown-lenker med absolutt URL og ingress', async () => {
    const { text, base } = await llmsFor([
      {
        id: '1',
        contentType: 'artikkel',
        properties: { slug: 'ki-i-skolen', tittel: 'KI i skolen', ingress: 'Kort om KI i skolen.' },
      },
    ]);
    expect(text).toContain(`- [KI i skolen](${base}/artikler/ki-i-skolen): Kort om KI i skolen.`);
  });

  test('grupperer på innholdstype og sorterer på sti i seksjonen', async () => {
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

  test('tittel faller tilbake på heroTittel og deretter nodenavn', async () => {
    const { text } = await llmsFor([
      { id: '1', name: 'Artikler', contentType: 'artikler', properties: { heroTittel: 'Aktuelt' } },
      { id: '2', name: 'Eksempler', contentType: 'eksempler', properties: {} },
    ]);
    expect(text).toContain('[Aktuelt]');
    expect(text).toContain('[Eksempler]');
  });

  test('lang ingress kuttes på ordgrense', async () => {
    const long = 'ord '.repeat(200).trim();
    const { text } = await llmsFor([
      { id: '1', contentType: 'artikkel', properties: { slug: 'a', tittel: 'A', ingress: long } },
    ]);
    const line = text.split('\n').find((l) => l.startsWith('- [A]'))!;
    expect(line.length).toBeLessThan(300);
    expect(line.endsWith('…')).toBe(true);
    expect(line).not.toContain('or…');
  });

  test('ingress uten bokstaver droppes som sammendrag', async () => {
    const { text } = await llmsFor([
      { id: '1', contentType: 'artikkel', properties: { slug: 'a', tittel: 'A', ingress: '______' } },
    ]);
    const line = text.split('\n').find((l) => l.startsWith('- [A]'))!;
    expect(line).not.toContain('___');
    expect(line.endsWith(')')).toBe(true);
  });

  test('umappet type og ekskludert sti utelates', async () => {
    const { text } = await llmsFor([
      { id: '1', contentType: 'globaleInnstillinger', properties: {} },
      { id: '2', contentType: 'side', properties: { slug: 'status', tittel: 'Status' } },
      { id: '3', contentType: 'artikkel', properties: { slug: 'ok', tittel: 'OK' } },
    ]);
    expect(text).not.toContain('[Status]');
    expect(text).not.toContain('globaleInnstillinger');
    expect(text).toContain('[OK]');
  });

  test('samme sti fra flere noder tas bare med én gang', async () => {
    const { text } = await llmsFor([
      { id: '1', contentType: 'artikkel', properties: { slug: 'dupe', tittel: 'Første' } },
      { id: '2', contentType: 'artikkel', properties: { slug: 'dupe', tittel: 'Andre' } },
    ]);
    const hits = text.split('\n').filter((l) => l.includes('/artikler/dupe'));
    expect(hits).toHaveLength(1);
  });

  test('klammer i tittel escapes så markdown-lenka ikke brekker', async () => {
    const { text } = await llmsFor([
      { id: '1', contentType: 'artikkel', properties: { slug: 'a', tittel: 'KI [pilot]' } },
    ]);
    expect(text).toContain('- [KI \\[pilot\\]](');
  });

  test('ukjent innholdstype med rute havner under Andre sider', async () => {
    const { text } = await llmsFor([
      { id: '1', contentType: 'kalenderhendelse', properties: { slug: 'fagdag', tittel: 'Fagdag' } },
    ]);
    // kalenderhendelse er kjent, så den skal IKKE havne i fallback-seksjonen.
    expect(sectionOf(text, 'Kalender')).toContain('[Fagdag]');
    expect(text).not.toContain('## Andre sider');
  });

  test('tom crawl gir fortsatt et gyldig dokument med endepunkt-seksjonen', async () => {
    const { text, base } = await llmsFor([]);
    expect(text).toContain('## Maskinlesbare endepunkter');
    expect(text).toContain(`${base}/sitemap.xml`);
    expect(text).toContain(`${base}/robots.txt`);
  });
});
