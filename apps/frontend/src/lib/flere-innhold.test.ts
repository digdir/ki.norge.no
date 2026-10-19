import { describe, expect, test } from 'vitest';
import { flereNyeste } from './flere-innhold';

// The order from the API is updateDate, newest first. The old article was
// just corrected and is therefore on top, even though it was published late last year.
const fraApi = [
  { slug: 'gammel-rettet', publishedAt: '2025-11-02T10:00:00Z' },
  { slug: 'denne', publishedAt: '2026-10-01T10:00:00Z' },
  { slug: 'uten-dato', publishedAt: '' },
  { slug: 'nyest', publishedAt: '2026-10-10T10:00:00Z' },
  { slug: 'mellom', publishedAt: '2026-06-15T10:00:00Z' },
  { slug: 'eldre', publishedAt: '2026-03-01T10:00:00Z' },
];

describe('flereNyeste', () => {
  test('picks the three newest by publish date, excluding the page itself', () => {
    expect(flereNyeste(fraApi, 'denne').map((a) => a.slug)).toEqual(['nyest', 'mellom', 'eldre']);
  });

  test('an old article that was just corrected does not push out a newer one', () => {
    expect(flereNyeste(fraApi, 'denne').map((a) => a.slug)).not.toContain('gammel-rettet');
  });

  test('content without a date ends up last', () => {
    expect(flereNyeste(fraApi, 'denne', 10).map((a) => a.slug)).toEqual([
      'nyest',
      'mellom',
      'eldre',
      'gammel-rettet',
      'uten-dato',
    ]);
  });

  test('does not change the list it receives', () => {
    const kopi = fraApi.map((a) => a.slug);
    flereNyeste(fraApi, 'denne');
    expect(fraApi.map((a) => a.slug)).toEqual(kopi);
  });
});
