import data from '../data/ki-tiltak.json';

/**
 * Feltet holder to generasjoner verdier med vilje.
 *
 * Skjemaet spør nå «Hvilken fase er tiltaket i?» og gir de tre FASER-verdiene.
 * De 28 eldre oppføringene i ki-tiltak.json beholder sine gamle verdier, siden
 * ingen visning lenger viser feltet og en omskriving derfor ikke gir noe.
 * toStatus kaster på ukjente verdier, så begge settene må stå her.
 */
export type KiTiltakStatus =
  | ''
  | 'Planlagt'
  | 'Pågående'
  | 'Avsluttet'
  | 'Innsikt og planlegging'
  | 'Gjennomføring'
  | 'I drift';

export interface KiTiltak {
  /** GUID fra kinorge.json */
  id: string;
  navn: string;
  /** Kuratert visningsnavn, for eksempel "Entur AS" */
  virksomhet: string;
  orgnr: string;
  /** Alltid nøyaktig ett fagområde per tiltak */
  fagomrade: string;
  beskrivelse: string;
  status: KiTiltakStatus;
  /**
   * Samles inn i skjemaet, men vises ikke ennå. Feltene er valgfrie fordi ingen
   * av de eksisterende oppføringene har dem, og redaksjonen fyller dem inn
   * etter hvert som nye tiltak kommer inn.
   */
  leveranse?: string[];
  leveranseAnnet?: string;
  kiType?: string[];
  kiTypeAnnet?: string;
}

/** Alfabetisk (nb). Alle 15 er i bruk i datasettet. */
export const FAGOMRADER = [
  'Arbeid',
  'Demokrati og styresett',
  'Digitale teknologier',
  'Familie og barn',
  'Forskning',
  'Helse og omsorg',
  'Informasjonssikkerhet',
  'Innbygger - granuleres/omdøpes',
  'Kultur, idrett og fritid',
  'Natur, klima og miljø',
  'Personvern',
  'Plan, bygg og eiendom',
  'Trafikk og transport',
  'Virksomhet',
  'Økonomi, finans og forsikring',
] as const;

/** Gamle statusverdier. Står bare i datasettet, ingen velger dem lenger. */
const ELDRE_STATUSER = ['Planlagt', 'Pågående', 'Avsluttet'] as const;

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

/** Alt feltet kan inneholde: tom, de gamle verdiene, og de nye fasene. */
export const ALLE_STATUSER = ['', ...ELDRE_STATUSER, ...FASER] as const;

const STATUS_VALUES: readonly KiTiltakStatus[] = ALLE_STATUSER;

function toStatus(value: string): KiTiltakStatus {
  const matches = STATUS_VALUES.find((s) => s === value);
  if (matches === undefined) throw new Error(`Ukjent status i ki-tiltak.json: "${value}"`);
  return matches;
}

// Vite typer et JSON-import strukturelt, så status kommer inn som string.
// Narrowingen gjøres i runtime her i stedet for med en type-assertion.
type RawTiltak = Omit<KiTiltak, 'status'> & { status: string };
const rawData: RawTiltak[] = data;

/**
 * Sorteringen skjer her, ikke i JSON-filen.
 *
 * Tidligere måtte redaksjonen holde filen alfabetisk selv, og en test håndhevet
 * det. Da blokkerte CI enhver som ga et tiltak et nytt navn uten samtidig å
 * flytte posten. Det er en byrde uten gevinst når koden kan sortere selv.
 */
export const kiTiltak: KiTiltak[] = rawData
  .map((row) => ({ ...row, status: toStatus(row.status) }))
  .sort((a, b) => a.navn.localeCompare(b.navn, 'nb', { sensitivity: 'base', numeric: true }));

export interface KiTiltakFilter {
  query: string;
  fagomrade: string[];
}

/**
 * Fritekstsøk kombinert med fasettfiltre. Grupper er ELLER internt og OG mot
 * hverandre. Tom gruppe betyr ingen begrensning fra den gruppen.
 */
export function filterTiltak(items: KiTiltak[], filter: KiTiltakFilter): KiTiltak[] {
  const q = filter.query.trim().toLowerCase();

  return items.filter((tiltak) => {
    if (filter.fagomrade.length > 0 && !filter.fagomrade.includes(tiltak.fagomrade)) return false;
    if (q.length === 0) return true;

    const haystack = [
      tiltak.navn,
      tiltak.virksomhet,
      tiltak.beskrivelse,
      tiltak.fagomrade,
      tiltak.status,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });
}
