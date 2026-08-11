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

function parsePartners(value: unknown): PartnerOrg[] {
  if (!Array.isArray(value)) return [];
  const rows: PartnerOrg[] = [];
  for (const row of value) {
    if (!isObject(row)) continue;
    rows.push({
      id: readString(row, 'id'),
      navn: readString(row, 'navn'),
      orgnr: readString(row, 'orgnr'),
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
    ansvarligNavn: readString(body, 'ansvarligNavn'),
    ansvarligOrgnr: readString(body, 'ansvarligOrgnr'),
    samarbeid: parsePartners(body.samarbeid),
    navn: readString(body, 'navn'),
    beskrivelse: readString(body, 'beskrivelse'),
    fagomrade: readString(body, 'fagomrade'),
    kontaktinfo: readString(body, 'kontaktinfo'),
    oppstart: readString(body, 'oppstart'),
    slutt: readString(body, 'slutt'),
    status: readString(body, 'status'),
  };
}

/**
 * Datoene kommer fra input[type=date], altså ISO yyyy-mm-dd. Datasettet i
 * ki-tiltak.json bruker dd.mm.yyyy, så e-posten viser den formen redaktøren
 * skal lime inn.
 */
function toNorwegianDate(iso: string): string {
  const matches = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (matches === null) return iso;
  const [, year, month, day] = matches;
  return `${day}.${month}.${year}`;
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
    line('Status', form.status),
    line('Oppstartsdato', toNorwegianDate(form.oppstart)),
    line('Sluttdato', toNorwegianDate(form.slutt)),
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
