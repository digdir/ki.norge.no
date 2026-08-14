import { describe, expect, test } from 'vitest';
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
    articleSchema({ headline: 'H', description: 'D', slug: 's', datePublished: '2026-01-01' }),
  ],
  [
    'eksempelSchema',
    eksempelSchema({ headline: 'H', description: 'D', slug: 's', datePublished: '2026-01-01' }),
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
