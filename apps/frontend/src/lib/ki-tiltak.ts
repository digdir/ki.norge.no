import data from '../data/ki-tiltak.json';
import virksomhetsnavn from '../data/ki-tiltak-virksomhetsnavn.json';
import { FAGOMRADER, FASER, KI_TYPER, LEVERANSER } from './ki-tiltak-verdier';

/**
 * `fase` comes from the form's "Hvilken fase er tiltaket i?" and only exists on
 * tiltak that were submitted or updated via the form. toFase throws on
 * unknown values, so a typo in ki-tiltak.json stops the build instead
 * of showing up on the site. The old status field has been removed entirely.
 */
export type KiTiltakFase = (typeof FASER)[number];

export interface KiTiltak {
  /** GUID from kinorge.json */
  id: string;
  navn: string;
  /** Display name, for example "Entur AS". The main organisation first. */
  virksomheter: string[];
  /** Same order as virksomheter. */
  orgnr: string[];
  /** Always exactly one fagområde per tiltak */
  fagomrade: string;
  beskrivelse: string;
  /** From the form. Shown as "Fase". The older entries don't have it. */
  fase?: KiTiltakFase;
  /**
   * Metadata from the submission form. All are optional, and only apply to tiltak
   * that were submitted or updated via the form on /ki-tiltak. The older
   * entries don't have them, and should not be backfilled.
   *
   * The view skips an empty field entirely, heading and all. A tiltak with
   * only a description and a topic should look finished, not half filled in.
   */
  leveranse?: string[];
  leveranseAnnet?: string;
  kiType?: string[];
  kiTypeAnnet?: string;
  /**
   * Email address. The field is published, and ki-tiltak.json lives in a public
   * repo, so this should be an organisation address and not a personal one.
   */
  kontaktinfo?: string;
  /** When the tiltak was created in the register, as YYYY-MM-DD in Oslo time. Shown as "Registrert". */
  registered?: string;
}

export { FAGOMRADER, FASER, LEVERANSER, KI_TYPER, ANNET } from './ki-tiltak-verdier';

const PLASSHOLDERE = new Set(['na', 'n/a', '-', '–', 'null', 'ikke oppgitt']);

/**
 * True for everything that should not be shown: null, undefined, empty text, only
 * whitespace, the placeholders NA, N/A, -, –, null and "ikke oppgitt" (regardless
 * of upper and lower case), and lists with only such values.
 */
export function utenVerdi(verdi: unknown): boolean {
  if (verdi === null || verdi === undefined) return true;
  if (typeof verdi === 'string') return PLASSHOLDERE.has(verdi.trim().toLowerCase()) || verdi.trim() === '';
  if (Array.isArray(verdi)) return verdi.every(utenVerdi);
  return false;
}

type Tekst = string | null | undefined;

/** A tiltak as it appears in ki-tiltak.json. Virksomhet and orgnr can be text or a list, and every field can be null. */
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
  /** The register's creation date. Its format is not settled yet, see toRegistered. */
  opprettet?: Tekst;
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
  if (matches === undefined) throw new Error(`Unknown fase on ${navn} in ki-tiltak.json: "${fase}"`);
  return matches;
}

const OSLO_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' });

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * The register had no creation date when this was written, so the format is a guess. Takes
 * 2025-12-13, 13.12.2025 and a full timestamp, which becomes the date in Oslo. Anything else
 * gives no date, and a test on the data catches it before it reaches the site.
 */
export function toRegistered(value: Tekst): string | undefined {
  const text = tekst(value);
  if (text === undefined) return undefined;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return isRealDate(+iso[1], +iso[2], +iso[3]) ? text : undefined;
  const norwegian = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (norwegian) {
    const [day, month, year] = [+norwegian[1], +norwegian[2], +norwegian[3]];
    if (!isRealDate(year, month, day)) return undefined;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return undefined;
  const time = Date.parse(text);
  return Number.isNaN(time) ? undefined : OSLO_DATE.format(time);
}

/** "13. desember 2025" */
export function formatRegistered(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Oslo',
  });
}

export type Navnekilde = 'tabell' | 'register';

/**
 * Where the organisation names on the page come from. "tabell" looks up orgnr in
 * ki-tiltak-virksomhetsnavn.json, and converts the name in the data from ALL CAPS
 * when the orgnr is missing there. "register" shows the names as they appear in the data, as
 * in the Brønnøysund register. The switch exists to be able to change quickly.
 */
export const VIRKSOMHETSNAVN: Navnekilde = 'tabell';

const navnetabell: Record<string, string> = virksomhetsnavn;

const FORKORTELSER = new Set(['AS', 'ASA', 'HF', 'RHF', 'IKS', 'KF', 'SF', 'KS', 'NAV', 'DFØ', 'NTNU', 'NVE', 'DSS', 'SSB', 'IKT', 'KI']);

