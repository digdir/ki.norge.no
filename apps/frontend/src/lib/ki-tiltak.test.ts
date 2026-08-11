import { describe, expect, test } from 'vitest';
import {
  FAGOMRADER,
  STATUSES,
  filterTiltak,
  kiTiltak,
  type KiTiltak,
  type KiTiltakFilter,
} from './ki-tiltak';

const EMPTY: KiTiltakFilter = { query: '', fagomrade: [], status: [] };

/**
 * Feltene filterTiltak søker i.
 *
 * Testene under henter søkeordene sine fra datasettet i stedet for å hardkode
 * dem. Redaksjonen endrer navn og tekst jevnlig, og en test som låser seg til
 * en bestemt formulering stopper dem i CI uten å fange en eneste reell feil.
 */
const SEARCHABLE = ['navn', 'virksomhet', 'fagomrade', 'beskrivelse', 'formaal', 'status'] as const;
type SearchField = (typeof SEARCHABLE)[number];

function otherFields(tiltak: KiTiltak, exclude: SearchField): string {
  return SEARCHABLE.filter((f) => f !== exclude)
    .map((f) => tiltak[f])
    .join(' ')
    .toLowerCase();
}

/**
 * Et søkeord som bare finnes i det angitte feltet på ett bestemt tiltak. Får vi
 * treff på det tiltaket, er feltet beviselig med i søket, siden ingen andre
 * felt inneholder ordet.
 */
function uniqueQueryFor(field: SearchField): { tiltak: KiTiltak; query: string } | null {
  for (const tiltak of kiTiltak) {
    const value = tiltak[field].trim();
    if (value.length === 0) continue;
    const others = otherFields(tiltak, field);
    // Korte felt brukes hele, lange felt ord for ord.
    const candidates = value.length > 30 ? value.split(/\s+/) : [value];
    for (const candidate of candidates) {
      // Bare skilletegn i hver ende. Mellomrom inni må stå, ellers blir
      // «Entur AS» til «EnturAS», som ikke finnes noe sted i datasettet.
      const query = candidate.replace(/^[^0-9A-Za-zÆØÅæøå]+|[^0-9A-Za-zÆØÅæøå]+$/g, '');
      if (query.length < 6) continue;
      if (!others.includes(query.toLowerCase())) return { tiltak, query };
    }
  }
  return null;
}

describe('ki-tiltak datasett', () => {
  test('er ikke tomt eller avkortet', () => {
    // Ikke en eksakt telling. Redaksjonen legger til og fjerner tiltak, og et
    // låst tall blokkerer dem uten å fange noe. Gulvet fanger at filen er tømt.
    expect(kiTiltak.length).toBeGreaterThanOrEqual(40);
  });

  test('har unike id-er', () => {
    const ids = new Set(kiTiltak.map((t) => t.id));
    expect(ids.size).toBe(kiTiltak.length);
  });

  test('har id, navn og virksomhet på hvert tiltak', () => {
    for (const tiltak of kiTiltak) {
      expect(tiltak.id, `id mangler på ${tiltak.navn}`).toBeTruthy();
      expect(tiltak.navn, `navn mangler på ${tiltak.id}`).toBeTruthy();
      expect(tiltak.virksomhet, `virksomhet mangler på ${tiltak.navn}`).toBeTruthy();
    }
  });

  test('bruker bare fagområder fra FAGOMRADER', () => {
    for (const tiltak of kiTiltak) {
      expect(FAGOMRADER, `ukjent fagområde på ${tiltak.navn}`).toContain(tiltak.fagomrade);
    }
  });

  test('bruker bare kjente statusverdier', () => {
    for (const tiltak of kiTiltak) {
      if (tiltak.status === '') continue;
      expect(STATUSES, `ukjent status på ${tiltak.navn}`).toContain(tiltak.status);
    }
  });

  test('eksporteres sortert på navn', () => {
    // Sorteringen gjøres i ki-tiltak.ts. JSON-filen kan stå i hvilken som helst
    // rekkefølge, så dette tester koden, ikke redaksjonens filbehandling.
    const sorted = [...kiTiltak].sort((a, b) =>
      a.navn.localeCompare(b.navn, 'nb', { sensitivity: 'base', numeric: true }),
    );
    expect(kiTiltak.map((t) => t.navn)).toEqual(sorted.map((t) => t.navn));
  });

  test('virksomhetsnavn er ikke bare versaler', () => {
    // Kuraterte visningsnavn skal ha erstattet VERSALENE fra kilden.
    const shouty = kiTiltak.filter((t) => t.virksomhet === t.virksomhet.toUpperCase());
    expect(shouty.map((t) => t.virksomhet)).toEqual([]);
  });
});

