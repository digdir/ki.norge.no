import data from '../data/ki-tiltak.json';
import virksomhetsnavn from '../data/ki-tiltak-virksomhetsnavn.json';
import { FAGOMRADER, FASER, KI_TYPER, LEVERANSER } from './ki-tiltak-verdier';

/**
 * `fase` kommer fra skjemaets «Hvilken fase er tiltaket i?» og finnes bare på
 * tiltak som er sendt inn eller oppdatert via skjemaet. toFase kaster på
 * ukjente verdier, så en skrivefeil i ki-tiltak.json stopper bygget i stedet
 * for å vises på nettstedet. Det gamle status-feltet er fjernet helt.
 */
export type KiTiltakFase = (typeof FASER)[number];

export interface KiTiltak {
  /** GUID fra kinorge.json */
  id: string;
  navn: string;
  /** Visningsnavn, for eksempel "Entur AS". Hovedvirksomheten først. */
  virksomheter: string[];
  /** Samme rekkefølge som virksomheter. */
  orgnr: string[];
  /** Alltid nøyaktig ett fagområde per tiltak */
  fagomrade: string;
  beskrivelse: string;
  /** Fra skjemaet. Vises som «Fase». De eldre oppføringene har det ikke. */
  fase?: KiTiltakFase;
  /**
   * Metadata fra innsendingsskjemaet. Alle er valgfrie, og gjelder bare tiltak
   * som er sendt inn eller oppdatert via skjemaet på /ki-tiltak. De eldre
   * oppføringene har dem ikke, og skal ikke etterfylles.
   *
   * Visningen hopper over et tomt felt helt, overskrift og alt. Et tiltak med
   * bare beskrivelse og tema skal se ferdig ut, ikke halvt utfylt.
   */
  leveranse?: string[];
  leveranseAnnet?: string;
  kiType?: string[];
  kiTypeAnnet?: string;
  /**
   * E-postadresse. Feltet publiseres, og ki-tiltak.json ligger i et offentlig
   * repo, så dette skal være en virksomhetsadresse og ikke en personlig.
   */
  kontaktinfo?: string;
}

export { FAGOMRADER, FASER, LEVERANSER, KI_TYPER, ANNET } from './ki-tiltak-verdier';

const PLASSHOLDERE = new Set(['na', 'n/a', '-', '–', 'null', 'ikke oppgitt']);

/**
 * Sann for alt som ikke skal vises: null, undefined, tom tekst, bare
 * mellomrom, plassholderne NA, N/A, -, –, null og «ikke oppgitt» (uten hensyn
 * til store og små bokstaver), og lister med bare slike verdier.
 */
export function utenVerdi(verdi: unknown): boolean {
  if (verdi === null || verdi === undefined) return true;
  if (typeof verdi === 'string') return PLASSHOLDERE.has(verdi.trim().toLowerCase()) || verdi.trim() === '';
  if (Array.isArray(verdi)) return verdi.every(utenVerdi);
  return false;
}

type Tekst = string | null | undefined;

/** Et tiltak slik det står i ki-tiltak.json. Virksomhet og orgnr kan være tekst eller liste, og alle felt kan være null. */
export interface RawTiltak {
  id: string;
  navn: string;
  virksomhet?: Tekst | Tekst[];
  orgnr?: Tekst | Tekst[];
  fagomrade?: Tekst;
  beskrivelse?: Tekst;
  fase?: Tekst;
  kiType?: Tekst | Tekst[];
  kiTypeAnnet?: Tekst;
  leveranse?: Tekst | Tekst[];
  leveranseAnnet?: Tekst;
  kontaktinfo?: Tekst;
}

const somListe = (verdi: Tekst | Tekst[]): Tekst[] => (Array.isArray(verdi) ? verdi : [verdi]);
const tekst = (verdi: unknown): string | undefined => (utenVerdi(verdi) ? undefined : String(verdi).trim());
const liste = (verdi: Tekst | Tekst[]): string[] | undefined => {
  const verdier = somListe(verdi).map(tekst).filter((v): v is string => v !== undefined);
  return verdier.length > 0 ? verdier : undefined;
};

function toFase(value: Tekst, navn: string): KiTiltakFase | undefined {
  const fase = tekst(value);
  if (fase === undefined) return undefined;
  const matches = FASER.find((f) => f === fase);
  if (matches === undefined) throw new Error(`Ukjent fase på ${navn} i ki-tiltak.json: "${fase}"`);
  return matches;
}