/**
 * Fallback for organisations not yet in the name table. A name in only
 * CAPITALS gets a capital first letter and lower case otherwise, but known abbreviations are kept.
 * Place names come out wrong ("Helse bergen HF"), which is why the table is the first choice.
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
 * From the file to the model the page uses. Fields without a value are dropped, so
 * the view never shows "NA" or an empty heading. Virksomhet and orgnr
 * are paired up before empty ones are removed, so they don't drift apart.
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
    registered: toRegistered(raw.opprettet),
  };
  for (const felt of Object.keys(tiltak) as (keyof KiTiltak)[]) {
    if (tiltak[felt] === undefined) delete tiltak[felt];
  }
  return tiltak;
}

const rawData: RawTiltak[] = data;

/**
 * Sorting happens here, not in the JSON file.
 *
 * Previously the editors had to keep the file alphabetical themselves, and a test enforced
 * it. CI then blocked anyone who renamed a tiltak without also
 * moving the entry. That is a burden with no gain when the code can sort by itself.
 */
export const kiTiltak: KiTiltak[] = rawData
  .map((raw) => tilKiTiltak(raw))
  .sort((a, b) => a.navn.localeCompare(b.navn, 'nb', { sensitivity: 'base', numeric: true }));

/** "Entur AS, Ruter, Vy". This is how the organisations are shown on the card. */
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

/** The categories in the filter panel, in the order they are shown. */
export type FilterGruppe = Exclude<keyof KiTiltakFilter, 'query'>;
export const FILTERGRUPPER: readonly FilterGruppe[] = ['fagomrade', 'fase', 'leveranse', 'kiType'];

export const TOMT_FILTER: KiTiltakFilter = { query: '', fagomrade: [], fase: [], leveranse: [], kiType: [] };

/** The heading in the panel and the prefix on the chip. */
export const FILTERETIKETTER: Record<FilterGruppe, string> = {
  fagomrade: 'Fag- og temaområde',
  fase: 'Fase',
  leveranse: 'Leveranse',
  kiType: 'Type KI',
};

/** The filter option for tiltak missing fase, leveranse or type KI. It is not an option in the form. */
export const IKKE_DEFINERT = 'Ikke definert';

/** The options in each category, in the form's order, with "Ikke definert" last. */
export const FILTERVALG: Record<FilterGruppe, readonly string[]> = {
  fagomrade: FAGOMRADER,
  fase: [...FASER, IKKE_DEFINERT],
  leveranse: [...LEVERANSER, IKKE_DEFINERT],
  kiType: [...KI_TYPER, IKKE_DEFINERT],
};

/** Removes all category selections, but leaves the search text. */
export function utenKategorier(filter: KiTiltakFilter): KiTiltakFilter {
  return { ...TOMT_FILTER, query: filter.query };
}

const ellerIkkeDefinert = (verdier?: string[]) => (verdier && verdier.length > 0 ? verdier : [IKKE_DEFINERT]);

/**
 * The values a tiltak has in a category. kiType and leveranse are lists, the others
 * a single choice. If the tiltak lacks fase, kiType or leveranse, the value is "Ikke definert".
 */
export function verdierI(tiltak: KiTiltak, gruppe: FilterGruppe): string[] {
  if (gruppe === 'kiType') return ellerIkkeDefinert(tiltak.kiType);
  if (gruppe === 'leveranse') return ellerIkkeDefinert(tiltak.leveranse);
  if (gruppe === 'fase') return tiltak.fase ? [tiltak.fase] : [IKKE_DEFINERT];
  return [tiltak.fagomrade];
}

/**
 * Number of tiltak behind each filter option. A tiltak with several KI types counts once
 * under each of them.
 */
export function tellFiltervalg(items: KiTiltak[]): Record<FilterGruppe, Map<string, number>> {
  const perGruppe = Object.fromEntries(FILTERGRUPPER.map((g) => [g, new Map<string, number>()])) as Record<
    FilterGruppe,
    Map<string, number>
  >;
  for (const tiltak of items) {
    for (const gruppe of FILTERGRUPPER) {
      for (const verdi of verdierI(tiltak, gruppe)) {
        perGruppe[gruppe].set(verdi, (perGruppe[gruppe].get(verdi) ?? 0) + 1);
      }
    }
  }
  return perGruppe;
}

/**
 * The text the free-text search looks in. The same as the page shows about the tiltak, card and
 * detail view, with the organisation names as they appear after the name table.
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
 * Free-text search combined with facet filters. Within a category it is enough that one
 * of the options matches, across categories all must match. For lists like
 * kiType it is enough that the tiltak has one of the selected values. An empty category
 * means no restriction from it.
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
 * Merges a multi-select with its "Annet" free text into what should be shown.
 *
 * The form stores the "Annet" choice and the free text separately. Showing both gives
 * "Annet, chatbot for innbyggere", where the first part tells the reader nothing. Here
 * the free text replaces the word, in the position the word had, so the order the editor
 * chose is kept. If the free text is missing, we fall back to "Annet", which at
 * least is honest that there is something outside the list.
 */
export function visValg(valg?: string[], annet?: string): string[] {
  if (!valg || valg.length === 0) return [];
  const fritekst = annet?.trim();
  return valg
    .map((v) => (v === 'Annet' && fritekst ? fritekst : v))
    .filter((v) => v.trim().length > 0);
}

const listeformat = new Intl.ListFormat('nb', { style: 'long', type: 'conjunction' });

/** "Generativ KI, Prediktiv KI og Språkteknologi". This is how the multi-selects are shown in the detail view. */
export function somTekst(verdier: string[]): string {
  return listeformat.format(verdier);
}
