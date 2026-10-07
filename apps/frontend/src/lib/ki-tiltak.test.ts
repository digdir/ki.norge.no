import { describe, expect, test } from 'vitest';
import {
  FAGOMRADER,
  FILTERETIKETTER,
  FILTERVALG,
  filterTiltak,
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
  TOMT_FILTER,
  utenKategorier,
  utenVerdi,
  vanligSkrift,
  virksomhetTekst,
  VIRKSOMHETSNAVN,
} from './ki-tiltak';
import virksomhetsnavn from '../data/ki-tiltak-virksomhetsnavn.json';

const EMPTY: KiTiltakFilter = TOMT_FILTER;

/**
 * Feltene filterTiltak søker i.
 *
 * Testene under henter søkeordene sine fra datasettet i stedet for å hardkode
 * dem. Redaksjonen endrer navn og tekst jevnlig, og en test som låser seg til
 * en bestemt formulering stopper dem i CI uten å fange en eneste reell feil.
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
 * Et søkeord som bare finnes i det angitte feltet på ett bestemt tiltak. Får vi
 * treff på det tiltaket, er feltet beviselig med i søket, siden ingen andre
 * felt inneholder ordet.
 */
function uniqueQueryFor(field: SearchField): { tiltak: KiTiltak; query: string } | null {
  for (const tiltak of kiTiltak) {
    const value = feltTekst(tiltak, field).trim();
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
      expect(tiltak.virksomheter.length, `virksomhet mangler på ${tiltak.navn}`).toBeGreaterThan(0);
      expect(tiltak.virksomheter.every((v) => v.trim().length > 0), `tomt virksomhetsnavn på ${tiltak.navn}`).toBe(true);
    }
  });

  test('bruker bare fagområder fra FAGOMRADER', () => {
    for (const tiltak of kiTiltak) {
      expect(FAGOMRADER, `ukjent fagområde på ${tiltak.navn}`).toContain(tiltak.fagomrade);
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

  test('sida viser navnet fra tabellen når bryteren står på tabell', () => {
    if (VIRKSOMHETSNAVN !== 'tabell') return;
    for (const t of kiTiltak) {
      t.orgnr.forEach((o, i) => {
        if (o in virksomhetsnavn) expect(t.virksomheter[i], `navn på ${t.navn}`).toBe(virksomhetsnavn[o as keyof typeof virksomhetsnavn]);
      });
    }
  });

  // En ny virksomhet i eksporten trenger et visningsnavn, ellers står den i VERSALER.
  test('alle orgnr i dataene har navn i ki-tiltak-virksomhetsnavn.json', () => {
    const mangler = [...new Set(kiTiltak.flatMap((t) => t.orgnr))].filter((o) => o && !(o in virksomhetsnavn));
    expect(mangler).toEqual([]);
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
      ...EMPTY,
      query: tiltak!.navn,
      fagomrade: [tiltak!.fagomrade],
    });
    expect(treff.map((t) => t.id)).toContain(tiltak!.id);
    expect(treff.every((t) => t.fagomrade === tiltak!.fagomrade)).toBe(true);

    // Samme søk, men med et fagområde tiltaket ikke har, skal utelukke det.
    const annet = FAGOMRADER.find((f) => f !== tiltak!.fagomrade);
    const uten = filterTiltak(kiTiltak, { ...EMPTY, query: tiltak!.navn, fagomrade: [annet!] });
    expect(uten.map((t) => t.id)).not.toContain(tiltak!.id);
  });

  test('søker i alle virksomhetene, ikke bare den første', () => {
    const [a, b] = kiTiltak;
    const flere: KiTiltak = { ...a, id: 'flere', virksomheter: ['Entur AS', 'Ruter AS', 'Vy'], orgnr: ['1', '2', '3'] };
    expect(filterTiltak([flere, b], { ...EMPTY, query: 'ruter' }).map((t) => t.id)).toEqual(['flere']);
  });

  test('ingen treff gir tom liste', () => {
    expect(filterTiltak(kiTiltak, { ...EMPTY, query: 'zzzfinnesikke' })).toEqual([]);
  });
});

