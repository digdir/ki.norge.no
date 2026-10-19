/**
 * Turns an export from the KI-tiltak register into ki-tiltak.json. Used by
 * scripts/klargjor-ki-tiltak.mjs. Only pure functions here, so they can be tested.
 *
 * The import has a .ts extension because the script runs directly with node, which doesn't
 * guess extensions.
 */
import { FAGOMRADER, FASER, KI_TYPER, LEVERANSER } from './ki-tiltak-verdier.ts';

export type Tiltak = Record<string, unknown> & { id: string; navn: string };

/** The register's spellings that mean the same as our values. */
export const VARIANTER: Record<string, string> = {
  'Språkteknologi (NLP)': 'Språkteknologi',
  'Fullskala / produksjonssatt': 'Løsning i produksjon',
};

/** The fields with fixed values, and which values are valid. */
const GYLDIGE: Record<string, readonly string[]> = {
  fagomrade: FAGOMRADER,
  fase: FASER,
  kiType: KI_TYPER,
  leveranse: LEVERANSER,
};

/** The order the fields are written in, as in the export. Unknown fields come last. */
const FELTREKKEFOLGE = [
  'id',
  'navn',
  'virksomhet',
  'orgnr',
  'fagomrade',
  'beskrivelse',
  'fase',
  'leveranse',
  'leveranseAnnet',
  'kiType',
  'kiTypeAnnet',
  'kontaktinfo',
];

const erNA = (tekst: string) => /^n\/?a$/i.test(tekst.trim());

/**
 * "NA" or "N/A" as the whole value becomes null. If NA is a part of a text
 * separated by ";", the part is removed with its separator, and the rest is left untouched.
 */
export function utenNA(verdi: string): { verdi: string | null; rettet: number } {
  if (erNA(verdi)) return { verdi: null, rettet: 1 };
  const deler = verdi.split(/(\s*;\s*)/);
  const biter = deler.filter((_, i) => i % 2 === 0);
  const skille = deler.filter((_, i) => i % 2 === 1);
  const rettet = biter.filter(erNA).length;
  if (rettet === 0) return { verdi, rettet: 0 };

  let ut = '';
  biter.forEach((bit, i) => {
    if (erNA(bit)) return;
    if (ut !== '') ut += skille[i - 1];
    ut += bit;
  });
  return { verdi: ut === '' ? null : ut, rettet };
}

export interface Bytte {
  felt: string;
  fra: string;
  til: string;
}

/** NA and the register's variants, field by field. Does not modify the input. */
export function rensTiltak(tiltak: Tiltak): { tiltak: Tiltak; naRettet: number; byttet: Bytte[] } {
  let naRettet = 0;
  const byttet: Bytte[] = [];
  const ut: Tiltak = { ...tiltak };

  for (const [felt, verdi] of Object.entries(tiltak)) {
    if (typeof verdi === 'string') {
      const renset = utenNA(verdi);
      naRettet += renset.rettet;
      ut[felt] = renset.verdi;
    } else if (Array.isArray(verdi)) {
      const uten = verdi.filter((v) => !(typeof v === 'string' && erNA(v)));
      naRettet += verdi.length - uten.length;
      ut[felt] = uten;
    }

    if (felt in GYLDIGE) {
      const byttVerdi = (v: unknown) => {
        if (typeof v !== 'string' || !(v in VARIANTER)) return v;
        byttet.push({ felt, fra: v, til: VARIANTER[v] });
        return VARIANTER[v];
      };
      const naa = ut[felt];
      ut[felt] = Array.isArray(naa) ? naa.map(byttVerdi) : byttVerdi(naa);
    }
  }
  return { tiltak: ut, naRettet, byttet };
}

/** Values in the fixed fields that are not in the form or the term list. */
export function ukjenteVerdier(tiltak: Tiltak): { felt: string; verdi: string }[] {
  const ukjente: { felt: string; verdi: string }[] = [];
  for (const [felt, gyldige] of Object.entries(GYLDIGE)) {
    const verdi = tiltak[felt];
    for (const v of Array.isArray(verdi) ? verdi : [verdi]) {
      if (typeof v === 'string' && !gyldige.includes(v)) ukjente.push({ felt, verdi: v });
    }
  }
  return ukjente;
}

/**
 * One override per id. `sett` replaces whole fields. `erstatt` replaces a
 * piece of text in a field, for small fixes that should not lock the rest of the text.
 * `tiltak` and `hvorfor` are only for whoever reads the file.
 */
