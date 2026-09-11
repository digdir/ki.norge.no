import { ANNET, KI_TYPER, LEVERANSER } from './ki-tiltak';
import {
  emptyForm,
  type PartnerOrg,
  type TiltakForm,
} from '../components/ki-tiltak/tiltakForm';

/**
 * Bygger e-posten redaksjonen får når noen sender inn et KI-tiltak, og tolker
 * det som kommer inn over HTTP.
 *
 * Holdt fri for React og for nettverkskall, slik at innholdet kan testes uten
 * å gå veien om API-ruta.
 */

/** Sant for vanlige objekter, altså ikke null og ikke array. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Leser et strengfelt. Manglende eller feil type gir tom streng, ikke feil. */
function readString(kilde: Record<string, unknown>, navn: string): string {
  const value = kilde[navn];
  return typeof value === 'string' ? value : '';
}

/**
 * Leser et felt med flere avkryssede verdier.
 *
 * Bare verdier som står i alternativlisten slipper gjennom. Skjemaet kan ikke
 * produsere noe annet, så filteret gjelder POST-er som går rett på ruta og
 * ellers kunne lagt vilkårlig tekst inn i e-posten til redaksjonen. Ukjente
 * verdier forsvinner i stillhet: en tom leveranse fanges av valideringen,
 * og kiType er valgfritt.
 *
 * Resultatet følger rekkefølgen i alternativlisten, ikke i innsendingen, slik
 * at e-posten alltid lister valgene likt.
 */
function readStringArray(
  kilde: Record<string, unknown>,
  navn: string,
  tillatte: readonly string[],
): string[] {
  const value = kilde[navn];
  if (!Array.isArray(value)) return [];
  return tillatte.filter((option) => value.includes(option));
}

/** Kontrolltegn, linjeskift inkludert. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/**
 * Leser et felt som er én linje i skjemaet.
 *
 * <input type="text"> kan ikke inneholde linjeskift, så et linjeskift her kan
 * bare komme fra en POST rett mot ruta. Feltene havner i emnefeltet og i
 * brødteksten til redaksjonen, der e-posten har sine egne overskrifter
 * («TILTAKET», «KONTAKT»). Uten dette kan innsendt tekst forfalske dem, og
 * redaktøren kan ikke se hva avsenderen faktisk skrev. Erstattes med mellomrom
 * så ord ikke smelter sammen.
 *
 * beskrivelse går bevisst ikke gjennom denne: den er et textarea og skal ha
 * linjeskift.
 */
function readLine(kilde: Record<string, unknown>, navn: string): string {
  return readString(kilde, navn).replace(CONTROL_CHARS, ' ');
}

function parsePartners(value: unknown): PartnerOrg[] {
  if (!Array.isArray(value)) return [];
  const rows: PartnerOrg[] = [];
  for (const row of value) {
    if (!isObject(row)) continue;
    rows.push({
      id: readLine(row, 'id'),
      navn: readLine(row, 'navn'),
      orgnr: readLine(row, 'orgnr'),
    });
  }
  return rows;
}

/**
 * Tolker kroppen i innsendingen. Klienten er ikke til å stole på, så alt
 * narrows med typevakter og ukjente felt ignoreres. Returnerer null bare når
 * kroppen ikke er et objekt i det hele tatt. Selve innholdsvalideringen gjør
 * validateTiltakForm, som kjører både her og i nettleseren.
 */
export function parseTiltakForm(body: unknown): TiltakForm | null {
  if (!isObject(body)) return null;
  return {
    ...emptyForm(),
    ansvarligNavn: readLine(body, 'ansvarligNavn'),
    ansvarligOrgnr: readLine(body, 'ansvarligOrgnr'),
    samarbeid: parsePartners(body.samarbeid),
    navn: readLine(body, 'navn'),
    beskrivelse: readString(body, 'beskrivelse'),
    fagomrade: readLine(body, 'fagomrade'),
    kontaktinfo: readLine(body, 'kontaktinfo'),
    status: readLine(body, 'status'),
    leveranse: readStringArray(body, 'leveranse', LEVERANSER),
    leveranseAnnet: readLine(body, 'leveranseAnnet'),
    kiType: readStringArray(body, 'kiType', KI_TYPER),
    kiTypeAnnet: readLine(body, 'kiTypeAnnet'),
  };
}

/**
 * Avkryssede valg på én linje. Er «Annet» krysset av, settes fritekstet inn i
 * parentes etter det, slik at redaktøren slipper å lete etter det i en egen rad.
 */
function valgt(valgte: string[], annet: string): string {
  const tekst = annet.trim();
  return valgte
    .map((v) => (v === ANNET && tekst.length > 0 ? `${v} (${tekst})` : v))
    .join(', ');
}

function line(label: string, value: string): string {
  return `${label}: ${value.trim().length > 0 ? value.trim() : '(ikke oppgitt)'}`;
}

export interface Email {
  subject: string;
  text: string;
}

/**
 * Ren tekst, ikke HTML. Da finnes det ingen vei fra innsendt tekst til markup
 * i e-postklienten, og vi slipper å escape noe som helst.
 */
export function buildEmail(form: TiltakForm): Email {
  const navn = form.navn.trim();
  const virksomhet = form.ansvarligNavn.trim();

  const samarbeid =
    form.samarbeid.length > 0
      ? form.samarbeid
          .map((row, i) => `  ${i + 1}. ${row.navn.trim()} (${row.orgnr.trim()})`)
          .join('\n')
      : '  (ingen oppgitt)';

  const text = [
    'Nytt KI-tiltak er sendt inn fra ki.norge.no.',
    '',
    'TILTAKET',
    line('Navn', navn),
    line('Tema', form.fagomrade),
    line('Fase', form.status),
    line('Skal levere', valgt(form.leveranse, form.leveranseAnnet)),
    line('Type KI', valgt(form.kiType, form.kiTypeAnnet)),
    '',
    'BESKRIVELSE',
    form.beskrivelse.trim(),
    '',
    'ANSVARLIG VIRKSOMHET',
    line('Navn', virksomhet),
    line('Organisasjonsnummer', form.ansvarligOrgnr),
    '',
    'SAMARBEIDSVIRKSOMHETER',
    samarbeid,
    '',
    'KONTAKT',
    line('E-post', form.kontaktinfo),
    '',
    'Svar på denne e-posten for å nå innsenderen direkte.',
  ].join('\n');

  return {
    subject: `KI-tiltak: ${navn}${virksomhet.length > 0 ? ` (${virksomhet})` : ''}`,
    text,
  };
}
