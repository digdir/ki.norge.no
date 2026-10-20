import { ANNET, FAGOMRADER, FASER, LEVERANSER } from '../../lib/ki-tiltak';
import { hasValidCheckDigit, hasOrgnrFormat } from './organisationNumber';
import { DESCRIPTION_MAX, type TiltakForm } from './tiltakForm';

/**
 * Key for the field an error belongs to. The partner rows are dynamic, so they
 * are identified by their row id.
 */
export type FieldKey =
  | 'ansvarligNavn'
  | 'ansvarligOrgnr'
  | 'navn'
  | 'beskrivelse'
  | 'fagomrade'
  | 'kontaktinfo'
  | 'fase'
  | 'leveranse'
  | 'leveranseAnnet'
  | 'kiTypeAnnet'
  | 'consent'
  | `samarbeid:${string}:navn`
  | `samarbeid:${string}:orgnr`;

export interface ValidationError {
  field: FieldKey;
  message: string;
}

/**
 * The error messages gathered in one place. The text is agreed with design, so
 * changes here are a text change in the UI and not a detail.
 */
export const ERROR_MESSAGE = {
  ansvarligNavn: 'Fyll inn ansvarlig virksomhet',
  orgnrEmpty: 'Fyll inn organisasjonsnummer',
  orgnrFormat: 'Organisasjonsnummer må ha 9 siffer',
  orgnrInvalid: 'Organisasjonsnummeret er ikke gyldig, sjekk at du har skrevet riktige tall',
  samarbeidNavn: 'Fyll inn navn på samarbeidsvirksomheten',
  navn: 'Fyll inn tiltakets navn',
  beskrivelse: 'Fyll inn beskrivelse av tiltaket',
  fagomrade: 'Velg tema for tiltaket',
  kontaktinfoEmpty: 'Legg til kontaktinfo',
  kontaktinfoFormat: 'Sjekk e-postadressen, den må inneholde @',
  fase: 'Velg fase for tiltaket',
  leveranse: 'Velg hva tiltaket skal levere',
  leveranseAnnet: 'Skriv hva du mener med «Annet»',
  consent: 'Kryss av for at du samtykker',
  forLangt: 'Teksten er for lang',
} as const;

/**
 * Maximum lengths.
 *
 * The browser already limits the description, and the other fields are short in
 * practice. The limits here therefore exist for POSTs that go straight to the route and
 * skip the form: without them, submitted text of arbitrary length could end up
 * in the editors' email. No real user hits them.
 */
const MAX_LENGTH = {
  kort: 200,
  beskrivelse: DESCRIPTION_MAX,
} as const;

/**
 * True when the value is in the list.
 *
 * The form only offers valid choices, so this only affects direct POSTs.
 * An invalid value is treated as "not selected", so the user gets the same,
 * agreed error message instead of a new text nobody has approved.
 */
function inList(value: string, list: readonly string[]): boolean {
  return list.includes(value);
}

/** Error only when the field is longer than the limit. Empty is handled by separate rules. */
function tooLong(value: string, max: number): string | undefined {
  return value.trim().length > max ? ERROR_MESSAGE.forLangt : undefined;
}

/**
 * Requires an at sign with text on each side, and no spaces. Nothing more.
 *
 * The error message says "må inneholde @", so the validation must not reject anything
 * it does not warn about. Stricter patterns also reject valid addresses and
 * create more problems than they solve.
 */
const EMAIL = /^[^\s@]+@[^\s@]+$/;

function orgnrError(value: string): string | undefined {
  if (value.length === 0) return ERROR_MESSAGE.orgnrEmpty;
  if (!hasOrgnrFormat(value)) return ERROR_MESSAGE.orgnrFormat;
  if (!hasValidCheckDigit(value)) return ERROR_MESSAGE.orgnrInvalid;
  return undefined;
}

/**
 * Returns the errors in the same order as the fields appear in the form. That
 * order drives the error summary, so it belongs here and not in
 * the component.
 *
 * Runs on submit, not on blur, so the form does not nag along the way.
 */
export function validateTiltakForm(form: TiltakForm): ValidationError[] {
  const errors: ValidationError[] = [];
  const add = (field: FieldKey, message: string | undefined) => {
    if (message !== undefined) errors.push({ field, message });
  };

  if (form.ansvarligNavn.trim().length === 0) {
    add('ansvarligNavn', ERROR_MESSAGE.ansvarligNavn);
  } else {
    add('ansvarligNavn', tooLong(form.ansvarligNavn, MAX_LENGTH.kort));
  }
  add('ansvarligOrgnr', orgnrError(form.ansvarligOrgnr.trim()));

  for (const row of form.samarbeid) {
    const rowName = row.navn.trim();
    const rowOrgnr = row.orgnr.trim();
    // A row the user added and never filled in must not stop the submission.
    if (rowName.length === 0 && rowOrgnr.length === 0) continue;

    if (rowName.length === 0) {
      add(`samarbeid:${row.id}:navn`, ERROR_MESSAGE.samarbeidNavn);
    } else {
      add(`samarbeid:${row.id}:navn`, tooLong(rowName, MAX_LENGTH.kort));
    }
    add(`samarbeid:${row.id}:orgnr`, orgnrError(rowOrgnr));
  }

  if (form.navn.trim().length === 0) add('navn', ERROR_MESSAGE.navn);
  else add('navn', tooLong(form.navn, MAX_LENGTH.kort));

  if (form.beskrivelse.trim().length === 0) add('beskrivelse', ERROR_MESSAGE.beskrivelse);
  else add('beskrivelse', tooLong(form.beskrivelse, MAX_LENGTH.beskrivelse));

  if (!inList(form.fagomrade, FAGOMRADER)) add('fagomrade', ERROR_MESSAGE.fagomrade);

  if (!inList(form.fase, FASER)) add('fase', ERROR_MESSAGE.fase);

  if (!inList(form.leveranse, LEVERANSER)) {
    add('leveranse', ERROR_MESSAGE.leveranse);
  } else if (form.leveranse === ANNET && form.leveranseAnnet.trim().length === 0) {
    add('leveranseAnnet', ERROR_MESSAGE.leveranseAnnet);
  } else {
    add('leveranseAnnet', tooLong(form.leveranseAnnet, MAX_LENGTH.kort));
  }

  add('kiTypeAnnet', tooLong(form.kiTypeAnnet, MAX_LENGTH.kort));

  const kontaktinfo = form.kontaktinfo.trim();
  if (kontaktinfo.length === 0) {
    add('kontaktinfo', ERROR_MESSAGE.kontaktinfoEmpty);
  } else if (!EMAIL.test(kontaktinfo)) {
    add('kontaktinfo', ERROR_MESSAGE.kontaktinfoFormat);
  } else {
    add('kontaktinfo', tooLong(kontaktinfo, MAX_LENGTH.kort));
  }

  if (!form.consent) add('consent', ERROR_MESSAGE.consent);

  // kiType is optional, and therefore has no rule at all. That also applies
  // to the free text field: if someone ticks "Annet" without writing anything, the
  // submission goes through. Agreed with Dorte 08.09.

  return errors;
}

/** Looks up the error message for one field. An empty list means a valid form. */
export function errorFor(errors: readonly ValidationError[], field: FieldKey): string | undefined {
  return errors.find((item) => item.field === field)?.message;
}