export interface Overstyring {
  tiltak?: string;
  hvorfor: string;
  sett?: Record<string, unknown>;
  erstatt?: Record<string, { fra: string; til: string }>;
}

export interface Brukt {
  id: string;
  navn: string;
  endret: string[];
  uendret: string[];
}

/**
 * Applies the overrides. Fields that already have the value, and text pieces that
 * no longer exist, end up in `uendret`, so it shows when an override can
 * be removed.
 */
export function brukOverstyringer(
  tiltak: Tiltak[],
  overstyringer: Record<string, Overstyring>,
): { tiltak: Tiltak[]; brukt: Brukt[]; ukjenteId: string[] } {
  const brukt: Brukt[] = [];
  const ut = tiltak.map((t) => {
    const o = overstyringer[t.id];
    if (!o) return t;
    const ny: Tiltak = { ...t };
    const endret: string[] = [];
    const uendret: string[] = [];

    for (const [felt, verdi] of Object.entries(o.sett ?? {})) {
      if (JSON.stringify(ny[felt]) === JSON.stringify(verdi)) uendret.push(felt);
      else endret.push(felt);
      ny[felt] = verdi;
    }
    for (const [felt, { fra, til }] of Object.entries(o.erstatt ?? {})) {
      const tekst = ny[felt];
      if (typeof tekst === 'string' && tekst.includes(fra)) {
        ny[felt] = tekst.replace(fra, til);
        endret.push(felt);
      } else {
        uendret.push(felt);
      }
    }
    brukt.push({ id: t.id, navn: t.navn, endret, uendret });
    return ny;
  });
  const ider = new Set(tiltak.map((t) => t.id));
  return { tiltak: ut, brukt, ukjenteId: Object.keys(overstyringer).filter((id) => !ider.has(id)) };
}

/** The fields in a fixed order, so the file is the same from run to run. */
export function sorterFelt(tiltak: Tiltak): Tiltak {
  const kjente = FELTREKKEFOLGE.filter((f) => f in tiltak);
  const andre = Object.keys(tiltak).filter((f) => !FELTREKKEFOLGE.includes(f));
  return Object.fromEntries([...kjente, ...andre].map((f) => [f, tiltak[f]])) as Tiltak;
}

const somListe = (verdi: unknown): unknown[] => (Array.isArray(verdi) ? verdi : [verdi]);

/** Orgnr in the data that are missing from the name table, with the name the export uses. */
export function orgnrUtenNavn(
  tiltak: Tiltak[],
  navnetabell: Record<string, string>,
): { orgnr: string; navn: string }[] {
  const mangler = new Map<string, string>();
  for (const t of tiltak) {
    const navn = somListe(t.virksomhet);
    somListe(t.orgnr).forEach((orgnr, i) => {
      if (typeof orgnr === 'string' && orgnr !== '' && !(orgnr in navnetabell)) {
        mangler.set(orgnr, String(navn[i] ?? ''));
      }
    });
  }
  return [...mangler].map(([orgnr, navn]) => ({ orgnr, navn }));
}

export interface Resultat {
  tiltak: Tiltak[];
  naRettet: number;
  byttet: Bytte[];
  brukt: Brukt[];
  ukjenteId: string[];
  ukjente: { navn: string; felt: string; verdi: string }[];
  utenNavn: { orgnr: string; navn: string }[];
  utenFagomrade: string[];
}

/** The whole pipeline: clean, override, check and sort fields. */
export function klargjor(
  eksport: Tiltak[],
  overstyringer: Record<string, Overstyring>,
  navnetabell: Record<string, string>,
): Resultat {
  let naRettet = 0;
  const byttet: Bytte[] = [];
  const renset = eksport.map((t) => {
    const r = rensTiltak(t);
    naRettet += r.naRettet;
    byttet.push(...r.byttet);
    return r.tiltak;
  });
  const { tiltak, brukt, ukjenteId } = brukOverstyringer(renset, overstyringer);
  return {
    tiltak: tiltak.map(sorterFelt),
    naRettet,
    byttet,
    brukt,
    ukjenteId,
    ukjente: tiltak.flatMap((t) => ukjenteVerdier(t).map((u) => ({ navn: t.navn, ...u }))),
    utenNavn: orgnrUtenNavn(tiltak, navnetabell),
    utenFagomrade: tiltak.filter((t) => typeof t.fagomrade !== 'string' || t.fagomrade.trim() === '').map((t) => t.navn),
  };
}

/** Formatted like ki-tiltak.json: two spaces and a trailing line break. */
export const tilJson = (tiltak: Tiltak[]) => `${JSON.stringify(tiltak, null, 2)}\n`;
