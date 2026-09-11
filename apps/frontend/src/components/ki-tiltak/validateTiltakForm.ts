import { ANNET, FAGOMRADER, FASER } from '../../lib/ki-tiltak';
import { hasValidCheckDigit, hasOrgnrFormat } from './organisationNumber';
import { DESCRIPTION_MAX, type TiltakForm } from './tiltakForm';

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
  | 'leveranse'
  | 'leveranseAnnet'
  | 'kiTypeAnnet'
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
  status: 'Velg fase for tiltaket',
  leveranse: 'Velg hva tiltaket skal levere',
  leveranseAnnet: 'Skriv hva du mener med «Annet»',
  forLangt: 'Teksten er for lang',
} as const;

/**
 * Maksimallengder.
 *
 * Nettleseren begrenser allerede beskrivelsen, og de andre feltene er korte i
 * praksis. Grensene her finnes derfor for POST-er som går rett på ruta og
 * hopper over skjemaet: uten dem kan innsendt tekst av vilkårlig lengde havne
 * i e-posten til redaksjonen. Ingen ekte bruker treffer dem.
 */
const MAX_LENGTH = {
  kort: 200,
  beskrivelse: DESCRIPTION_MAX,
} as const;

/**
 * Sant når verdien står i listen.
 *
 * Skjemaet tilbyr bare gyldige valg, så dette rammer bare direkte POST-er.
 * Ugyldig verdi behandles som «ikke valgt», slik at brukeren får den samme,
 * avklarte feilmeldingen i stedet for en ny tekst ingen har godkjent.
 */
function inList(value: string, list: readonly string[]): boolean {
  return list.includes(value);
}

/** Feil bare når feltet er lengre enn grensen. Tomt håndteres av egne regler. */
function tooLong(value: string, max: number): string | undefined {
  return value.trim().length > max ? ERROR_MESSAGE.forLangt : undefined;
}

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
  } else {
    add('ansvarligNavn', tooLong(form.ansvarligNavn, MAX_LENGTH.kort));
  }
  add('ansvarligOrgnr', orgnrError(form.ansvarligOrgnr.trim()));

  for (const row of form.samarbeid) {
    const rowName = row.navn.trim();
    const rowOrgnr = row.orgnr.trim();
    // En rad brukeren la til og aldri fylte ut skal ikke stoppe innsendingen.
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

  const kontaktinfo = form.kontaktinfo.trim();
  if (kontaktinfo.length === 0) {
    add('kontaktinfo', ERROR_MESSAGE.kontaktinfoEmpty);
  } else if (!EMAIL.test(kontaktinfo)) {
    add('kontaktinfo', ERROR_MESSAGE.kontaktinfoFormat);
  } else {
    add('kontaktinfo', tooLong(kontaktinfo, MAX_LENGTH.kort));
  }

  if (!inList(form.status, FASER)) add('status', ERROR_MESSAGE.status);

  if (form.leveranse.length === 0) {
    add('leveranse', ERROR_MESSAGE.leveranse);
  } else if (form.leveranse.includes(ANNET) && form.leveranseAnnet.trim().length === 0) {
    add('leveranseAnnet', ERROR_MESSAGE.leveranseAnnet);
  } else {
    add('leveranseAnnet', tooLong(form.leveranseAnnet, MAX_LENGTH.kort));
  }

  add('kiTypeAnnet', tooLong(form.kiTypeAnnet, MAX_LENGTH.kort));

  // kiType er valgfritt, og har derfor ingen regel i det hele tatt. Det gjelder
  // også fritekstfeltet: krysser noen av «Annet» uten å skrive noe, slipper
  // innsendingen gjennom. Avklart med Dorte 08.09.

  return errors;
}

/** Slår opp feilmeldingen for ett felt. Tom liste betyr gyldig skjema. */
export function errorFor(errors: readonly ValidationError[], field: FieldKey): string | undefined {
  return errors.find((item) => item.field === field)?.message;
}
