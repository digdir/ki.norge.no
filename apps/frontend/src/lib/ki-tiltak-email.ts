import { ANNET, KI_TYPER, LEVERANSER } from './ki-tiltak';
import {
  CONSENT_TEXT,
  emptyForm,
  type PartnerOrg,
  type TiltakForm,
} from '../components/ki-tiltak/tiltakForm';

/**
 * Builds the email the editors receive when someone submits a KI-tiltak, and parses
 * what comes in over HTTP.
 *
 * Kept free of React and network calls, so the content can be tested without
 * going through the API route.
 */

/** True for plain objects, that is not null and not an array. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads a string field. Missing or wrong type gives an empty string, not an error. */
function readString(kilde: Record<string, unknown>, navn: string): string {
  const value = kilde[navn];
  return typeof value === 'string' ? value : '';
}

/**
 * Reads a field with several checked values.
 *
 * Only values in the option list get through. The form cannot
 * produce anything else, so the filter applies to POSTs that go straight to the route and
 * could otherwise put arbitrary text into the email to the editors. Unknown
 * values disappear silently, since kiType is optional.
 *
 * The result follows the order of the option list, not of the submission, so
 * that the email always lists the choices the same way.
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

/**
 * Reads a single-choice field. An unknown value gives an empty string, which validation
 * catches.
 *
 * The form used to send a list for leveranse. A page sitting in the
 * browser's cache may still do so for a while, and then the first
 * valid value is used instead of rejecting the submission.
 */
function readChoice(kilde: Record<string, unknown>, navn: string, tillatte: readonly string[]): string {
  const value = kilde[navn];
  const kandidater = Array.isArray(value) ? value : [value];
  return kandidater.find((v): v is string => typeof v === 'string' && tillatte.includes(v)) ?? '';
}

/** Control characters, line breaks included. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/**
 * Reads a field that is a single line in the form.
 *
 * <input type="text"> cannot contain line breaks, so a line break here can
 * only come from a POST straight to the route. The fields end up in the subject and in
 * the body for the editors, where the email has its own headings
 * ("TILTAKET", "KONTAKT"). Without this, submitted text could forge them, and
 * the editor could not see what the sender actually wrote. Replaced with spaces
 * so words don't run together.
 *
 * beskrivelse deliberately does not go through this: it is a textarea and should have
 * line breaks.
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
 * Parses the body of the submission. The client cannot be trusted, so everything
 * is narrowed with type guards and unknown fields are ignored. Returns null only when
 * the body is not an object at all. The content validation itself is done by
 * validateTiltakForm, which runs both here and in the browser.
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
    fase: readLine(body, 'fase'),
    leveranse: readChoice(body, 'leveranse', LEVERANSER),
    leveranseAnnet: readLine(body, 'leveranseAnnet'),
    kiType: readStringArray(body, 'kiType', KI_TYPER),
    kiTypeAnnet: readLine(body, 'kiTypeAnnet'),
    // Only a real true counts. "true", 1 and a missing field are not consent.
    consent: body.consent === true,
  };
}

/**
 * Checked choices on one line. If "Annet" is checked, the free text is put in
 * parentheses after it, so the editor doesn't have to look for it in a separate row.
 */
function valgt(valgte: string[], annet: string): string {
  const tekst = annet.trim();
  return valgte
    .map((v) => (v === ANNET && tekst.length > 0 ? `${v} (${tekst})` : v))
    .join(', ');
}

