/**
 * The form model for "Del KI-tiltak".
 *
 * Free of React on purpose. validateTiltakForm.test.ts imports from here and
 * runs in Vitest's node environment, where designsystemet-web cannot register
 * custom elements.
 */

export interface PartnerOrg {
  /**
   * Stable key for React and for the id the error summary jumps to.
   * Belongs to the form, not to the data that is submitted.
   */
  id: string;
  navn: string;
  orgnr: string;
}

export interface TiltakForm {
  ansvarligNavn: string;
  ansvarligOrgnr: string;
  /** Zero or more. Added with "Legg til virksomhet". */
  samarbeid: PartnerOrg[];
  navn: string;
  beskrivelse: string;
  fagomrade: string;
  kontaktinfo: string;
  /** "Hvilken fase er tiltaket i?" One choice from FASER. */
  fase: string;
  /** "Hva skal tiltaket levere?" One choice from LEVERANSER. */
  leveranse: string;
  /** Free text, required when leveranse is "Annet". */
  leveranseAnnet: string;
  /** "Hvilken type KI bruker dere i tiltaket?" Optional, multiple choices. */
  kiType: string[];
  /** Free text, optional even when kiType contains "Annet". */
  kiTypeAnnet: string;
}

/** The limit the design sets on the description. Only applies to new submissions. */
export const DESCRIPTION_MAX = 800;

let rowCounter = 0;

/** New, empty partner row with a unique id. */
export function newPartnerRow(): PartnerOrg {
  rowCounter += 1;
  return { id: `rad-${rowCounter}`, navn: '', orgnr: '' };
}

/**
 * A function and not a constant: samarbeid is an array, and a shared constant would
 * give all forms the same array reference.
 */
export function emptyForm(): TiltakForm {
  return {
    ansvarligNavn: '',
    ansvarligOrgnr: '',
    samarbeid: [],
    navn: '',
    beskrivelse: '',
    fagomrade: '',
    kontaktinfo: '',
    fase: '',
    leveranse: '',
    leveranseAnnet: '',
    kiType: [],
    kiTypeAnnet: '',
  };
}
