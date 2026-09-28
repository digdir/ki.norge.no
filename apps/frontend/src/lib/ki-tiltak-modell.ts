/**
 * Modellen for KI-tiltak, og reglene for å gjøre registerets eksport om til den.
 *
 * Fila har ingen importer med vilje. Nettstedet bruker den via ki-tiltak.ts, og
 * importskriptet (scripts/importer-ki-tiltak.mjs) kjører den direkte i Node,
 * som bare forstår TypeScript uten egne importer og uten typesyntaks som må
 * kompileres.
 */

/** Alfabetisk (nb). */
export const FAGOMRADER = [
  'Arbeid',
  'Demokrati og styresett',
  'Digitale teknologier',
  'Familie og barn',
  'Forskning',
  'Helse og omsorg',
  'Informasjonssikkerhet',
  'Innbygger',
  'Kultur, idrett og fritid',
  'Natur, klima og miljø',
  'Personvern',
  'Plan, bygg og eiendom',
  'Trafikk og transport',
  'Virksomhet',
  'Økonomi, finans og forsikring',
] as const;

/** «Hvilken fase er tiltaket i?» Ett valg. */
export const FASER = ['Innsikt og planlegging', 'Gjennomføring', 'I drift'] as const;

/** «Hva skal tiltaket levere?» Flere valg. */
export const LEVERANSER = ['PoC', 'MVP', 'Pilot', 'Løsning i produksjon', 'Annet'] as const;

/** «Hvilken type KI bruker dere i tiltaket?» Flere valg, valgfritt. */
export const KI_TYPER = [
  'Generativ KI',
  'Prediktiv KI',
  'Agentisk KI',
  'Språkteknologi',
  'Computer Vision',
  'Anbefalingssystemer',
  'Annet',
] as const;

/** Verdien som utløser fritekstfeltet «Beskriv nærmere». */
export const ANNET = 'Annet';

/** Registeret staver noen KI-typer annerledes enn skjemaet vårt. */
export const KI_TYPE_ALIAS: Record<string, string> = {
  'Språkteknologi (NLP)': 'Språkteknologi',
};

export type KiTiltakFase = (typeof FASER)[number];

export interface KiTiltak {
  id: string;
  navn: string;
  /** Visningsnavn fra navnetabellen. Hovedvirksomheten først. */
  virksomheter: string[];
  /** Samme rekkefølge som virksomheter. */
  orgnr: string[];
  /** Alltid nøyaktig ett fagområde. Tiltak uten holdes tilbake ved import. */
  fagomrade: string;
  beskrivelse: string;
  fase?: KiTiltakFase;
  kiType?: string[];
  kiTypeAnnet?: string;
  leveranse?: string[];
  leveranseAnnet?: string;
  /** E-postadresse. Publiseres, både på sida og i et offentlig repo. */
  kontaktinfo?: string;
}

type Tekst = string | null | undefined;

/** Slik registeret leverer et tiltak: tekst eller liste, og null hvor som helst. */
export interface RaaTiltak {
  id?: Tekst;
  navn?: Tekst;
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

const PLASSHOLDERE = new Set(['na', 'n/a', '-', '–', 'null', 'ikke oppgitt']);

/** NA, N/A, -, –, null og «ikke oppgitt», etter trim og uten hensyn til store og små bokstaver. */
export function erPlassholder(tekst: string): boolean {
  return PLASSHOLDERE.has(tekst.trim().toLowerCase());
}

/**
 * Sann for alt som ikke skal vises: null, undefined, tom tekst, bare
 * mellomrom, plassholdere, og lister som bare inneholder slike verdier.
 */
export function utenVerdi(verdi: unknown): boolean {
  if (verdi === null || verdi === undefined) return true;
  if (typeof verdi === 'string') return verdi.trim() === '' || erPlassholder(verdi);
  if (Array.isArray(verdi)) return verdi.every(utenVerdi);
  return false;
}

/**
 * Mekanisk rensing av fritekst. \r\n blir \n, mellomrom på linjeslutt
 * forsvinner, og i tekster satt sammen med «;» fjernes bitene som er
 * plassholdere. Uten plassholdere står en «;»-tekst urørt, så vanlig prosa
 * med semikolon ikke endres.
 */
export function rensTekst(verdi: unknown): string | undefined {
  if (typeof verdi !== 'string') return undefined;
  let tekst = verdi.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '');
  const biter = tekst.split(';');
  if (biter.length > 1 && biter.some(erPlassholder)) {
    tekst = biter
      .filter((bit) => !utenVerdi(bit))
      .map((bit) => bit.trim())
      .join(' ; ');
  }
  tekst = tekst.trim();
  return utenVerdi(tekst) ? undefined : tekst;
}