/** "20.10.2026 kl. 14.03" in Norwegian time, whatever time zone the server runs in. */
function osloTime(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('nb-NO', {
      timeZone: 'Europe/Oslo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day}.${parts.month}.${parts.year} kl. ${parts.hour}.${parts.minute}`;
}

/**
 * The proof of consent: when it was given and the exact text. It lives in this
 * email and nowhere else, so the editors keep the email for as long as the address
 * is published.
 */
function consentBlock(form: TiltakForm, now: Date): string[] {
  if (!form.consent) return ['Innsenderen har ikke krysset av for samtykke.'];
  return [
    `Innsenderen krysset av for dette ${osloTime(now)}:`,
    `«${CONSENT_TEXT}»`,
    '',
    'Ta vare på denne e-posten så lenge e-postadressen vises på ki.norge.no. Den viser at samtykket er gitt.',
    'Trekker innsenderen samtykket, fjern kontaktinfo fra tiltaket i ki-tiltak.json og slett denne e-posten.',
  ];
}

function line(label: string, value: string): string {
  return `${label}: ${value.trim().length > 0 ? value.trim() : '(ikke oppgitt)'}`;
}

/**
 * The main organisation first, then the partner rows, as in #806. Without
 * partners it becomes text, as in the rest of ki-tiltak.json. With partners
 * both become lists in the same order, and a row without orgnr gets empty text in
 * its place, so name and number don't drift apart.
 */
function virksomheter(form: TiltakForm): { virksomhet: string | string[]; orgnr: string | string[] } {
  const rader = form.samarbeid
    .map((row) => ({ navn: row.navn.trim(), orgnr: row.orgnr.trim() }))
    .filter((row) => row.navn || row.orgnr);
  if (rader.length === 0) return { virksomhet: form.ansvarligNavn.trim(), orgnr: form.ansvarligOrgnr.trim() };
  return {
    virksomhet: [form.ansvarligNavn.trim(), ...rader.map((row) => row.navn)],
    orgnr: [form.ansvarligOrgnr.trim(), ...rader.map((row) => row.orgnr)],
  };
}

export interface Email {
  subject: string;
  text: string;
}

/**
 * Plain text, not HTML. Then there is no path from submitted text to markup
 * in the email client, and we don't have to escape anything at all.
 */
/**
 * The entry as it should appear in ki-tiltak.json, ready to be pasted right
 * after "[" at the top of the file. Then the transcription is a copy, and id, field names and
 * values cannot be mistyped. Comma at the end, since the other tiltak
 * follow. The organisation name is what the submitter wrote, and may need cleaning.
 */
export function tiltakJson(form: TiltakForm, id: string): string {
  const post: Record<string, unknown> = {
    id,
    navn: form.navn.trim(),
    ...virksomheter(form),
    fagomrade: form.fagomrade.trim(),
    beskrivelse: form.beskrivelse.trim(),
  };
  if (form.fase.trim()) post.fase = form.fase.trim();
  // The model has leveranse as a list, since older tiltak can have several.
  if (form.leveranse) post.leveranse = [form.leveranse];
  if (form.leveranse === ANNET && form.leveranseAnnet.trim()) post.leveranseAnnet = form.leveranseAnnet.trim();
  if (form.kiType.length > 0) post.kiType = form.kiType;
  if (form.kiType.includes(ANNET) && form.kiTypeAnnet.trim()) post.kiTypeAnnet = form.kiTypeAnnet.trim();
  if (form.kontaktinfo.trim()) post.kontaktinfo = form.kontaktinfo.trim();
  return `${JSON.stringify(post, null, 2).replace(/^/gm, '  ')},`;
}

export function buildEmail(
  form: TiltakForm,
  nyId: () => string = () => crypto.randomUUID(),
  now: Date = new Date(),
): Email {
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
    line('Fase', form.fase),
    line('Skal levere', valgt(form.leveranse ? [form.leveranse] : [], form.leveranseAnnet)),
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
    'SAMTYKKE',
    ...consentBlock(form, now),
    '',
    'TIL KI-TILTAK.JSON',
    'Lim inn rett etter [ på første linje i apps/frontend/src/data/ki-tiltak.json:',
    '',
    tiltakJson(form, nyId()),
    '',
    'Svar på denne e-posten for å nå innsenderen direkte.',
  ].join('\n');

  return {
    subject: `KI-tiltak: ${navn}${virksomhet.length > 0 ? ` (${virksomhet})` : ''}`,
    text,
  };
}
