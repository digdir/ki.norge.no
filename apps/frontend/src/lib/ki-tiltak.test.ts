import { describe, expect, test } from 'vitest';
import {
  FAGOMRADER,
  FILTERETIKETTER,
  FILTERVALG,
  filterTiltak,
  formatRegistered,
  IKKE_DEFINERT,
  kiTiltak,
  type KiTiltak,
  type KiTiltakFase,
  type KiTiltakFilter,
  verdierI,
  visValg,
  KI_TYPER,
  LEVERANSER,
  somTekst,
  tellFiltervalg,
  tilKiTiltak,
  toRegistered,
  TOMT_FILTER,
  utenKategorier,
  utenVerdi,
  vanligSkrift,
  virksomhetTekst,
  VIRKSOMHETSNAVN,
} from './ki-tiltak';
import data from '../data/ki-tiltak.json';
import virksomhetsnavn from '../data/ki-tiltak-virksomhetsnavn.json';

const EMPTY: KiTiltakFilter = TOMT_FILTER;

/**
 * The fields filterTiltak searches in.
 *
 * The tests below take their search terms from the dataset instead of hardcoding
 * them. The editors change names and text regularly, and a test that locks onto
 * a specific wording stops them in CI without catching a single real bug.
 */
const SEARCHABLE = ['navn', 'virksomheter', 'fagomrade', 'beskrivelse', 'fase'] as const;
type SearchField = (typeof SEARCHABLE)[number];

function feltTekst(tiltak: KiTiltak, field: SearchField): string {
  const verdi = tiltak[field] ?? '';
  return Array.isArray(verdi) ? verdi.join(' ') : verdi;
}

function otherFields(tiltak: KiTiltak, exclude: SearchField): string {
  return SEARCHABLE.filter((f) => f !== exclude)
    .map((f) => feltTekst(tiltak, f))
    .join(' ')
    .toLowerCase();
}

/**
 * A search term that only exists in the given field on one specific tiltak. If we get
 * a hit on that tiltak, the field is provably part of the search, since no other
 * field contains the word.
 */
function uniqueQueryFor(field: SearchField): { tiltak: KiTiltak; query: string } | null {
  for (const tiltak of kiTiltak) {
    const value = feltTekst(tiltak, field).trim();
    if (value.length === 0) continue;
    const others = otherFields(tiltak, field);
    // Short fields are used whole, long fields word by word.
    const candidates = value.length > 30 ? value.split(/\s+/) : [value];
    for (const candidate of candidates) {
      // Only punctuation at each end. Spaces inside must stay, otherwise
      // "Entur AS" becomes "EnturAS", which exists nowhere in the dataset.
      const query = candidate.replace(/^[^0-9A-Za-zÆØÅæøå]+|[^0-9A-Za-zÆØÅæøå]+$/g, '');
      if (query.length < 6) continue;
      if (!others.includes(query.toLowerCase())) return { tiltak, query };
    }
  }
  return null;
}

