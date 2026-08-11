import { describe, expect, test } from 'vitest';
import { newPartnerRow, emptyForm, type TiltakForm } from '../components/ki-tiltak/tiltakForm';
import { buildEmail, parseTiltakForm } from './ki-tiltak-email';

function form(overstyr: Partial<TiltakForm> = {}): TiltakForm {
  return {
    ...emptyForm(),
    ansvarligNavn: 'Digitaliseringsdirektoratet',
    ansvarligOrgnr: '991825827',
    navn: 'KI-assistent for klarspråk i vedtak',
    beskrivelse: 'Vi tester en KI-assistent som foreslår enklere formuleringer.',
    fagomrade: 'Digitale teknologier',
    kontaktinfo: 'postmottak@digdir.no',
    status: 'Pågående',
    ...overstyr,
  };
}

describe('parseTiltakForm', () => {
  test('avviser kropper som ikke er objekter', () => {
    for (const body of [null, 'tekst', 42, [], undefined]) {
      expect(parseTiltakForm(body)).toBeNull();
    }
  });

  test('leser ut feltene fra et gyldig objekt', () => {
    const result = parseTiltakForm({
      ansvarligNavn: 'Entur AS',
      ansvarligOrgnr: '917422575',
      navn: 'Et tiltak',
      beskrivelse: 'En beskrivelse',
      fagomrade: 'Trafikk og transport',
      kontaktinfo: 'post@entur.no',
      status: 'Planlagt',
      oppstart: '2026-01-15',
      slutt: '',
      samarbeid: [{ id: 'rad-1', navn: 'KS', orgnr: '971032146' }],
    });
    expect(result?.ansvarligNavn).toBe('Entur AS');
    expect(result?.samarbeid).toEqual([{ id: 'rad-1', navn: 'KS', orgnr: '971032146' }]);
    expect(result?.oppstart).toBe('2026-01-15');
  });

  test('felt med feil type blir tom streng i stedet for å velte', () => {
    const result = parseTiltakForm({ navn: 42, beskrivelse: null, kontaktinfo: {} });
    expect(result?.navn).toBe('');
    expect(result?.beskrivelse).toBe('');
    expect(result?.kontaktinfo).toBe('');
  });

  test('ukjente felt tas ikke med', () => {
    const result = parseTiltakForm({ navn: 'Et tiltak', erAdmin: true, rolle: 'redaktor' });
    expect(result).not.toBeNull();
    expect(Object.keys(result ?? {})).toEqual(Object.keys(emptyForm()));
  });

  test('samarbeid som ikke er en liste gir tom liste', () => {
    expect(parseTiltakForm({ samarbeid: 'nei' })?.samarbeid).toEqual([]);
    expect(parseTiltakForm({ samarbeid: [1, 'to', null] })?.samarbeid).toEqual([]);
  });
});

describe('lagEpost', () => {
  test('emnet inneholder tiltaket og virksomheten', () => {
    expect(buildEmail(form()).subject).toBe(
      'KI-tiltak: KI-assistent for klarspråk i vedtak (Digitaliseringsdirektoratet)',
    );
  });

  test('teksten inneholder alle utfylte felt', () => {
    const { text } = buildEmail(form({ oppstart: '2026-01-15', slutt: '2026-12-31' }));
    expect(text).toContain('KI-assistent for klarspråk i vedtak');
    expect(text).toContain('Digitaliseringsdirektoratet');
    expect(text).toContain('991825827');
    expect(text).toContain('Digitale teknologier');
    expect(text).toContain('postmottak@digdir.no');
    expect(text).toContain('Pågående');
  });

  test('datoer skrives på norsk form, slik de skal inn i datasettet', () => {
    const { text } = buildEmail(form({ oppstart: '2026-01-15', slutt: '2026-12-31' }));
    expect(text).toContain('Oppstartsdato: 15.01.2026');
    expect(text).toContain('Sluttdato: 31.12.2026');
  });

  test('tomme valgfrie felt merkes tydelig', () => {
    const { text } = buildEmail(form());
    expect(text).toContain('Oppstartsdato: (ikke oppgitt)');
    expect(text).toContain('SAMARBEIDSVIRKSOMHETER\n  (ingen oppgitt)');
  });

  test('samarbeidsvirksomheter listes med navn og organisasjonsnummer', () => {
    const row = { ...newPartnerRow(), navn: 'KS', orgnr: '971032146' };
    const { text } = buildEmail(form({ samarbeid: [row] }));
    expect(text).toContain('1. KS (971032146)');
  });

  test('innholdet er ren tekst, uten markup fra innsendingen', () => {
    const { text, subject } = buildEmail(
      form({ navn: '<script>alert(1)</script>', beskrivelse: '<b>hei</b>' }),
    );
    // Teksten sendes som contentType Text, så taggene forblir tegn og blir
    // aldri markup. Vi verken escaper eller fjerner dem.
    expect(subject).toContain('<script>alert(1)</script>');
    expect(text).toContain('<b>hei</b>');
  });
});
