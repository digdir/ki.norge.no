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

// The errors that actually happen when the file is edited by hand.
const FEIL: Record<string, { tekst: string; linje: number; kolonne: number; forklaring: RegExp }> = {
  'missing { before the first field': {
    tekst: '[\n  \n    "id": "",\n    "navn": "x"\n  },\n  {"a": 1}\n]',
    linje: 3,
    kolonne: 5,
    forklaring: /mangler \{ foran/,
  },
  'missing comma between two tiltak': {
    tekst: '[\n  {"a": 1}\n  {"b": 2}\n]',
    linje: 2,
    kolonne: 11,
    forklaring: /komma mellom to tiltak/,
  },
  'comma after the last tiltak': {
    tekst: '[\n  {"a": 1},\n]',
    linje: 2,
    kolonne: 11,
    forklaring: /komma for mye.*siste tiltak/,
  },
  'comma after the last field': {
    tekst: '[\n  {"a": 1,\n  }\n]',
    linje: 2,
    kolonne: 10,
    forklaring: /komma for mye.*siste felt/,
  },
  'missing comma between two fields': {
    tekst: '[\n  {"a": "x"\n   "b": "y"}\n]',
    linje: 2,
    kolonne: 12,
    forklaring: /komma mellom to felt/,
  },
  'quote mark inside the text': {
    tekst: '[\n  {"b": "se (https://x.no")[her], "c": 1}\n]',
    linje: 2,
    kolonne: 26,
    forklaring: /inne i teksten/,
  },
  'typographic quote marks around a field name': {
    tekst: '[\n  {“a”: 1}\n]',
    linje: 2,
    kolonne: 4,
    forklaring: /ikke et JSON-anførselstegn/,
  },
  'line break inside a text': {
    tekst: '[\n  {"a": "første\nandre"}\n]',
    linje: 2,
    kolonne: 16,
    forklaring: /Linjeskift inne i en tekst/,
  },
  'the file ends before the list is closed': {
    tekst: '[\n  {"a": 1}',
    linje: 2,
    kolonne: 11,
    forklaring: /lukket med \]/,
  },
  'BOM at the start of the file': {
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

  test('agrees with JSON.parse about what is valid', () => {
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
  test('points at the line and the column', () => {
    const tekst = '[\n  {"a": 1},\n]';
    expect(utdrag(tekst, finnJsonFeil(tekst)!)).toBe(
      ['  1 | [', '> 2 |   {"a": 1},', '    |           ^', '  3 | ]'].join('\n'),
    );
  });
});