export type Navnekilde = 'tabell' | 'register';

/**
 * Hvor virksomhetsnavnene på sida kommer fra. «tabell» slår opp orgnr i
 * ki-tiltak-virksomhetsnavn.json, og gjør navnet i dataene om fra VERSALER
 * når orgnr mangler der. «register» viser navnene slik de står i dataene, som
 * i Brønnøysundregisteret. Bryteren finnes for å kunne bytte raskt.
 */
export const VIRKSOMHETSNAVN: Navnekilde = 'tabell';

const navnetabell: Record<string, string> = virksomhetsnavn;

const FORKORTELSER = new Set(['AS', 'ASA', 'HF', 'RHF', 'IKS', 'KF', 'SF', 'KS', 'NAV', 'DFØ', 'NTNU', 'NVE', 'DSS', 'SSB', 'IKT', 'KI']);

/**
 * Reserve for virksomheter som ennå ikke står i navnetabellen. Et navn i bare
 * VERSALER får stor forbokstav og ellers små, men kjente forkortelser beholdes.
 * Stedsnavn blir feil («Helse bergen HF»), og derfor er tabellen førstevalget.
 */
export function vanligSkrift(navn: string): string {
  if (navn !== navn.toUpperCase()) return navn;
  const ord = navn
    .toLowerCase()
    .split(' ')
    .map((w) => (FORKORTELSER.has(w.toUpperCase()) ? w.toUpperCase() : w))
    .join(' ');
  return ord.charAt(0).toUpperCase() + ord.slice(1);
}

/**
 * Fra fila til modellen sida bruker. Felt uten verdi blir borte, så
 * visningen aldri viser «NA» eller en tom overskrift. Virksomhet og orgnr
 * pares på plass før tomme fjernes, så de ikke glir fra hverandre.
 */
export function tilKiTiltak(raw: RawTiltak, navnekilde: Navnekilde = VIRKSOMHETSNAVN): KiTiltak {
  const orgnr = somListe(raw.orgnr);
  const par = somListe(raw.virksomhet)
    .map((navn, i) => ({ navn: tekst(navn), orgnr: tekst(orgnr[i]) ?? '' }))
    .filter((v): v is { navn: string; orgnr: string } => v.navn !== undefined)
    .map((v) => (navnekilde === 'tabell' ? { ...v, navn: navnetabell[v.orgnr] ?? vanligSkrift(v.navn) } : v));
  const tiltak: KiTiltak = {
    id: raw.id,
    navn: raw.navn,
    virksomheter: par.map((v) => v.navn),
    orgnr: par.map((v) => v.orgnr),
    fagomrade: tekst(raw.fagomrade) ?? '',
    beskrivelse: tekst(raw.beskrivelse) ?? '',
    fase: toFase(raw.fase, raw.navn),
    leveranse: liste(raw.leveranse),
    leveranseAnnet: tekst(raw.leveranseAnnet),
    kiType: liste(raw.kiType),
    kiTypeAnnet: tekst(raw.kiTypeAnnet),
    kontaktinfo: tekst(raw.kontaktinfo),
  };
  for (const felt of Object.keys(tiltak) as (keyof KiTiltak)[]) {
    if (tiltak[felt] === undefined) delete tiltak[felt];
  }
  return tiltak;
}

const rawData: RawTiltak[] = data;

/**
 * Sorteringen skjer her, ikke i JSON-filen.
 *
 * Tidligere måtte redaksjonen holde filen alfabetisk selv, og en test håndhevet
 * det. Da blokkerte CI enhver som ga et tiltak et nytt navn uten samtidig å
 * flytte posten. Det er en byrde uten gevinst når koden kan sortere selv.
 */
export const kiTiltak: KiTiltak[] = rawData
  .map((raw) => tilKiTiltak(raw))
  .sort((a, b) => a.navn.localeCompare(b.navn, 'nb', { sensitivity: 'base', numeric: true }));

/** «Entur AS, Ruter, Vy». Slik vises virksomhetene på kortet. */
export function virksomhetTekst(tiltak: KiTiltak): string {
  return tiltak.virksomheter.join(', ');
}

export interface KiTiltakFilter {
  query: string;
  fagomrade: string[];
  fase: string[];
  leveranse: string[];
  kiType: string[];
}