describe('filterTiltak med fase, leveranse og type KI', () => {
  const grunn: KiTiltak = { id: '', navn: '', virksomheter: [], orgnr: [], fagomrade: 'Arbeid', beskrivelse: '' };
  const a: KiTiltak = { ...grunn, id: 'a', fase: 'I drift', kiType: ['Generativ KI', 'Språkteknologi'], leveranse: ['Pilot'] };
  const b: KiTiltak = { ...grunn, id: 'b', fase: 'Gjennomføring', kiType: ['Prediktiv KI'], leveranse: ['MVP', 'Pilot'] };
  const c: KiTiltak = { ...grunn, id: 'c', fagomrade: 'Helse og omsorg', fase: 'I drift' };
  const alle = [a, b, c];
  const ider = (filter: Partial<KiTiltakFilter>) => filterTiltak(alle, { ...EMPTY, ...filter }).map((t) => t.id);

  test('fase filtrerer på ett valg', () => {
    expect(ider({ fase: ['I drift'] })).toEqual(['a', 'c']);
  });

  test('innen en kategori holder det at ett valg treffer', () => {
    expect(ider({ fase: ['I drift', 'Gjennomføring'] })).toEqual(['a', 'b', 'c']);
    expect(ider({ kiType: ['Språkteknologi', 'Prediktiv KI'] })).toEqual(['a', 'b']);
  });

  test('en liste treffer når tiltaket har minst én av de valgte verdiene', () => {
    expect(ider({ kiType: ['Generativ KI'] })).toEqual(['a']);
    expect(ider({ leveranse: ['Pilot'] })).toEqual(['a', 'b']);
  });

  test('tiltak uten verdi i kategorien faller ut når kategorien er valgt', () => {
    expect(ider({ leveranse: ['PoC'] })).toEqual([]);
    expect(ider({ kiType: ['Generativ KI', 'Prediktiv KI'] })).not.toContain('c');
  });

  test('på tvers av kategoriene må alle treffe', () => {
    expect(ider({ fase: ['I drift'], leveranse: ['Pilot'] })).toEqual(['a']);
    expect(ider({ fagomrade: ['Arbeid'], fase: ['I drift'] })).toEqual(['a']);
    expect(ider({ fase: ['Gjennomføring'], kiType: ['Generativ KI'] })).toEqual([]);
    expect(ider({ query: 'pilot', fase: ['Gjennomføring'] })).toEqual(['b']);
  });

  test('nullstilling fjerner alle kategorier, men ikke søket', () => {
    const filter: KiTiltakFilter = { query: 'x', fagomrade: ['Arbeid'], fase: ['I drift'], leveranse: ['Pilot'], kiType: ['Annet'] };
    expect(utenKategorier(filter)).toEqual({ ...EMPTY, query: 'x' });
  });
});

