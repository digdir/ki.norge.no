/**
 * Skjemamodellen for «Del KI-tiltak».
 *
 * Fri for React med vilje. validateTiltakForm.test.ts importerer herfra og
 * kjører i Vitest sitt node-miljø, der designsystemet-web ikke kan registrere
 * custom elements.
 */

export interface PartnerOrg {
  /**
   * Stabil nøkkel for React og for id-en feiloppsummeringen hopper til.
   * Hører til skjemaet, ikke til dataene som sendes inn.
   */
  id: string;
  navn: string;
  orgnr: string;
}

export interface TiltakForm {
  ansvarligNavn: string;
  ansvarligOrgnr: string;
  /** Null eller flere. Legges til med «Legg til virksomhet». */
  samarbeid: PartnerOrg[];
  navn: string;
  beskrivelse: string;
  fagomrade: string;
  kontaktinfo: string;
  oppstart: string;
  slutt: string;
  status: string;
}

/** Grensen designet setter på beskrivelsen. Gjelder bare nye innsendinger. */
export const DESCRIPTION_MAX = 800;

let rowCounter = 0;

/** Ny, tom samarbeidsrad med unik id. */
export function newPartnerRow(): PartnerOrg {
  rowCounter += 1;
  return { id: `rad-${rowCounter}`, navn: '', orgnr: '' };
}

/**
 * Funksjon og ikke konstant: samarbeid er en array, og en delt konstant ville
 * gitt alle skjemaer samme array-referanse.
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
    oppstart: '',
    slutt: '',
    status: '',
  };
}
