/**
 * Verdiene fra skjemaet og begrepslista. Egen modul uten JSON-import, så
 * scripts/klargjor-ki-tiltak.mjs kan lese dem rett med node.
 */

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