/** Tekst eller liste inn, liste uten tomme verdier og duplikater ut. */
export function rensListe(verdi: unknown): string[] {
  const liste = Array.isArray(verdi) ? verdi : [verdi];
  const renset = liste.map(rensTekst).filter((v): v is string => v !== undefined);
  return [...new Set(renset)];
}

/**
 * Bytter registerets stavemåter med våre og skiller ut verdier som ikke finnes
 * i lista. De ukjente beholdes, slik at ingenting forsvinner stille. Testen
 * på datasettet stopper dem til noen har tatt stilling.
 */
export function rensValg(verdi: unknown, gyldige: readonly string[], alias: Record<string, string> = {}) {
  const verdier = [...new Set(rensListe(verdi).map((v) => alias[v] ?? v))];
  return { verdier, ukjente: verdier.filter((v) => !gyldige.includes(v)) };
}

export interface Virksomhet {
  navn: string;
  orgnr?: string;
}

/**
 * Parer virksomhet og orgnr på plass i lista før noe fjernes, ellers glir
 * navn og nummer fra hverandre når ett av dem mangler.
 */
export function rensVirksomheter(virksomhet: unknown, orgnr: unknown): Virksomhet[] {
  const navn = Array.isArray(virksomhet) ? virksomhet : [virksomhet];
  const nummer = Array.isArray(orgnr) ? orgnr : [orgnr];
  const ut: Virksomhet[] = [];
  for (let i = 0; i < Math.max(navn.length, nummer.length); i++) {
    const n = rensTekst(navn[i]);
    const o = rensTekst(nummer[i]);
    if (n === undefined && o === undefined) continue;
    if (o !== undefined && ut.some((v) => v.orgnr === o)) continue;
    ut.push({ navn: n ?? '', ...(o !== undefined && { orgnr: o }) });
  }
  return ut;
}

/** Ett tiltak slik importen jobber med det: renset, men ennå ikke i filformatet. */
export interface ImportTiltak {
  id: string;
  navn: string;
  virksomheter: Virksomhet[];
  fagomrade?: string;
  beskrivelse?: string;
  fase?: string;
  kiType: string[];
  kiTypeAnnet?: string;
  leveranse: string[];
  leveranseAnnet?: string;
  kontaktinfo?: string;
}

export interface UkjentVerdi {
  navn: string;
  felt: string;
  verdi: string;
}

export function rensRad(raa: RaaTiltak): { tiltak: ImportTiltak; ukjente: UkjentVerdi[]; alias: number } {
  const navn = rensTekst(raa.navn) ?? '';
  const kiType = rensValg(raa.kiType, KI_TYPER, KI_TYPE_ALIAS);
  const leveranse = rensValg(raa.leveranse, LEVERANSER);
  const fase = rensTekst(raa.fase);
  const fagomrade = rensTekst(raa.fagomrade);
  const ukjente: UkjentVerdi[] = [
    ...kiType.ukjente.map((verdi) => ({ navn, felt: 'kiType', verdi })),
    ...leveranse.ukjente.map((verdi) => ({ navn, felt: 'leveranse', verdi })),
  ];
  if (fase !== undefined && !(FASER as readonly string[]).includes(fase)) ukjente.push({ navn, felt: 'fase', verdi: fase });
  if (fagomrade !== undefined && !(FAGOMRADER as readonly string[]).includes(fagomrade)) {
    ukjente.push({ navn, felt: 'fagomrade', verdi: fagomrade });
  }
  const alias = rensListe(raa.kiType).filter((v) => v in KI_TYPE_ALIAS).length;

  return {
    tiltak: {
      id: rensTekst(raa.id) ?? '',
      navn,
      virksomheter: rensVirksomheter(raa.virksomhet, raa.orgnr),
      fagomrade,
      beskrivelse: rensTekst(raa.beskrivelse),
      fase,
      kiType: kiType.verdier,
      kiTypeAnnet: rensTekst(raa.kiTypeAnnet),
      leveranse: leveranse.verdier,
      leveranseAnnet: rensTekst(raa.leveranseAnnet),
      kontaktinfo: rensTekst(raa.kontaktinfo),
    },
    ukjente,
    alias,
  };
}

