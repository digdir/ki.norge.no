import data from '../data/ki-tiltak.json';

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
  /** Kuratert visningsnavn, for eksempel "Entur AS" */
  virksomhet: string;
  orgnr: string;
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

/** Alfabetisk (nb). Alle 15 er i bruk i datasettet. */
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

function toFase(value: string | undefined, navn: string): KiTiltakFase | undefined {
  if (value === undefined || value === '') return undefined;
  const matches = FASER.find((f) => f === value);
  if (matches === undefined) throw new Error(`Ukjent fase på ${navn} i ki-tiltak.json: "${value}"`);
  return matches;
}

// Vite typer et JSON-import strukturelt, så fase kommer inn som string.
// Narrowingen gjøres i runtime her i stedet for med en type-assertion.
type RawTiltak = Omit<KiTiltak, 'fase'> & { fase?: string };
const rawData: RawTiltak[] = data;

/**
 * Sorteringen skjer her, ikke i JSON-filen.
 *
 * Tidligere måtte redaksjonen holde filen alfabetisk selv, og en test håndhevet
 * det. Da blokkerte CI enhver som ga et tiltak et nytt navn uten samtidig å
 * flytte posten. Det er en byrde uten gevinst når koden kan sortere selv.
 */
export const kiTiltak: KiTiltak[] = rawData
  .map((row) => ({ ...row, fase: toFase(row.fase, row.navn) }))
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
      tiltak.fase ?? '',
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
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
