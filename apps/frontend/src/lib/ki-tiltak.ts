import data from '../data/ki-tiltak.json';

export type KiTiltakStatus = '' | 'Planlagt' | 'Pågående' | 'Avsluttet';

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
  formaal: string;
  /** dd.mm.yyyy, kan være tom */
  oppstart: string;
  /** dd.mm.yyyy, kan være tom */
  slutt: string;
  status: KiTiltakStatus;
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

export const STATUSES = ['Planlagt', 'Pågående', 'Avsluttet'] as const;

const STATUS_VALUES: readonly KiTiltakStatus[] = ['', ...STATUSES];

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
  status: string[];
}

/**
 * Fritekstsøk kombinert med fasettfiltre. Grupper er ELLER internt og OG mot
 * hverandre. Tom gruppe betyr ingen begrensning fra den gruppen.
 */
export function filterTiltak(items: KiTiltak[], filter: KiTiltakFilter): KiTiltak[] {
  const q = filter.query.trim().toLowerCase();

  return items.filter((tiltak) => {
    if (filter.fagomrade.length > 0 && !filter.fagomrade.includes(tiltak.fagomrade)) return false;
    if (filter.status.length > 0 && !filter.status.includes(tiltak.status)) return false;
    if (q.length === 0) return true;

    const haystack = [
      tiltak.navn,
      tiltak.virksomhet,
      tiltak.beskrivelse,
      tiltak.formaal,
      tiltak.fagomrade,
      tiltak.status,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });
}
