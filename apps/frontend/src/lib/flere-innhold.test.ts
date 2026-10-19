import { describe, expect, test } from 'vitest';
import { flereNyeste } from './flere-innhold';

// Rekkefølgen fra API-et er updateDate, nyest først. Den gamle artikkelen er
// nettopp rettet og ligger derfor øverst, selv om den er publisert sist i fjor.
const fraApi = [
  { slug: 'gammel-rettet', publishedAt: '2025-11-02T10:00:00Z' },
  { slug: 'denne', publishedAt: '2026-10-01T10:00:00Z' },
  { slug: 'uten-dato', publishedAt: '' },
  { slug: 'nyest', publishedAt: '2026-10-10T10:00:00Z' },
  { slug: 'mellom', publishedAt: '2026-06-15T10:00:00Z' },
  { slug: 'eldre', publishedAt: '2026-03-01T10:00:00Z' },
];

describe('flereNyeste', () => {
  test('velger de tre nyeste etter publiseringsdato, uten siden selv', () => {
    expect(flereNyeste(fraApi, 'denne').map((a) => a.slug)).toEqual(['nyest', 'mellom', 'eldre']);
  });

  test('en gammel artikkel som nettopp er rettet, dytter ikke ut en nyere', () => {
    expect(flereNyeste(fraApi, 'denne').map((a) => a.slug)).not.toContain('gammel-rettet');
  });

  test('innhold uten dato havner sist', () => {
    expect(flereNyeste(fraApi, 'denne', 10).map((a) => a.slug)).toEqual([
      'nyest',
      'mellom',
      'eldre',
      'gammel-rettet',
      'uten-dato',
    ]);
  });

  test('endrer ikke lista den får', () => {
    const kopi = fraApi.map((a) => a.slug);
    flereNyeste(fraApi, 'denne');
    expect(fraApi.map((a) => a.slug)).toEqual(kopi);
  });
});