export interface Sammenslaaing {
  navn: string;
  id: string;
  varianter: string[];
  /** Antall ulike beskrivelser som ble satt sammen. */
  beskrivelser: number;
  /** Variantene hadde ulik fase, og fasen er derfor utelatt. */
  faseUtelatt: boolean;
  /** Variantene hadde ulikt fagområde. Den første er brukt. */
  fagomradeUlikt: boolean;
}

const VARIANT = /^(.+?)\s+(\d+)$/;

/**
 * Registeret har ett tiltak per helseforetak for samme produkt, nummerert:
 * «BoneView 1» til «BoneView 4». Inntil noen bestemmer noe annet vises de som
 * ett tiltak med alle virksomhetene. Et navn med tall er bare en variant når
 * minst to tiltak deler resten av navnet, så «Corsano Cardiowatch 287» står.
 *
 * Valgene ved sammenslåing, i variantenes nummerrekkefølge:
 * - id og hovedvirksomhet fra den laveste varianten
 * - virksomhetene etter hverandre, uten duplikater
 * - ulike beskrivelser etter hverandre, med tom linje mellom, så ingenting tapes
 * - fasen bare hvis alle er enige. Ellers utelates den, framfor å vise en fase
 *   som er feil for noen av virksomhetene
 * - første fagområde og kontaktinfo som finnes, og alle KI-typer og leveranser
 */
export function slaaSammenVarianter(rader: ImportTiltak[]): {
  rader: ImportTiltak[];
  sammenslaatt: Sammenslaaing[];
  /** Variant-id til id-en den ble slått sammen inn i. */
  erstattet: Record<string, string>;
} {
  const grupper = new Map<string, { nr: number; tiltak: ImportTiltak }[]>();
  for (const tiltak of rader) {
    const treff = VARIANT.exec(tiltak.navn);
    if (!treff) continue;
    const gruppe = grupper.get(treff[1]) ?? [];
    gruppe.push({ nr: Number(treff[2]), tiltak });
    grupper.set(treff[1], gruppe);
  }

  const sammenslaatt: Sammenslaaing[] = [];
  const erstattet: Record<string, string> = {};
  const brukt = new Set<ImportTiltak>();
  const nye = new Map<ImportTiltak, ImportTiltak>();

  for (const [navn, gruppe] of grupper) {
    if (gruppe.length < 2) continue;
    const varianter = [...gruppe].sort((a, b) => a.nr - b.nr).map((g) => g.tiltak);
    const [forste] = varianter;
    const unike = <T,>(verdier: (T | undefined)[]) => [...new Set(verdier.filter((v): v is T => v !== undefined))];

    const virksomheter: Virksomhet[] = [];
    for (const v of varianter.flatMap((t) => t.virksomheter)) {
      const finnes = virksomheter.some((u) => (v.orgnr ? u.orgnr === v.orgnr : u.navn === v.navn));
      if (!finnes) virksomheter.push(v);
    }
    const beskrivelser = unike(varianter.map((t) => t.beskrivelse));
    const faser = unike(varianter.map((t) => t.fase));
    const fagomrader = unike(varianter.map((t) => t.fagomrade));

    nye.set(forste, {
      id: forste.id,
      navn,
      virksomheter,
      fagomrade: fagomrader[0],
      beskrivelse: beskrivelser.length > 0 ? beskrivelser.join('\n\n') : undefined,
      fase: faser.length === 1 ? faser[0] : undefined,
      kiType: unike(varianter.flatMap((t) => t.kiType)),
      kiTypeAnnet: unike(varianter.map((t) => t.kiTypeAnnet))[0],
      leveranse: unike(varianter.flatMap((t) => t.leveranse)),
      leveranseAnnet: unike(varianter.map((t) => t.leveranseAnnet))[0],
      kontaktinfo: unike(varianter.map((t) => t.kontaktinfo))[0],
    });
    for (const t of varianter) {
      brukt.add(t);
      if (t !== forste) erstattet[t.id] = forste.id;
    }
    sammenslaatt.push({
      navn,
      id: forste.id,
      varianter: varianter.map((t) => t.navn),
      beskrivelser: beskrivelser.length,
      faseUtelatt: faser.length > 1,
      fagomradeUlikt: fagomrader.length > 1,
    });
  }

  const ut: ImportTiltak[] = [];
  for (const tiltak of rader) {
    if (!brukt.has(tiltak)) ut.push(tiltak);
    else if (nye.has(tiltak)) ut.push(nye.get(tiltak)!);
  }
  return { rader: ut, sammenslaatt, erstattet };
}

