import { hasValidCheckDigit, hasOrgnrFormat } from './organisationNumber';
import type { TiltakForm } from './tiltakForm';

/**
 * Nøkkel for feltet en feil hører til. Samarbeidsradene er dynamiske, så de
 * identifiseres med rad-id-en sin.
 */
export type FieldKey =
  | 'ansvarligNavn'
  | 'ansvarligOrgnr'
  | 'navn'
  | 'beskrivelse'
  | 'fagomrade'
  | 'kontaktinfo'
  | 'status'
  | 'slutt'
  | `samarbeid:${string}:navn`
  | `samarbeid:${string}:orgnr`;

export interface ValidationError {
  field: FieldKey;
  message: string;
}

/**
 * Feilmeldingene samlet på ett sted. Teksten er avklart med design, så
 * endringer her er en tekstendring i grensesnittet og ikke en detalj.
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
  status: 'Velg status for tiltaket',
  slutt: 'Sluttdato kan ikke være før oppstartsdato',
} as const;

/**
 * Krever krøllalfa med tekst på hver side, og ingen mellomrom. Ikke mer.
 *
 * Feilmeldingen sier «må inneholde @», så valideringen skal ikke avvise noe
 * den ikke advarer om. Strengere mønstre avviser dessuten gyldige adresser og
 * skaper flere problemer enn de løser.
 */
const EMAIL = /^[^\s@]+@[^\s@]+$/;

function orgnrError(value: string): string | undefined {
  if (value.length === 0) return ERROR_MESSAGE.orgnrEmpty;
  if (!hasOrgnrFormat(value)) return ERROR_MESSAGE.orgnrFormat;
  if (!hasValidCheckDigit(value)) return ERROR_MESSAGE.orgnrInvalid;
  return undefined;
}

/**
 * Returnerer feilene i samme rekkefølge som feltene står i skjemaet. Den
 * rekkefølgen styrer feiloppsummeringen, så den hører hjemme her og ikke i
 * komponenten.
 *
 * Kjøres ved innsending, ikke ved blur, så skjemaet ikke kjefter underveis.
 */
export function validateTiltakForm(form: TiltakForm): ValidationError[] {
  const errors: ValidationError[] = [];
  const add = (field: FieldKey, message: string | undefined) => {
    if (message !== undefined) errors.push({ field, message });
  };

  if (form.ansvarligNavn.trim().length === 0) {
    add('ansvarligNavn', ERROR_MESSAGE.ansvarligNavn);
  }
  add('ansvarligOrgnr', orgnrError(form.ansvarligOrgnr.trim()));

  for (const row of form.samarbeid) {
    const rowName = row.navn.trim();
    const rowOrgnr = row.orgnr.trim();
    // En rad brukeren la til og aldri fylte ut skal ikke stoppe innsendingen.
    if (rowName.length === 0 && rowOrgnr.length === 0) continue;

    if (rowName.length === 0) {
      add(`samarbeid:${row.id}:navn`, ERROR_MESSAGE.samarbeidNavn);
    }
    add(`samarbeid:${row.id}:orgnr`, orgnrError(rowOrgnr));
  }

  if (form.navn.trim().length === 0) add('navn', ERROR_MESSAGE.navn);
  if (form.beskrivelse.trim().length === 0) add('beskrivelse', ERROR_MESSAGE.beskrivelse);
  if (form.fagomrade.length === 0) add('fagomrade', ERROR_MESSAGE.fagomrade);

  const kontaktinfo = form.kontaktinfo.trim();
  if (kontaktinfo.length === 0) {
    add('kontaktinfo', ERROR_MESSAGE.kontaktinfoEmpty);
  } else if (!EMAIL.test(kontaktinfo)) {
    add('kontaktinfo', ERROR_MESSAGE.kontaktinfoFormat);
  }

  if (form.status.length === 0) add('status', ERROR_MESSAGE.status);

  // Datoene kommer fra input[type=date], altså ISO yyyy-mm-dd, som sorterer
  // korrekt som streng. Ingen Date-parsing nødvendig.
  if (form.oppstart.length > 0 && form.slutt.length > 0 && form.slutt < form.oppstart) {
    add('slutt', ERROR_MESSAGE.slutt);
  }

  return errors;
}

/** Slår opp feilmeldingen for ett felt. Tom liste betyr gyldig skjema. */
export function errorFor(errors: readonly ValidationError[], field: FieldKey): string | undefined {
  return errors.find((item) => item.field === field)?.message;
}