describe('ki-tiltak dataset', () => {
  test('is not empty or truncated', () => {
    // Not an exact count. The editors add and remove tiltak, and a
    // locked number blocks them without catching anything. The floor catches the file being emptied.
    expect(kiTiltak.length).toBeGreaterThanOrEqual(40);
  });

  test('has unique ids', () => {
    const ids = new Set(kiTiltak.map((t) => t.id));
    expect(ids.size).toBe(kiTiltak.length);
  });

  test('has id, navn and virksomhet on every tiltak', () => {
    for (const tiltak of kiTiltak) {
      expect(tiltak.id, `id missing on ${tiltak.navn}`).toBeTruthy();
      expect(tiltak.navn, `navn missing on ${tiltak.id}`).toBeTruthy();
      expect(tiltak.virksomheter.length, `virksomhet missing on ${tiltak.navn}`).toBeGreaterThan(0);
      expect(tiltak.virksomheter.every((v) => v.trim().length > 0), `empty organisation name on ${tiltak.navn}`).toBe(true);
    }
  });

  test('uses only fagområder from FAGOMRADER', () => {
    for (const tiltak of kiTiltak) {
      expect(FAGOMRADER, `unknown fagområde on ${tiltak.navn}`).toContain(tiltak.fagomrade);
    }
  });

  /**
   * The metadata fields are optional, but if they are written, they must be correct.
   * A misspelled value causes no crash, just a label that looks odd on
   * a public website, and nobody notices that at a glance.
   */
  test('kiType uses only values from KI_TYPER', () => {
    for (const t of kiTiltak) {
      for (const v of t.kiType ?? []) {
        expect(KI_TYPER, `unknown KI type on ${t.navn}`).toContain(v);
      }
    }
  });

  test('leveranse uses only values from LEVERANSER', () => {
    for (const t of kiTiltak) {
      for (const v of t.leveranse ?? []) {
        expect(LEVERANSER, `unknown leveranse on ${t.navn}`).toContain(v);
      }
    }
  });

  test('no empty strings or duplicates in the multi-selects', () => {
    for (const t of kiTiltak) {
      for (const [felt, liste] of [['kiType', t.kiType], ['leveranse', t.leveranse]] as const) {
        if (!liste) continue;
        expect(liste.filter((v) => v.trim().length === 0), `empty value in ${felt} on ${t.navn}`).toHaveLength(0);
        expect(new Set(liste).size, `duplicate in ${felt} on ${t.navn}`).toBe(liste.length);
      }
    }
  });

  /**
   * Free text without "Annet" in the list is a transcription error: the text is never shown,
   * because visValg only replaces the word "Annet" where it appears.
   */
  test('Annet free text requires Annet to be selected', () => {
    for (const t of kiTiltak) {
      if (t.kiTypeAnnet?.trim()) {
        expect(t.kiType ?? [], `kiTypeAnnet without "Annet" on ${t.navn}`).toContain('Annet');
      }
      if (t.leveranseAnnet?.trim()) {
        expect(t.leveranse ?? [], `leveranseAnnet without "Annet" on ${t.navn}`).toContain('Annet');
      }
    }
  });

  test('opprettet is a date the page can show', () => {
    for (const raw of data as { navn: string; opprettet?: string | null }[]) {
      if (utenVerdi(raw.opprettet)) continue;
      expect(toRegistered(raw.opprettet), `opprettet "${raw.opprettet}" on ${raw.navn}`).toBeDefined();
    }
  });

  test('kontaktinfo looks like an email address', () => {
    for (const t of kiTiltak) {
      if (!t.kontaktinfo?.trim()) continue;
      expect(t.kontaktinfo, `kontaktinfo without @ on ${t.navn}`).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    }
  });

  /**
   * Links are written as [text](url). Only http and https are rendered as a link, everything
   * else stays as visible text, and that looks like a bug on the page.
   */
  test('links in the description use http or https', () => {
    for (const t of kiTiltak) {
      for (const treff of t.beskrivelse.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
        expect(treff[1], `link that won't be clickable on ${t.navn}`).toMatch(/^https?:\/\//);
      }
    }
  });

  test('is exported sorted by navn', () => {
    // Sorting is done in ki-tiltak.ts. The JSON file can be in any
    // order, so this tests the code, not how the editors handle the file.
    const sorted = [...kiTiltak].sort((a, b) =>
      a.navn.localeCompare(b.navn, 'nb', { sensitivity: 'base', numeric: true }),
    );
    expect(kiTiltak.map((t) => t.navn)).toEqual(sorted.map((t) => t.navn));
  });

  test('the page shows the name from the table when the switch is set to tabell', () => {
    if (VIRKSOMHETSNAVN !== 'tabell') return;
    for (const t of kiTiltak) {
      t.orgnr.forEach((o, i) => {
        if (o in virksomhetsnavn) expect(t.virksomheter[i], `name on ${t.navn}`).toBe(virksomhetsnavn[o as keyof typeof virksomhetsnavn]);
      });
    }
  });

  // A new organisation in the export needs a display name, otherwise it shows in ALL CAPS.
  test('every orgnr in the data has a name in ki-tiltak-virksomhetsnavn.json', () => {
    const mangler = [...new Set(kiTiltak.flatMap((t) => t.orgnr))].filter((o) => o && !(o in virksomhetsnavn));
    expect(mangler).toEqual([]);
  });
});

describe('filterTiltak', () => {
  test('empty filter returns everything', () => {
    expect(filterTiltak(kiTiltak, EMPTY)).toHaveLength(kiTiltak.length);
  });

  test.each(SEARCHABLE)('searches in %s', (field) => {
    const found = uniqueQueryFor(field);
    expect(found, `the dataset lacks a ${field} value that is unique to the field`).not.toBeNull();
    const matches = filterTiltak(kiTiltak, { ...EMPTY, query: found!.query });
    expect(matches.map((t) => t.id)).toContain(found!.tiltak.id);
  });

  test('search is case insensitive', () => {
    const navn = kiTiltak[0].navn;
    const upper = filterTiltak(kiTiltak, { ...EMPTY, query: navn.toUpperCase() });
    const lower = filterTiltak(kiTiltak, { ...EMPTY, query: navn.toLowerCase() });
    expect(upper.length).toBeGreaterThan(0);
    expect(upper).toEqual(lower);
  });

  test('search trims whitespace', () => {
    const tiltak = kiTiltak[0];
    const matches = filterTiltak(kiTiltak, { ...EMPTY, query: `  ${tiltak.navn}  ` });
    expect(matches.map((t) => t.id)).toContain(tiltak.id);
  });

  test('filters on one fagområde', () => {
    const fagomrade = kiTiltak[0].fagomrade;
    const matches = filterTiltak(kiTiltak, { ...EMPTY, fagomrade: [fagomrade] });
    expect(matches.length).toBe(kiTiltak.filter((t) => t.fagomrade === fagomrade).length);
    expect(matches.every((t) => t.fagomrade === fagomrade)).toBe(true);
  });

  test('several fagområder act as OR', () => {
    const brukte = [...new Set(kiTiltak.map((t) => t.fagomrade))];
    expect(brukte.length).toBeGreaterThanOrEqual(2);
    const [a, b] = brukte;
    const matches = filterTiltak(kiTiltak, { ...EMPTY, fagomrade: [a, b] });
    expect(matches.length).toBe(kiTiltak.filter((t) => t.fagomrade === a || t.fagomrade === b).length);
    expect(new Set(matches.map((t) => t.fagomrade))).toEqual(new Set([a, b]));
  });

  test('free text and facet combine as AND', () => {
    // Status is no longer a facet, so the two dimensions that can be combined
    // are the free-text search and fag- og temaområde.
    const tiltak = kiTiltak.find((t) => t.navn.trim().length > 0);
    expect(tiltak, 'the dataset is empty').toBeDefined();

    const treff = filterTiltak(kiTiltak, {
      ...EMPTY,
      query: tiltak!.navn,
      fagomrade: [tiltak!.fagomrade],
    });
    expect(treff.map((t) => t.id)).toContain(tiltak!.id);
    expect(treff.every((t) => t.fagomrade === tiltak!.fagomrade)).toBe(true);

    // The same search, but with a fagområde the tiltak doesn't have, should exclude it.
    const annet = FAGOMRADER.find((f) => f !== tiltak!.fagomrade);
    const uten = filterTiltak(kiTiltak, { ...EMPTY, query: tiltak!.navn, fagomrade: [annet!] });
    expect(uten.map((t) => t.id)).not.toContain(tiltak!.id);
  });

  test('searches all organisations, not just the first', () => {
    const [a, b] = kiTiltak;
    const flere: KiTiltak = { ...a, id: 'flere', virksomheter: ['Entur AS', 'Ruter AS', 'Vy'], orgnr: ['1', '2', '3'] };
    expect(filterTiltak([flere, b], { ...EMPTY, query: 'ruter' }).map((t) => t.id)).toEqual(['flere']);
  });

  test('no hits gives an empty list', () => {
    expect(filterTiltak(kiTiltak, { ...EMPTY, query: 'zzzfinnesikke' })).toEqual([]);
  });
});

describe('filterTiltak with fase, leveranse and type KI', () => {
  const grunn: KiTiltak = { id: '', navn: '', virksomheter: [], orgnr: [], fagomrade: 'Arbeid', beskrivelse: '' };
  const a: KiTiltak = { ...grunn, id: 'a', fase: 'I drift', kiType: ['Generativ KI', 'Språkteknologi'], leveranse: ['Pilot'] };
  const b: KiTiltak = { ...grunn, id: 'b', fase: 'Gjennomføring', kiType: ['Prediktiv KI'], leveranse: ['MVP', 'Pilot'] };
  const c: KiTiltak = { ...grunn, id: 'c', fagomrade: 'Helse og omsorg', fase: 'I drift' };
  const alle = [a, b, c];
  const ider = (filter: Partial<KiTiltakFilter>) => filterTiltak(alle, { ...EMPTY, ...filter }).map((t) => t.id);

  test('fase filters on one choice', () => {
    expect(ider({ fase: ['I drift'] })).toEqual(['a', 'c']);
  });

  test('within a category it is enough that one option matches', () => {
    expect(ider({ fase: ['I drift', 'Gjennomføring'] })).toEqual(['a', 'b', 'c']);
    expect(ider({ kiType: ['Språkteknologi', 'Prediktiv KI'] })).toEqual(['a', 'b']);
  });

  test('a list matches when the tiltak has at least one of the selected values', () => {
    expect(ider({ kiType: ['Generativ KI'] })).toEqual(['a']);
    expect(ider({ leveranse: ['Pilot'] })).toEqual(['a', 'b']);
  });

  test('tiltak without a value in the category drop out when the category is selected', () => {
    expect(ider({ leveranse: ['PoC'] })).toEqual([]);
    expect(ider({ kiType: ['Generativ KI', 'Prediktiv KI'] })).not.toContain('c');
  });

  test('across categories all must match', () => {
    expect(ider({ fase: ['I drift'], leveranse: ['Pilot'] })).toEqual(['a']);
    expect(ider({ fagomrade: ['Arbeid'], fase: ['I drift'] })).toEqual(['a']);
    expect(ider({ fase: ['Gjennomføring'], kiType: ['Generativ KI'] })).toEqual([]);
    expect(ider({ query: 'pilot', fase: ['Gjennomføring'] })).toEqual(['b']);
  });

  test('reset removes all categories, but not the search', () => {
    const filter: KiTiltakFilter = { query: 'x', fagomrade: ['Arbeid'], fase: ['I drift'], leveranse: ['Pilot'], kiType: ['Annet'] };
    expect(utenKategorier(filter)).toEqual({ ...EMPTY, query: 'x' });
  });
});

describe('"Ikke definert" in Fase, Leveranse and Type KI', () => {
  const grunn: KiTiltak = { id: '', navn: '', virksomheter: [], orgnr: [], fagomrade: 'Arbeid', beskrivelse: '' };
  const a: KiTiltak = { ...grunn, id: 'a', fase: 'I drift', kiType: ['Generativ KI'], leveranse: ['Pilot'] };
  const b: KiTiltak = { ...grunn, id: 'b', fase: 'Gjennomføring', leveranse: ['MVP'] };
  const c: KiTiltak = { ...grunn, id: 'c', fagomrade: 'Helse og omsorg', fase: 'I drift' };
  const d: KiTiltak = { ...grunn, id: 'd', kiType: [], leveranse: [] };
  const alle = [a, b, c, d];
  const ider = (filter: Partial<KiTiltakFilter>) => filterTiltak(alle, { ...EMPTY, ...filter }).map((t) => t.id);

  test('comes last in Fase, Leveranse and Type KI, and not in the fagområder', () => {
    expect(FILTERVALG.fase.at(-1)).toBe(IKKE_DEFINERT);
    expect(FILTERVALG.leveranse.at(-1)).toBe(IKKE_DEFINERT);
    expect(FILTERVALG.kiType.at(-1)).toBe(IKKE_DEFINERT);
    expect(FILTERVALG.fagomrade).not.toContain(IKKE_DEFINERT);
  });

  test('the filter group is called Leveranse', () => {
    expect(FILTERETIKETTER.leveranse).toBe('Leveranse');
  });

  test('on its own it matches tiltak without a value, also with an empty list', () => {
    expect(ider({ leveranse: [IKKE_DEFINERT] })).toEqual(['c', 'd']);
    expect(ider({ kiType: [IKKE_DEFINERT] })).toEqual(['b', 'c', 'd']);
    expect(ider({ fase: [IKKE_DEFINERT] })).toEqual(['d']);
  });

  test('fase that is missing, null, empty or a placeholder gives "Ikke definert"', () => {
    const fra = (fase: string | null | undefined) => tilKiTiltak({ id: 'x', navn: 'x', fagomrade: 'Arbeid', fase });
    for (const fase of [undefined, null, '', '  ', 'NA']) {
      expect(verdierI(fra(fase), 'fase')).toEqual([IKKE_DEFINERT]);
    }
    expect(verdierI({ ...grunn, fase: '' as KiTiltakFase }, 'fase')).toEqual([IKKE_DEFINERT]);
    expect(verdierI(fra('I drift'), 'fase')).toEqual(['I drift']);
  });

  test('together with another option in the same category it is enough that one matches', () => {
    expect(ider({ leveranse: [IKKE_DEFINERT, 'MVP'] })).toEqual(['b', 'c', 'd']);
    expect(ider({ kiType: ['Generativ KI', IKKE_DEFINERT] })).toEqual(['a', 'b', 'c', 'd']);
    expect(ider({ fase: [IKKE_DEFINERT, 'Gjennomføring'] })).toEqual(['b', 'd']);
  });

  test('together with another category both must match', () => {
    expect(ider({ leveranse: [IKKE_DEFINERT], fase: ['I drift'] })).toEqual(['c']);
    expect(ider({ kiType: [IKKE_DEFINERT], leveranse: ['MVP'] })).toEqual(['b']);
    expect(ider({ leveranse: [IKKE_DEFINERT], kiType: ['Generativ KI'] })).toEqual([]);
    expect(ider({ fase: [IKKE_DEFINERT], leveranse: [IKKE_DEFINERT] })).toEqual(['d']);
    expect(ider({ fase: [IKKE_DEFINERT], fagomrade: ['Helse og omsorg'] })).toEqual([]);
  });

  test('the count gives the tiltak without a value, and a tiltak with several values counts under each', () => {
    const antall = tellFiltervalg([...alle, { ...a, id: 'e', kiType: ['Generativ KI', 'Prediktiv KI'] }]);
    expect(antall.leveranse.get(IKKE_DEFINERT)).toBe(2);
    expect(antall.kiType.get(IKKE_DEFINERT)).toBe(3);
    expect(antall.kiType.get('Generativ KI')).toBe(2);
    expect(antall.kiType.get('Prediktiv KI')).toBe(1);
    expect(antall.fase.get(IKKE_DEFINERT)).toBe(1);
    expect(antall.fase.get('I drift')).toBe(3);
    expect(antall.fagomrade.has(IKKE_DEFINERT)).toBe(false);
  });

  test('the count against the dataset matches the filter', () => {
    const antall = tellFiltervalg(kiTiltak);
    for (const gruppe of ['fase', 'leveranse', 'kiType'] as const) {
      const uten = kiTiltak.filter((t) => utenVerdi(t[gruppe])).length;
      expect(antall[gruppe].get(IKKE_DEFINERT) ?? 0).toBe(uten);
      expect(filterTiltak(kiTiltak, { ...EMPTY, [gruppe]: [IKKE_DEFINERT] })).toHaveLength(uten);
    }
  });

  test('reset removes the selection', () => {
    const filter: KiTiltakFilter = {
      ...EMPTY,
      query: 'x',
      fase: [IKKE_DEFINERT],
      leveranse: [IKKE_DEFINERT],
      kiType: [IKKE_DEFINERT, 'Annet'],
    };
    expect(utenKategorier(filter)).toEqual({ ...EMPTY, query: 'x' });
  });

  test('the search does not find "Ikke definert"', () => {
    expect(filterTiltak(alle, { ...EMPTY, query: 'ikke definert' })).toEqual([]);
  });
});

describe('free-text search in metadata from the form', () => {
  const grunn: KiTiltak = { id: 'm', navn: 'Tiltak', virksomheter: [], orgnr: [], fagomrade: 'Arbeid', beskrivelse: '' };
  const treff = (tiltak: KiTiltak, query: string) => filterTiltak([tiltak], { ...EMPTY, query }).length === 1;

  test('searches in kiType and kiTypeAnnet', () => {
    expect(treff({ ...grunn, kiType: ['Computer Vision'] }, 'computer vision')).toBe(true);
    expect(treff({ ...grunn, kiType: ['Annet'], kiTypeAnnet: 'Klassifisering' }, 'klassifisering')).toBe(true);
  });

  test('searches in leveranse and leveranseAnnet', () => {
    expect(treff({ ...grunn, leveranse: ['Løsning i produksjon'] }, 'i produksjon')).toBe(true);
    expect(treff({ ...grunn, leveranse: ['Annet'], leveranseAnnet: 'Veileder' }, 'veileder')).toBe(true);
  });

  test('searches in kontaktinfo', () => {
    expect(treff({ ...grunn, kontaktinfo: 'ki@etat.no' }, 'etat.no')).toBe(true);
  });

  test('without metadata the words give no hits', () => {
    expect(treff(grunn, 'språkteknologi')).toBe(false);
  });

  test('"Språkteknologi" finds the tiltak that have that type', () => {
    const forventet = kiTiltak.filter((t) => t.kiType?.includes('Språkteknologi')).map((t) => t.id);
    expect(forventet.length).toBeGreaterThan(0);
    const funnet = filterTiltak(kiTiltak, { ...EMPTY, query: 'Språkteknologi' }).map((t) => t.id);
    expect(funnet).toEqual(expect.arrayContaining(forventet));
  });
});

describe('visValg', () => {
  test('empty or missing selection gives an empty list', () => {
    expect(visValg(undefined, 'noe')).toEqual([]);
    expect(visValg([], 'noe')).toEqual([]);
  });

  test('ordinary choices pass through unchanged', () => {
    expect(visValg(['PoC', 'Pilot'])).toEqual(['PoC', 'Pilot']);
  });

  test('Annet is replaced by the free text, in the same position', () => {
    expect(visValg(['PoC', 'Annet', 'Pilot'], 'Noe helt eget')).toEqual([
      'PoC',
      'Noe helt eget',
      'Pilot',
    ]);
  });

  test('Annet without free text is kept as Annet', () => {
    expect(visValg(['PoC', 'Annet'], '')).toEqual(['PoC', 'Annet']);
    expect(visValg(['PoC', 'Annet'])).toEqual(['PoC', 'Annet']);
  });

  test('free text that is only whitespace counts as empty', () => {
    expect(visValg(['Annet'], '   ')).toEqual(['Annet']);
  });
});

describe('somTekst', () => {
  test('one, two and more choices read as ordinary Norwegian', () => {
    expect(somTekst(['I drift'])).toBe('I drift');
    expect(somTekst(['PoC', 'MVP'])).toBe('PoC og MVP');
    expect(somTekst(['Generativ KI', 'Prediktiv KI', 'Språkteknologi'])).toBe('Generativ KI, Prediktiv KI og Språkteknologi');
  });
});

describe('utenVerdi', () => {
  test.each([null, undefined, '', '   ', [], [''], [null, ' ', 'NA']])('%j has no value', (v) => {
    expect(utenVerdi(v)).toBe(true);
  });

  test.each(['NA', 'na', ' N/A ', '-', '–', 'null', 'NULL', 'Ikke oppgitt', ' ikke OPPGITT '])(
    'the placeholder %j has no value',
    (v) => {
      expect(utenVerdi(v)).toBe(true);
    },
  );

  test.each(['Pilot', ['', 'Pilot'], 'NAV', '--', 'ikke oppgitt ennå'])('%j has a value', (v) => {
    expect(utenVerdi(v)).toBe(false);
  });
});

describe('tilKiTiltak', () => {
  test('the name table replaces the register name, and unknown ones are converted from ALL CAPS', () => {
    const raw = { id: 'a', navn: 'X', virksomhet: ['ENTUR AS', 'UKJENT AS'], orgnr: ['917422575', '000000000'] };
    expect(tilKiTiltak(raw, 'tabell').virksomheter).toEqual(['Entur AS', 'Ukjent AS']);
    expect(tilKiTiltak(raw, 'register').virksomheter).toEqual(['ENTUR AS', 'UKJENT AS']);
  });

  test.each([
    ['HELSE BERGEN HF', 'Helse bergen HF'],
    ['DIREKTORATET FOR FORVALTNING OG ØKONOMISTYRING', 'Direktoratet for forvaltning og økonomistyring'],
    ['Kommuneforlaget AS', 'Kommuneforlaget AS'],
  ])('vanligSkrift(%j) becomes %j', (inn, ut) => {
    expect(vanligSkrift(inn)).toBe(ut);
  });

  test('one organisation as text becomes a list with one', () => {
    const t = tilKiTiltak({ id: 'a', navn: 'X', virksomhet: 'Entur AS', orgnr: '917422575', fagomrade: 'Arbeid' });
    expect(t.virksomheter).toEqual(['Entur AS']);
    expect(t.orgnr).toEqual(['917422575']);
  });

  test('several organisations keep their order, with the main organisation first', () => {
    const t = tilKiTiltak({ id: 'a', navn: 'X', virksomhet: ['Entur AS', 'Ruter AS', 'Vy'], orgnr: ['1', '2', '3'] });
    expect(t.virksomheter).toEqual(['Entur AS', 'Ruter AS', 'Vy']);
    expect(virksomhetTekst(t)).toBe('Entur AS, Ruter AS, Vy');
  });

  test('virksomhet and orgnr are paired before empty ones are removed', () => {
    const t = tilKiTiltak({ id: 'a', navn: 'X', virksomhet: [null, 'Ruter AS', 'NA'], orgnr: ['1', '2', null] });
    expect(t.virksomheter).toEqual(['Ruter AS']);
    expect(t.orgnr).toEqual(['2']);
  });

  test('null, empty lists and placeholders disappear, so none of it is shown', () => {
    expect(
      tilKiTiltak({
        id: 'a',
        navn: 'X',
        virksomhet: null,
        orgnr: null,
        fagomrade: null,
        beskrivelse: 'NA',
        fase: null,
        kiType: [],
        kiTypeAnnet: ' ',
        leveranse: ['N/A', '-'],
        leveranseAnnet: 'ikke oppgitt',
        kontaktinfo: null,
      }),
    ).toEqual({ id: 'a', navn: 'X', virksomheter: [], orgnr: [], fagomrade: '', beskrivelse: '' });
  });

  test('placeholders are removed from the lists, and the values are trimmed', () => {
    const t = tilKiTiltak({ id: 'a', navn: 'X', kiType: ['NA', ' Generativ KI '], leveranse: 'Pilot' });
    expect(t.kiType).toEqual(['Generativ KI']);
    expect(t.leveranse).toEqual(['Pilot']);
  });

  test('fase as a placeholder is no fase, but an unknown fase still throws', () => {
    expect(tilKiTiltak({ id: 'a', navn: 'X', fase: 'NA' }).fase).toBeUndefined();
    expect(() => tilKiTiltak({ id: 'a', navn: 'X', fase: 'Ferdig' })).toThrow(/Unknown fase on X/);
  });
});

describe('registered date', () => {
  test.each([
    ['2025-12-13', '2025-12-13'],
    ['13.12.2025', '2025-12-13'],
    ['1.2.2026', '2026-02-01'],
    ['2025-12-13T10:00:00Z', '2025-12-13'],
    ['2025-12-13T23:30:00Z', '2025-12-14'],
    ['2025-12-13T10:00:00.123+01:00', '2025-12-13'],
  ])('%s gives %s', (input, expected) => {
    expect(toRegistered(input)).toBe(expected);
  });

  test.each([null, undefined, '', ' ', 'NA', 'snart', '2025-02-30', '31.04.2025', '12/13/2025', '2025-13-01T10:00:00Z'])(
    '%s gives no date',
    (input) => {
      expect(toRegistered(input)).toBeUndefined();
    },
  );

  test('is shown as day, month in words and year', () => {
    expect(formatRegistered('2025-12-13')).toBe('13. desember 2025');
    expect(formatRegistered('2026-01-01')).toBe('1. januar 2026');
  });

  test('comes from opprettet, and a tiltak without it has no date', () => {
    expect(tilKiTiltak({ id: 'a', navn: 'X', opprettet: '2025-12-13' }).registered).toBe('2025-12-13');
    expect(tilKiTiltak({ id: 'a', navn: 'X' })).not.toHaveProperty('registered');
    expect(tilKiTiltak({ id: 'a', navn: 'X', opprettet: 'NA' })).not.toHaveProperty('registered');
  });
});