describe('filterTiltak', () => {
  test('tomt filter returnerer alt', () => {
    expect(filterTiltak(kiTiltak, EMPTY)).toHaveLength(kiTiltak.length);
  });

  test.each(SEARCHABLE)('søker i %s', (field) => {
    const found = uniqueQueryFor(field);
    expect(found, `datasettet mangler en ${field}-verdi som er unik for feltet`).not.toBeNull();
    const matches = filterTiltak(kiTiltak, { ...EMPTY, query: found!.query });
    expect(matches.map((t) => t.id)).toContain(found!.tiltak.id);
  });

  test('søk er ikke versalfølsomt', () => {
    const navn = kiTiltak[0].navn;
    const upper = filterTiltak(kiTiltak, { ...EMPTY, query: navn.toUpperCase() });
    const lower = filterTiltak(kiTiltak, { ...EMPTY, query: navn.toLowerCase() });
    expect(upper.length).toBeGreaterThan(0);
    expect(upper).toEqual(lower);
  });

  test('søk trimmer mellomrom', () => {
    const tiltak = kiTiltak[0];
    const matches = filterTiltak(kiTiltak, { ...EMPTY, query: `  ${tiltak.navn}  ` });
    expect(matches.map((t) => t.id)).toContain(tiltak.id);
  });

  test('filtrerer på ett fagområde', () => {
    const fagomrade = kiTiltak[0].fagomrade;
    const matches = filterTiltak(kiTiltak, { ...EMPTY, fagomrade: [fagomrade] });
    expect(matches.length).toBe(kiTiltak.filter((t) => t.fagomrade === fagomrade).length);
    expect(matches.every((t) => t.fagomrade === fagomrade)).toBe(true);
  });

  test('flere fagområder virker som ELLER', () => {
    const brukte = [...new Set(kiTiltak.map((t) => t.fagomrade))];
    expect(brukte.length).toBeGreaterThanOrEqual(2);
    const [a, b] = brukte;
    const matches = filterTiltak(kiTiltak, { ...EMPTY, fagomrade: [a, b] });
    expect(matches.length).toBe(kiTiltak.filter((t) => t.fagomrade === a || t.fagomrade === b).length);
    expect(new Set(matches.map((t) => t.fagomrade))).toEqual(new Set([a, b]));
  });

  test('filtrerer på status', () => {
    const status = kiTiltak.find((t) => t.status !== '')?.status;
    expect(status, 'ingen tiltak har status satt').toBeDefined();
    const matches = filterTiltak(kiTiltak, { ...EMPTY, status: [status!] });
    expect(matches.length).toBe(kiTiltak.filter((t) => t.status === status).length);
    expect(matches.every((t) => t.status === status)).toBe(true);
  });

  test('grupper kombineres som OG', () => {
    const par = kiTiltak.find((t) => t.status !== '');
    expect(par, 'trenger et tiltak med både fagområde og status').toBeDefined();
    const matches = filterTiltak(kiTiltak, {
      query: '',
      fagomrade: [par!.fagomrade],
      status: [par!.status],
    });
    expect(matches.length).toBeGreaterThan(0);
    expect(
      matches.every((t) => t.fagomrade === par!.fagomrade && t.status === par!.status),
    ).toBe(true);
  });

  test('ingen treff gir tom liste', () => {
    expect(filterTiltak(kiTiltak, { ...EMPTY, query: 'zzzfinnesikke' })).toEqual([]);
  });
});