export interface Navneoppslag {
  navn?: string;
  registernavn?: string;
  forslag?: boolean;
}

/**
 * Bytter registerets navn med visningsnavnet fra tabellen, slått opp på orgnr.
 * Virksomheter uten orgnr, eller uten navn i tabellen, meldes som manglende.
 */
export function settVisningsnavn(tiltak: ImportTiltak, tabell: Record<string, Navneoppslag>) {
  const mangler: Virksomhet[] = [];
  const virksomheter = tiltak.virksomheter.map((v) => {
    const navn = v.orgnr ? rensTekst(tabell[v.orgnr]?.navn) : undefined;
    if (navn === undefined) mangler.push(v);
    return { ...v, navn: navn ?? v.navn };
  });
  return { tiltak: { ...tiltak, virksomheter }, mangler };
}

export interface IdEndring {
  navn: string;
  fra: string;
  til: string;
}

/**
 * Tabellen fra gamle til nye id-er. Den samler opp over flere importer, så en
 * lenke fra to importer siden peker fortsatt riktig: A→B og B→C blir A→C.
 *
 * Et tiltak fra forrige fil som ikke finnes med samme id, matches på navn, og
 * på erstattet-tabellen fra sammenslåingen. Mål som ikke er publisert fjernes,
 * slik at tabellen aldri sender noen til et tiltak som ikke finnes.
 */
export function oppdaterIdAlias(args: {
  forrige: { id: string; navn: string }[];
  publisert: { id: string; navn: string }[];
  alias: Record<string, string>;
  erstattet?: Record<string, string>;
}) {
  const { forrige, publisert, alias, erstattet = {} } = args;
  const ider = new Set(publisert.map((t) => t.id));
  const perNavn = new Map<string, string[]>();
  for (const t of publisert) perNavn.set(t.navn, [...(perNavn.get(t.navn) ?? []), t.id]);

  const flytt = (id: string): string | undefined => {
    if (ider.has(id)) return id;
    if (erstattet[id] && ider.has(erstattet[id])) return erstattet[id];
    return undefined;
  };

  const nyId: IdEndring[] = [];
  const forsvunnet: string[] = [];
  const denneGangen: Record<string, string> = {};
  for (const t of forrige) {
    if (ider.has(t.id)) continue;
    const kandidater = perNavn.get(t.navn) ?? [];
    const til = flytt(t.id) ?? (kandidater.length === 1 ? kandidater[0] : undefined);
    if (til === undefined) {
      forsvunnet.push(t.navn);
      continue;
    }
    denneGangen[t.id] = til;
    nyId.push({ navn: t.navn, fra: t.id, til });
  }

  const samlet: Record<string, string> = {};
  const fjernet: string[] = [];
  for (const [fra, til] of Object.entries({ ...alias, ...denneGangen })) {
    if (ider.has(fra)) continue; // id-en er i bruk igjen, og slås opp direkte
    const mal = flytt(til) ?? (denneGangen[til] !== undefined ? flytt(denneGangen[til]) : undefined);
    if (mal === undefined) fjernet.push(fra);
    else samlet[fra] = mal;
  }
  const sortert = Object.fromEntries(Object.entries(samlet).sort(([a], [b]) => a.localeCompare(b)));
  return { alias: sortert, nyId, forsvunnet, fjernet };
}