describe('«Ikke definert» i Fase, Leveranse og Type KI', () => {
  const grunn: KiTiltak = { id: '', navn: '', virksomheter: [], orgnr: [], fagomrade: 'Arbeid', beskrivelse: '' };
  const a: KiTiltak = { ...grunn, id: 'a', fase: 'I drift', kiType: ['Generativ KI'], leveranse: ['Pilot'] };
  const b: KiTiltak = { ...grunn, id: 'b', fase: 'Gjennomføring', leveranse: ['MVP'] };
  const c: KiTiltak = { ...grunn, id: 'c', fagomrade: 'Helse og omsorg', fase: 'I drift' };
  const d: KiTiltak = { ...grunn, id: 'd', kiType: [], leveranse: [] };
  const alle = [a, b, c, d];
  const ider = (filter: Partial<KiTiltakFilter>) => filterTiltak(alle, { ...EMPTY, ...filter }).map((t) => t.id);

  test('står sist i Fase, Leveranse og Type KI, og ikke i fagområdene', () => {
    expect(FILTERVALG.fase.at(-1)).toBe(IKKE_DEFINERT);
    expect(FILTERVALG.leveranse.at(-1)).toBe(IKKE_DEFINERT);
    expect(FILTERVALG.kiType.at(-1)).toBe(IKKE_DEFINERT);
    expect(FILTERVALG.fagomrade).not.toContain(IKKE_DEFINERT);
  });

  test('filtergruppa heter Leveranse', () => {
    expect(FILTERETIKETTER.leveranse).toBe('Leveranse');
  });

  test('alene treffer tiltak uten verdi, også med tom liste', () => {
    expect(ider({ leveranse: [IKKE_DEFINERT] })).toEqual(['c', 'd']);
    expect(ider({ kiType: [IKKE_DEFINERT] })).toEqual(['b', 'c', 'd']);
    expect(ider({ fase: [IKKE_DEFINERT] })).toEqual(['d']);
  });

  test('fase som mangler, er null, tom eller plassholder gir «Ikke definert»', () => {
    const fra = (fase: string | null | undefined) => tilKiTiltak({ id: 'x', navn: 'x', fagomrade: 'Arbeid', fase });
    for (const fase of [undefined, null, '', '  ', 'NA']) {
      expect(verdierI(fra(fase), 'fase')).toEqual([IKKE_DEFINERT]);
    }
    expect(verdierI({ ...grunn, fase: '' as KiTiltakFase }, 'fase')).toEqual([IKKE_DEFINERT]);
    expect(verdierI(fra('I drift'), 'fase')).toEqual(['I drift']);
  });

  test('sammen med et annet valg i samme kategori holder det at ett treffer', () => {
    expect(ider({ leveranse: [IKKE_DEFINERT, 'MVP'] })).toEqual(['b', 'c', 'd']);
    expect(ider({ kiType: ['Generativ KI', IKKE_DEFINERT] })).toEqual(['a', 'b', 'c', 'd']);
    expect(ider({ fase: [IKKE_DEFINERT, 'Gjennomføring'] })).toEqual(['b', 'd']);
  });

  test('sammen med en annen kategori må begge treffe', () => {
    expect(ider({ leveranse: [IKKE_DEFINERT], fase: ['I drift'] })).toEqual(['c']);
    expect(ider({ kiType: [IKKE_DEFINERT], leveranse: ['MVP'] })).toEqual(['b']);
    expect(ider({ leveranse: [IKKE_DEFINERT], kiType: ['Generativ KI'] })).toEqual([]);
    expect(ider({ fase: [IKKE_DEFINERT], leveranse: [IKKE_DEFINERT] })).toEqual(['d']);
    expect(ider({ fase: [IKKE_DEFINERT], fagomrade: ['Helse og omsorg'] })).toEqual([]);
  });

  test('tellingen gir tiltakene uten verdi, og et tiltak med flere verdier teller under hver', () => {
    const antall = tellFiltervalg([...alle, { ...a, id: 'e', kiType: ['Generativ KI', 'Prediktiv KI'] }]);
    expect(antall.leveranse.get(IKKE_DEFINERT)).toBe(2);
    expect(antall.kiType.get(IKKE_DEFINERT)).toBe(3);
    expect(antall.kiType.get('Generativ KI')).toBe(2);
    expect(antall.kiType.get('Prediktiv KI')).toBe(1);
    expect(antall.fase.get(IKKE_DEFINERT)).toBe(1);
    expect(antall.fase.get('I drift')).toBe(3);
    expect(antall.fagomrade.has(IKKE_DEFINERT)).toBe(false);
  });

  test('tellingen mot datasettet stemmer med filteret', () => {
    const antall = tellFiltervalg(kiTiltak);
    for (const gruppe of ['fase', 'leveranse', 'kiType'] as const) {
      const uten = kiTiltak.filter((t) => utenVerdi(t[gruppe])).length;
      expect(antall[gruppe].get(IKKE_DEFINERT) ?? 0).toBe(uten);
      expect(filterTiltak(kiTiltak, { ...EMPTY, [gruppe]: [IKKE_DEFINERT] })).toHaveLength(uten);
    }
  });

  test('nullstilling fjerner valget', () => {
    const filter: KiTiltakFilter = {
      ...EMPTY,
      query: 'x',
      fase: [IKKE_DEFINERT],
      leveranse: [IKKE_DEFINERT],
      kiType: [IKKE_DEFINERT, 'Annet'],
    };
    expect(utenKategorier(filter)).toEqual({ ...EMPTY, query: 'x' });
  });

  test('søket finner ikke «Ikke definert»', () => {
    expect(filterTiltak(alle, { ...EMPTY, query: 'ikke definert' })).toEqual([]);
  });
});

