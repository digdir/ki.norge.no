import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CANONICAL_SITE_URL } from './prod-hosts';
import {
  websiteSchema,
  articleSchema,
  eksempelSchema,
  breadcrumbSchema,
  collectionPageSchema,
} from './seo';

// Regresjonsvakt. Modulen leste import.meta.env.SITE_URL, som er
// http://localhost:4321 i dev og ble bakt inn i prod-bygget. Resultatet var at
// all strukturert data i produksjon pekte på localhost.
function urlsIn(value: unknown): string[] {
  const found: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') {
      if (node.startsWith('http')) found.push(node);
      return;
    }
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  walk(value);
  return found;
}

const schemas: Array<[string, unknown]> = [
  ['websiteSchema', websiteSchema('beskrivelse')],
  [
    'articleSchema',
    articleSchema({ headline: 'H', description: 'D', path: '/artikler/s', datePublished: '2026-01-01' }),
  ],
  [
    'eksempelSchema',
    eksempelSchema({ headline: 'H', description: 'D', path: '/eksempler/s', datePublished: '2026-01-01' }),
  ],
  ['breadcrumbSchema', breadcrumbSchema([{ name: 'Hjem', url: '/' }, { name: 'A', url: '/a' }])],
  [
    'collectionPageSchema',
    collectionPageSchema({ name: 'N', url: '/artikler', items: [{ name: 'A', url: '/artikler/a' }] }),
  ],
];

describe('strukturert data bruker det kanoniske domenet', () => {
  test.each(schemas)('%s lekker ikke localhost', (_name, schema) => {
    const urls = urlsIn(schema);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).not.toContain('localhost');
    }
  });

  test.each(schemas)('%s bruker kun ki.norge.no eller schema.org', (_name, schema) => {
    for (const url of urlsIn(schema)) {
      expect(
        url.startsWith(CANONICAL_SITE_URL) || url.startsWith('https://schema.org'),
      ).toBe(true);
    }
  });
});

describe('collectionPageSchema', () => {
  test('teller medlemmer og nummererer posisjoner fra 1', () => {
    const schema = collectionPageSchema({
      name: 'Artikler',
      url: '/artikler',
      items: [
        { name: 'A', url: '/artikler/a' },
        { name: 'B', url: '/artikler/b' },
      ],
    }) as Record<string, any>;

    expect(schema['@type']).toBe('CollectionPage');
    expect(schema.mainEntity.numberOfItems).toBe(2);
    expect(schema.mainEntity.itemListElement.map((i: any) => i.position)).toEqual([1, 2]);
    expect(schema.mainEntity.itemListElement[0].url).toBe(`${CANONICAL_SITE_URL}/artikler/a`);
  });

  test('absolutte lenker beholdes som de er', () => {
    const schema = collectionPageSchema({
      name: 'Artikler',
      url: '/artikler',
      items: [{ name: 'Ekstern', url: 'https://example.org/a' }],
    }) as Record<string, any>;

    expect(schema.mainEntity.itemListElement[0].url).toBe('https://example.org/a');
  });

  test('beskrivelse utelates når den ikke er satt', () => {
    const schema = collectionPageSchema({ name: 'N', url: '/x', items: [] }) as Record<string, any>;
    expect('description' in schema).toBe(false);
    expect(schema.mainEntity.numberOfItems).toBe(0);
  });
});

// articleSchema bygde alltid /artikler/{slug}, så de enkle veiledningene og
// stegartiklene pekte på sider som ikke finnes. Sidene sender nå sin egen sti.
describe('Article-URL-en er sidens egen sti', () => {
  test.each([
    ['/artikler/min-artikkel'],
    ['/veiledning/kom-i-gang'],
    ['/veiledning/gjor-dataene-ki-klare/aggregere-data/anonymisere'],
  ])('articleSchema med %s', (path) => {
    const schema = articleSchema({ headline: 'H', description: 'D', path, datePublished: '2026-01-01' });
    expect(schema.url).toBe(`${CANONICAL_SITE_URL}${path}`);
  });

  test('eksempelSchema bruker stien den får', () => {
    const schema = eksempelSchema({ headline: 'H', description: 'D', path: '/eksempler/e', datePublished: '2026-01-01' });
    expect(schema.url).toBe(`${CANONICAL_SITE_URL}/eksempler/e`);
  });

  const PAGES_DIR = new URL('../pages', import.meta.url).pathname;
  const astroFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return astroFiles(full);
      return entry.endsWith('.astro') ? [full] : [];
    });
  const kall = astroFiles(PAGES_DIR).flatMap((full) =>
    [...readFileSync(full, 'utf8').matchAll(/(?:articleSchema|eksempelSchema)\(\{([\s\S]*?)\}\)/g)].map(
      (m) => [full.slice(PAGES_DIR.length + 1), m[1]] as const,
    ),
  );

  test('finner kallene i artikkel-, eksempel- og veiledningssidene', () => {
    const sider = kall.map(([side]) => side);
    expect(sider).toEqual(
      expect.arrayContaining([
        'artikler/[slug].astro',
        'eksempler/[slug].astro',
        'veiledning/[guide].astro',
        'veiledning/[guide]/[step]/[stegartikkel].astro',
      ]),
    );
  });

  test.each(kall)('%s sender stien den selv har, samme som canonical', (_side, argumenter) => {
    expect(argumenter).toContain('path: Astro.url.pathname');
  });
});
