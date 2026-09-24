import { describe, expect, test } from 'vitest';
import {
  FAGOMRADER,
  ALLE_STATUSER,
  filterTiltak,
  kiTiltak,
  type KiTiltak,
  type KiTiltakFilter,
  visValg,
  KI_TYPER,
  LEVERANSER,
  somTekst,
} from './ki-tiltak';

const EMPTY: KiTiltakFilter = { query: '', fagomrade: [] };

/**
 * Feltene filterTiltak søker i.
 *
 * Testene under henter søkeordene sine fra datasettet i stedet for å hardkode
 * dem. Redaksjonen endrer navn og tekst jevnlig, og en test som låser seg til
 * en bestemt formulering stopper dem i CI uten å fange en eneste reell feil.
 */
const SEARCHABLE = ['navn', 'virksomhet', 'fagomrade', 'beskrivelse', 'fase'] as const;
type SearchField = (typeof SEARCHABLE)[number];

function otherFields(tiltak: KiTiltak, exclude: SearchField): string {
  return SEARCHABLE.filter((f) => f !== exclude)
    .map((f) => tiltak[f] ?? '')
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
    const value = (tiltak[field] ?? '').trim();
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
      expect(ALLE_STATUSER, `ukjent status på ${tiltak.navn}`).toContain(tiltak.status);
    }
  });

  /**
   * Metadatafeltene er valgfrie, men skrives de først, skal de være riktige.
   * En feilstavet verdi gir ingen krasj, bare en merkelapp som ser rar ut på
   * et offentlig nettsted, og det oppdager ingen ved et øyekast.
   */
  test('kiType bruker bare verdier fra KI_TYPER', () => {
    for (const t of kiTiltak) {
      for (const v of t.kiType ?? []) {
        expect(KI_TYPER, `ukjent KI-type på ${t.navn}`).toContain(v);
      }
    }
  });

  test('leveranse bruker bare verdier fra LEVERANSER', () => {
    for (const t of kiTiltak) {
      for (const v of t.leveranse ?? []) {
        expect(LEVERANSER, `ukjent leveranse på ${t.navn}`).toContain(v);
      }
    }
  });

  test('ingen tomme strenger eller duplikater i flervalgene', () => {
    for (const t of kiTiltak) {
      for (const [felt, liste] of [['kiType', t.kiType], ['leveranse', t.leveranse]] as const) {
        if (!liste) continue;
        expect(liste.filter((v) => v.trim().length === 0), `tom verdi i ${felt} på ${t.navn}`).toHaveLength(0);
        expect(new Set(liste).size, `duplikat i ${felt} på ${t.navn}`).toBe(liste.length);
      }
    }
  });

  /**
   * Fritekst uten «Annet» i lista er en avskriftsfeil: teksten blir aldri vist,
   * fordi visValg bare bytter ut ordet «Annet» der det står.
   */
  test('Annet-fritekst forutsetter at Annet er valgt', () => {
    for (const t of kiTiltak) {
      if (t.kiTypeAnnet?.trim()) {
        expect(t.kiType ?? [], `kiTypeAnnet uten «Annet» på ${t.navn}`).toContain('Annet');
      }
      if (t.leveranseAnnet?.trim()) {
        expect(t.leveranse ?? [], `leveranseAnnet uten «Annet» på ${t.navn}`).toContain('Annet');
      }
    }
  });

  test('kontaktinfo ser ut som en e-postadresse', () => {
    for (const t of kiTiltak) {
      if (!t.kontaktinfo?.trim()) continue;
      expect(t.kontaktinfo, `kontaktinfo uten @ på ${t.navn}`).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    }
  });

  /**
   * Lenker skrives som [tekst](url). Bare http og https rendres som lenke, alt
   * annet blir stående som synlig tekst, og det ser ut som en feil på sida.
   */
  test('lenker i beskrivelsen bruker http eller https', () => {
    for (const t of kiTiltak) {
      for (const treff of t.beskrivelse.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
        expect(treff[1], `lenke som ikke blir klikkbar på ${t.navn}`).toMatch(/^https?:\/\//);
      }
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

  test('fritekst og fasett kombineres som OG', () => {
    // Status er ikke lenger en fasett, så de to dimensjonene som kan kombineres
    // er fritekstsøket og fag- og temaområde.
    const tiltak = kiTiltak.find((t) => t.navn.trim().length > 0);
    expect(tiltak, 'datasettet er tomt').toBeDefined();

    const treff = filterTiltak(kiTiltak, {
      query: tiltak!.navn,
      fagomrade: [tiltak!.fagomrade],
    });
    expect(treff.map((t) => t.id)).toContain(tiltak!.id);
    expect(treff.every((t) => t.fagomrade === tiltak!.fagomrade)).toBe(true);

    // Samme søk, men med et fagområde tiltaket ikke har, skal utelukke det.
    const annet = FAGOMRADER.find((f) => f !== tiltak!.fagomrade);
    const uten = filterTiltak(kiTiltak, { query: tiltak!.navn, fagomrade: [annet!] });
    expect(uten.map((t) => t.id)).not.toContain(tiltak!.id);
  });

  test('ingen treff gir tom liste', () => {
    expect(filterTiltak(kiTiltak, { ...EMPTY, query: 'zzzfinnesikke' })).toEqual([]);
  });
});

describe('visValg', () => {
  test('tomt eller manglende valg gir tom liste', () => {
    expect(visValg(undefined, 'noe')).toEqual([]);
    expect(visValg([], 'noe')).toEqual([]);
  });

  test('vanlige valg går uendret gjennom', () => {
    expect(visValg(['PoC', 'Pilot'])).toEqual(['PoC', 'Pilot']);
  });

  test('Annet byttes ut med friteksten, på samme plass', () => {
    expect(visValg(['PoC', 'Annet', 'Pilot'], 'Noe helt eget')).toEqual([
      'PoC',
      'Noe helt eget',
      'Pilot',
    ]);
  });

  test('Annet uten fritekst beholdes som Annet', () => {
    expect(visValg(['PoC', 'Annet'], '')).toEqual(['PoC', 'Annet']);
    expect(visValg(['PoC', 'Annet'])).toEqual(['PoC', 'Annet']);
  });

  test('fritekst som bare er mellomrom teller som tom', () => {
    expect(visValg(['Annet'], '   ')).toEqual(['Annet']);
  });
});

describe('somTekst', () => {
  test('ett, to og flere valg leses som vanlig norsk', () => {
    expect(somTekst(['I drift'])).toBe('I drift');
    expect(somTekst(['PoC', 'MVP'])).toBe('PoC og MVP');
    expect(somTekst(['Generativ KI', 'Prediktiv KI', 'Språkteknologi'])).toBe('Generativ KI, Prediktiv KI og Språkteknologi');
  });

  test('status søkes ikke i', () => {
    const synlig = (t: KiTiltak) => `${t.navn} ${t.virksomhet} ${t.fagomrade} ${t.beskrivelse} ${t.fase ?? ''}`.toLowerCase();
    const kandidat = kiTiltak.find((t) => t.status !== '' && !synlig(t).includes(t.status.toLowerCase()));
    expect(kandidat, 'fant ikke et tiltak der statusordet bare står i status').toBeDefined();
    const treff = filterTiltak(kiTiltak, { ...EMPTY, query: kandidat!.status });
    expect(treff.map((t) => t.id)).not.toContain(kandidat!.id);
  });
});