/** Et tiltak slik det står i ki-tiltak.json. Én virksomhet som tekst, flere som liste. */
export interface FilTiltak {
  id: string;
  navn: string;
  virksomhet: string | string[];
  orgnr: string | string[];
  fagomrade: string;
  beskrivelse?: string;
  fase?: string;
  kiType?: string[];
  kiTypeAnnet?: string;
  leveranse?: string[];
  leveranseAnnet?: string;
  kontaktinfo?: string;
}

/** Fast feltrekkefølge, og felt uten verdi utelates, så diffen mellom to importer er lesbar. */
export function tilFilformat(t: ImportTiltak): FilTiltak {
  const en = <T,>(liste: T[]): T | T[] => (liste.length === 1 ? liste[0] : liste);
  const ut: Record<string, unknown> = {
    id: t.id,
    navn: t.navn,
    virksomhet: en(t.virksomheter.map((v) => v.navn)),
    orgnr: en(t.virksomheter.map((v) => v.orgnr ?? '')),
    fagomrade: t.fagomrade,
    beskrivelse: t.beskrivelse,
    fase: t.fase,
    kiType: t.kiType,
    kiTypeAnnet: t.kiTypeAnnet,
    leveranse: t.leveranse,
    leveranseAnnet: t.leveranseAnnet,
    kontaktinfo: t.kontaktinfo,
  };
  for (const [k, v] of Object.entries(ut)) if (utenVerdi(v)) delete ut[k];
  return ut as unknown as FilTiltak;
}

export function sorterPaaNavn<T extends { navn: string; id: string }>(liste: T[]): T[] {
  return [...liste].sort(
    (a, b) => a.navn.localeCompare(b.navn, 'nb', { sensitivity: 'base', numeric: true }) || a.id.localeCompare(b.id),
  );
}

function toFase(verdi: unknown, navn: string): KiTiltakFase | undefined {
  const fase = rensTekst(verdi);
  if (fase === undefined) return undefined;
  const treff = FASER.find((f) => f === fase);
  if (treff === undefined) throw new Error(`Ukjent fase på ${navn} i ki-tiltak.json: "${fase}"`);
  return treff;
}

/**
 * Fra filformatet, eller registerets form, til modellen sida bruker. Tåler
 * null overalt og tekst eller liste for virksomhet og orgnr. En ukjent fase
 * kaster fortsatt, fordi den ellers vises som tekst ingen har bestemt.
 */
export function normaliserTiltak(raa: RaaTiltak): KiTiltak {
  const navn = rensTekst(raa.navn) ?? '';
  const virksomheter = rensVirksomheter(raa.virksomhet, raa.orgnr).filter((v) => v.navn.length > 0);
  const valgfri = (liste: string[]) => (liste.length > 0 ? liste : undefined);
  const ut: KiTiltak = {
    id: rensTekst(raa.id) ?? '',
    navn,
    virksomheter: virksomheter.map((v) => v.navn),
    orgnr: virksomheter.map((v) => v.orgnr ?? ''),
    fagomrade: rensTekst(raa.fagomrade) ?? '',
    beskrivelse: rensTekst(raa.beskrivelse) ?? '',
    fase: toFase(raa.fase, navn),
    kiType: valgfri(rensListe(raa.kiType).map((v) => KI_TYPE_ALIAS[v] ?? v)),
    kiTypeAnnet: rensTekst(raa.kiTypeAnnet),
    leveranse: valgfri(rensListe(raa.leveranse)),
    leveranseAnnet: rensTekst(raa.leveranseAnnet),
    kontaktinfo: rensTekst(raa.kontaktinfo),
  };
  for (const k of Object.keys(ut) as (keyof KiTiltak)[]) if (ut[k] === undefined) delete ut[k];
  return ut;
}

/**
 * Slår opp ?tiltak=<id>. En gammel id fra id-tabellen gir tiltaket den nå
 * peker på, og sier fra at url-en bør skrives om.
 */
export function finnTiltak<T extends { id: string }>(
  id: string,
  tiltak: T[],
  alias: Record<string, string>,
): { tiltak: T; gammelId: boolean } | null {
  const direkte = tiltak.find((t) => t.id === id);
  if (direkte) return { tiltak: direkte, gammelId: false };
  const ny = alias[id];
  const viaAlias = ny === undefined ? undefined : tiltak.find((t) => t.id === ny);
  return viaAlias ? { tiltak: viaAlias, gammelId: true } : null;
}