describe('fritekstsøk i metadata fra skjemaet', () => {
  const grunn: KiTiltak = { id: 'm', navn: 'Tiltak', virksomheter: [], orgnr: [], fagomrade: 'Arbeid', beskrivelse: '' };
  const treff = (tiltak: KiTiltak, query: string) => filterTiltak([tiltak], { ...EMPTY, query }).length === 1;

  test('søker i kiType og kiTypeAnnet', () => {
    expect(treff({ ...grunn, kiType: ['Computer Vision'] }, 'computer vision')).toBe(true);
    expect(treff({ ...grunn, kiType: ['Annet'], kiTypeAnnet: 'Klassifisering' }, 'klassifisering')).toBe(true);
  });

  test('søker i leveranse og leveranseAnnet', () => {
    expect(treff({ ...grunn, leveranse: ['Løsning i produksjon'] }, 'i produksjon')).toBe(true);
    expect(treff({ ...grunn, leveranse: ['Annet'], leveranseAnnet: 'Veileder' }, 'veileder')).toBe(true);
  });

  test('søker i kontaktinfo', () => {
    expect(treff({ ...grunn, kontaktinfo: 'ki@etat.no' }, 'etat.no')).toBe(true);
  });

  test('uten metadata gir ordene ingen treff', () => {
    expect(treff(grunn, 'språkteknologi')).toBe(false);
  });

  test('«Språkteknologi» finner tiltakene som har den typen', () => {
    const forventet = kiTiltak.filter((t) => t.kiType?.includes('Språkteknologi')).map((t) => t.id);
    expect(forventet.length).toBeGreaterThan(0);
    const funnet = filterTiltak(kiTiltak, { ...EMPTY, query: 'Språkteknologi' }).map((t) => t.id);
    expect(funnet).toEqual(expect.arrayContaining(forventet));
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
});

describe('utenVerdi', () => {
  test.each([null, undefined, '', '   ', [], [''], [null, ' ', 'NA']])('%j har ingen verdi', (v) => {
    expect(utenVerdi(v)).toBe(true);
  });

  test.each(['NA', 'na', ' N/A ', '-', '–', 'null', 'NULL', 'Ikke oppgitt', ' ikke OPPGITT '])(
    'plassholderen %j har ingen verdi',
    (v) => {
      expect(utenVerdi(v)).toBe(true);
    },
  );

  test.each(['Pilot', ['', 'Pilot'], 'NAV', '--', 'ikke oppgitt ennå'])('%j har verdi', (v) => {
    expect(utenVerdi(v)).toBe(false);
  });
});

describe('tilKiTiltak', () => {
  test('navnetabellen erstatter registerets navn, og ukjente gjøres om fra VERSALER', () => {
    const raw = { id: 'a', navn: 'X', virksomhet: ['ENTUR AS', 'UKJENT AS'], orgnr: ['917422575', '000000000'] };
    expect(tilKiTiltak(raw, 'tabell').virksomheter).toEqual(['Entur AS', 'Ukjent AS']);
    expect(tilKiTiltak(raw, 'register').virksomheter).toEqual(['ENTUR AS', 'UKJENT AS']);
  });

  test.each([
    ['HELSE BERGEN HF', 'Helse bergen HF'],
    ['DIREKTORATET FOR FORVALTNING OG ØKONOMISTYRING', 'Direktoratet for forvaltning og økonomistyring'],
    ['Kommuneforlaget AS', 'Kommuneforlaget AS'],
  ])('vanligSkrift(%j) blir %j', (inn, ut) => {
    expect(vanligSkrift(inn)).toBe(ut);
  });

  test('én virksomhet som tekst blir en liste med én', () => {
    const t = tilKiTiltak({ id: 'a', navn: 'X', virksomhet: 'Entur AS', orgnr: '917422575', fagomrade: 'Arbeid' });
    expect(t.virksomheter).toEqual(['Entur AS']);
    expect(t.orgnr).toEqual(['917422575']);
  });

  test('flere virksomheter beholder rekkefølgen, med hovedvirksomheten først', () => {
    const t = tilKiTiltak({ id: 'a', navn: 'X', virksomhet: ['Entur AS', 'Ruter AS', 'Vy'], orgnr: ['1', '2', '3'] });
    expect(t.virksomheter).toEqual(['Entur AS', 'Ruter AS', 'Vy']);
    expect(virksomhetTekst(t)).toBe('Entur AS, Ruter AS, Vy');
  });

  test('virksomhet og orgnr pares før tomme fjernes', () => {
    const t = tilKiTiltak({ id: 'a', navn: 'X', virksomhet: [null, 'Ruter AS', 'NA'], orgnr: ['1', '2', null] });
    expect(t.virksomheter).toEqual(['Ruter AS']);
    expect(t.orgnr).toEqual(['2']);
  });

  test('null, tomme lister og plassholdere forsvinner, så ingenting av det vises', () => {
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

  test('plassholdere fjernes fra listene, og verdiene trimmes', () => {
    const t = tilKiTiltak({ id: 'a', navn: 'X', kiType: ['NA', ' Generativ KI '], leveranse: 'Pilot' });
    expect(t.kiType).toEqual(['Generativ KI']);
    expect(t.leveranse).toEqual(['Pilot']);
  });

  test('fase som plassholder er ingen fase, men en ukjent fase kaster fortsatt', () => {
    expect(tilKiTiltak({ id: 'a', navn: 'X', fase: 'NA' }).fase).toBeUndefined();
    expect(() => tilKiTiltak({ id: 'a', navn: 'X', fase: 'Ferdig' })).toThrow(/Ukjent fase på X/);
  });
});
