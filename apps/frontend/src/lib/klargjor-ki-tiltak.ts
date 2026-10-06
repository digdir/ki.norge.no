/**
 * Gjør en eksport fra KI-tiltaksregisteret om til ki-tiltak.json. Brukes av
 * scripts/klargjor-ki-tiltak.mjs. Bare rene funksjoner her, så de kan testes.
 *
 * Importen har .ts-endelse fordi skriptet kjøres rett med node, som ikke
 * gjetter endelser.
 */
import { FAGOMRADER, FASER, KI_TYPER, LEVERANSER } from './ki-tiltak-verdier.ts';

export type Tiltak = Record<string, unknown> & { id: string; navn: string };

/** Registerets skrivemåter som betyr det samme som våre verdier. */
export const VARIANTER: Record<string, string> = {
  'Språkteknologi (NLP)': 'Språkteknologi',
  'Fullskala / produksjonssatt': 'Løsning i produksjon',
};

/** Feltene med faste verdier, og hvilke verdier som er gyldige. */
const GYLDIGE: Record<string, readonly string[]> = {
  fagomrade: FAGOMRADER,
  fase: FASER,
  kiType: KI_TYPER,
  leveranse: LEVERANSER,
};

/** Rekkefølgen feltene skrives i, som i eksporten. Ukjente felt kommer sist. */
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
 * «NA» eller «N/A» som hele verdien blir null. Står NA som en bit i en tekst
 * skilt med «;», fjernes biten med skilletegnet, og resten står urørt.
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

/** NA og registerets varianter, felt for felt. Endrer ikke input. */
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

/** Verdier i de faste feltene som ikke finnes i skjemaet eller begrepslista. */
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
 * Én overstyring per id. `sett` erstatter hele felt. `erstatt` bytter en
 * tekstbit i et felt, for små rettinger som ikke skal låse resten av teksten.
 * `tiltak` og `hvorfor` er bare for den som leser fila.
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
 * Legger overstyringene på. Felt som allerede har verdien, og tekstbiter som
 * ikke finnes lenger, havner i `uendret`, så det synes når en overstyring kan
 * fjernes.
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

/** Feltene i fast rekkefølge, så fila blir lik fra gang til gang. */
export function sorterFelt(tiltak: Tiltak): Tiltak {
  const kjente = FELTREKKEFOLGE.filter((f) => f in tiltak);
  const andre = Object.keys(tiltak).filter((f) => !FELTREKKEFOLGE.includes(f));
  return Object.fromEntries([...kjente, ...andre].map((f) => [f, tiltak[f]])) as Tiltak;
}

const somListe = (verdi: unknown): unknown[] => (Array.isArray(verdi) ? verdi : [verdi]);

/** Orgnr i dataene som mangler i navnetabellen, med navnet eksporten bruker. */
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

/** Hele løpet: rens, overstyr, sjekk og sorter felt. */
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

/** Formatert som ki-tiltak.json: to mellomrom og linjeskift til slutt. */
export const tilJson = (tiltak: Tiltak[]) => `${JSON.stringify(tiltak, null, 2)}\n`;
