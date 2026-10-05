import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { finnJsonFeil, utdrag } from './json-feil';

const gyldigIfølgeJsonParse = (t: string) => {
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
};

// Feilene som faktisk skjer når fila redigeres for hånd.
const FEIL: Record<string, { tekst: string; linje: number; kolonne: number; forklaring: RegExp }> = {
  'mangler { foran første felt': {
    tekst: '[\n  \n    "id": "",\n    "navn": "x"\n  },\n  {"a": 1}\n]',
    linje: 3,
    kolonne: 5,
    forklaring: /mangler \{ foran/,
  },
  'mangler komma mellom to tiltak': {
    tekst: '[\n  {"a": 1}\n  {"b": 2}\n]',
    linje: 2,
    kolonne: 11,
    forklaring: /komma mellom to tiltak/,
  },
  'komma etter siste tiltak': {
    tekst: '[\n  {"a": 1},\n]',
    linje: 2,
    kolonne: 11,
    forklaring: /komma for mye.*siste tiltak/,
  },
  'komma etter siste felt': {
    tekst: '[\n  {"a": 1,\n  }\n]',
    linje: 2,
    kolonne: 10,
    forklaring: /komma for mye.*siste felt/,
  },
  'mangler komma mellom to felt': {
    tekst: '[\n  {"a": "x"\n   "b": "y"}\n]',
    linje: 2,
    kolonne: 12,
    forklaring: /komma mellom to felt/,
  },
  'anførselstegn inne i teksten': {
    tekst: '[\n  {"b": "se (https://x.no")[her], "c": 1}\n]',
    linje: 2,
    kolonne: 26,
    forklaring: /inne i teksten/,
  },
  'typografiske anførselstegn rundt feltnavn': {
    tekst: '[\n  {“a”: 1}\n]',
    linje: 2,
    kolonne: 4,
    forklaring: /ikke et JSON-anførselstegn/,
  },
  'linjeskift inne i en tekst': {
    tekst: '[\n  {"a": "første\nandre"}\n]',
    linje: 2,
    kolonne: 16,
    forklaring: /Linjeskift inne i en tekst/,
  },
  'fila slutter før lista er lukket': {
    tekst: '[\n  {"a": 1}',
    linje: 2,
    kolonne: 11,
    forklaring: /lukket med \]/,
  },
  'BOM først i fila': {
    tekst: '﻿[]',
    linje: 1,
    kolonne: 1,
    forklaring: /BOM/,
  },
};

describe('finnJsonFeil', () => {
  test.each(Object.entries(FEIL))('%s', (_, { tekst, linje, kolonne, forklaring }) => {
    const feil = finnJsonFeil(tekst);
    expect(feil).not.toBeNull();
    expect({ linje: feil!.linje, kolonne: feil!.kolonne }).toEqual({ linje, kolonne });
    expect(feil!.forklaring).toMatch(forklaring);
  });

  test('er enig med JSON.parse om hva som er gyldig', () => {
    const fil = readFileSync(fileURLToPath(new URL('../data/ki-tiltak.json', import.meta.url)), 'utf-8');
    const tilfeller = [
      fil,
      '[]',
      '{}',
      ' [ 1 , -2.5e3 , true , false , null , "a\\"b\\\\c\\u00e6" , {"x": [ ]} ] ',
      '[«ikke json»]',
      '[01]',
      '[1.]',
      '"åpen',
      '',
      ...Object.values(FEIL).map((f) => f.tekst),
    ];
    for (const t of tilfeller) {
      expect(finnJsonFeil(t) === null, JSON.stringify(t).slice(0, 60)).toBe(gyldigIfølgeJsonParse(t));
    }
  });
});

describe('utdrag', () => {
  test('peker på linja og kolonnen', () => {
    const tekst = '[\n  {"a": 1},\n]';
    expect(utdrag(tekst, finnJsonFeil(tekst)!)).toBe(
      ['  1 | [', '> 2 |   {"a": 1},', '    |           ^', '  3 | ]'].join('\n'),
    );
  });
});