/** Kategoriene i filterpanelet, i den rekkefølgen de vises. */
export type FilterGruppe = Exclude<keyof KiTiltakFilter, 'query'>;
export const FILTERGRUPPER: readonly FilterGruppe[] = ['fagomrade', 'fase', 'leveranse', 'kiType'];

export const TOMT_FILTER: KiTiltakFilter = { query: '', fagomrade: [], fase: [], leveranse: [], kiType: [] };

/** Overskriften i panelet og prefikset på chipen. */
export const FILTERETIKETTER: Record<FilterGruppe, string> = {
  fagomrade: 'Fag- og temaområde',
  fase: 'Fase',
  leveranse: 'Hva tiltaket skal levere',
  kiType: 'Type KI',
};

/** Valgene i hver kategori, i skjemaets rekkefølge. */
export const FILTERVALG: Record<FilterGruppe, readonly string[]> = {
  fagomrade: FAGOMRADER,
  fase: FASER,
  leveranse: LEVERANSER,
  kiType: KI_TYPER,
};

/** Fjerner alle kategorivalg, men lar søketeksten stå. */
export function utenKategorier(filter: KiTiltakFilter): KiTiltakFilter {
  return { ...TOMT_FILTER, query: filter.query };
}

/** Verdiene et tiltak har i en kategori. kiType og leveranse er lister, de andre ett valg. */
export function verdierI(tiltak: KiTiltak, gruppe: FilterGruppe): string[] {
  if (gruppe === 'kiType') return tiltak.kiType ?? [];
  if (gruppe === 'leveranse') return tiltak.leveranse ?? [];
  if (gruppe === 'fase') return tiltak.fase ? [tiltak.fase] : [];
  return [tiltak.fagomrade];
}

/**
 * Teksten fritekstsøket leter i. Det samme som sida viser om tiltaket, kort og
 * detaljvisning, med virksomhetsnavnene slik de står etter navnetabellen.
 */
function sokbarTekst(tiltak: KiTiltak): string {
  return [
    tiltak.navn,
    ...tiltak.virksomheter,
    tiltak.beskrivelse,
    tiltak.fagomrade,
    tiltak.fase ?? '',
    ...(tiltak.kiType ?? []),
    tiltak.kiTypeAnnet ?? '',
    ...(tiltak.leveranse ?? []),
    tiltak.leveranseAnnet ?? '',
    tiltak.kontaktinfo ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

/**
 * Fritekstsøk kombinert med fasettfiltre. Innen en kategori holder det at ett
 * av valgene treffer, på tvers av kategoriene må alle treffe. For lister som
 * kiType holder det at tiltaket har én av de valgte verdiene. Tom kategori
 * betyr ingen begrensning fra den.
 */
export function filterTiltak(items: KiTiltak[], filter: KiTiltakFilter): KiTiltak[] {
  const q = filter.query.trim().toLowerCase();

  return items.filter((tiltak) => {
    for (const gruppe of FILTERGRUPPER) {
      const valgt = filter[gruppe];
      if (valgt.length > 0 && !verdierI(tiltak, gruppe).some((v) => valgt.includes(v))) return false;
    }
    return q.length === 0 || sokbarTekst(tiltak).includes(q);
  });
}

/**
 * Slår sammen et flervalg med tilhørende «Annet»-fritekst til det som skal vises.
 *
 * Skjemaet lagrer valget «Annet» og friteksten hver for seg. Å vise begge gir
 * «Annet, chatbot for innbyggere», der første ledd ikke sier leseren noe. Her
 * erstatter friteksten ordet, på plassen ordet hadde, så rekkefølgen redaktøren
 * valgte beholdes. Mangler friteksten, faller vi tilbake til «Annet», som i det
 * minste er ærlig om at det finnes noe utenfor lista.
 */
export function visValg(valg?: string[], annet?: string): string[] {
  if (!valg || valg.length === 0) return [];
  const fritekst = annet?.trim();
  return valg
    .map((v) => (v === 'Annet' && fritekst ? fritekst : v))
    .filter((v) => v.trim().length > 0);
}

const listeformat = new Intl.ListFormat('nb', { style: 'long', type: 'conjunction' });

/** «Generativ KI, Prediktiv KI og Språkteknologi». Slik vises flervalgene i detaljvisningen. */
export function somTekst(verdier: string[]): string {
  return listeformat.format(verdier);
}
