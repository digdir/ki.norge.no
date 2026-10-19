/**
 * The values from the form and the term list. A separate module without JSON imports, so
 * scripts/klargjor-ki-tiltak.mjs can read them directly with node.
 */

/** Alphabetical (nb). All 15 are in use in the dataset. */
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

/** "Hvilken fase er tiltaket i?" Single choice. */
export const FASER = ['Innsikt og planlegging', 'Gjennomføring', 'I drift'] as const;

/** "Hva skal tiltaket levere?" Multiple choice. */
export const LEVERANSER = ['PoC', 'MVP', 'Pilot', 'Løsning i produksjon', 'Annet'] as const;

/** "Hvilken type KI bruker dere i tiltaket?" Multiple choice, optional. */
export const KI_TYPER = [
  'Generativ KI',
  'Prediktiv KI',
  'Agentisk KI',
  'Språkteknologi',
  'Computer Vision',
  'Anbefalingssystemer',
  'Annet',
] as const;

/** The value that triggers the free-text field "Beskriv nærmere". */
export const ANNET = 'Annet';
