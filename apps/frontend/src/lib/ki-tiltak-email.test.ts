import { describe, expect, test } from 'vitest';
import { CONSENT_TEXT, newPartnerRow, emptyForm, type TiltakForm } from '../components/ki-tiltak/tiltakForm';
import { buildEmail, parseTiltakForm, tiltakJson } from './ki-tiltak-email';
import { tilKiTiltak } from './ki-tiltak';

function form(overstyr: Partial<TiltakForm> = {}): TiltakForm {
  return {
    ...emptyForm(),
    ansvarligNavn: 'Digitaliseringsdirektoratet',
    ansvarligOrgnr: '991825827',
    navn: 'KI-assistent for klarspråk i vedtak',
    beskrivelse: 'Vi tester en KI-assistent som foreslår enklere formuleringer.',
    fagomrade: 'Digitale teknologier',
    kontaktinfo: 'postmottak@digdir.no',
    fase: 'Gjennomføring',
    leveranse: 'Pilot',
    consent: true,
    ...overstyr,
  };
}

describe('parseTiltakForm', () => {
  test('rejects bodies that are not objects', () => {
    for (const body of [null, 'tekst', 42, [], undefined]) {
      expect(parseTiltakForm(body)).toBeNull();
    }
  });

  test('reads the fields from a valid object', () => {
    const result = parseTiltakForm({
      ansvarligNavn: 'Entur AS',
      ansvarligOrgnr: '917422575',
      navn: 'Et tiltak',
      beskrivelse: 'En beskrivelse',
      fagomrade: 'Trafikk og transport',
      kontaktinfo: 'post@entur.no',
      fase: 'Innsikt og planlegging',
      leveranse: 'Annet',
      leveranseAnnet: 'Rapport',
      kiType: ['Generativ KI'],
      samarbeid: [{ id: 'rad-1', navn: 'KS', orgnr: '971032146' }],
    });
    expect(result?.ansvarligNavn).toBe('Entur AS');
    expect(result?.samarbeid).toEqual([{ id: 'rad-1', navn: 'KS', orgnr: '971032146' }]);
    expect(result?.leveranse).toBe('Annet');
    expect(result?.kiType).toEqual(['Generativ KI']);
  });

  test('line breaks in single-line fields are removed, so submitted text cannot forge the email headings', () => {
    const result = parseTiltakForm({
      navn: 'Tiltak\n\nKONTAKT\nE-post: angriper@example.invalid',
    });
    expect(result?.navn).not.toContain('\n');
    expect(result?.navn).toBe('Tiltak  KONTAKT E-post: angriper@example.invalid');
  });

  test('the description keeps line breaks, it is a textarea', () => {
    const result = parseTiltakForm({ beskrivelse: 'Linje 1\nLinje 2' });
    expect(result?.beskrivelse).toBe('Linje 1\nLinje 2');
  });

  test('unknown values are filtered out', () => {
    const result = parseTiltakForm({
      leveranse: 'Noe oppdiktet',
      kiType: ['Agentisk KI', '<script>'],
    });
    expect(result?.leveranse).toBe('');
    expect(result?.kiType).toEqual(['Agentisk KI']);
  });

  test('a list from an old cached page is accepted, and the first valid value is used', () => {
    expect(parseTiltakForm({ leveranse: ['Noe oppdiktet', 42, 'MVP', 'Pilot'] })?.leveranse).toBe('MVP');
    expect(parseTiltakForm({ leveranse: [] })?.leveranse).toBe('');
  });

  test('checked choices are normalised to the order of the option list', () => {
    const result = parseTiltakForm({ kiType: ['Språkteknologi', 'Generativ KI'] });
    expect(result?.kiType).toEqual(['Generativ KI', 'Språkteknologi']);
  });

  test('fields with the wrong type become an empty string instead of crashing', () => {
    const result = parseTiltakForm({ navn: 42, beskrivelse: null, kontaktinfo: {} });
    expect(result?.navn).toBe('');
    expect(result?.beskrivelse).toBe('');
    expect(result?.kontaktinfo).toBe('');
  });

  test('unknown fields are not included', () => {
    const result = parseTiltakForm({ navn: 'Et tiltak', erAdmin: true, rolle: 'redaktor' });
    expect(result).not.toBeNull();
    expect(Object.keys(result ?? {})).toEqual(Object.keys(emptyForm()));
  });

  test('samarbeid that is not a list gives an empty list', () => {
    expect(parseTiltakForm({ samarbeid: 'nei' })?.samarbeid).toEqual([]);
    expect(parseTiltakForm({ samarbeid: [1, 'to', null] })?.samarbeid).toEqual([]);
  });

  test('only a real true counts as consent', () => {
    expect(parseTiltakForm({ consent: true })?.consent).toBe(true);
    for (const consent of ['true', 1, 'ja', null, undefined]) {
      expect(parseTiltakForm({ consent })?.consent).toBe(false);
    }
  });
});

describe('buildEmail', () => {
  test('the subject contains the tiltak and the organisation', () => {
    expect(buildEmail(form()).subject).toBe(
      'KI-tiltak: KI-assistent for klarspråk i vedtak (Digitaliseringsdirektoratet)',
    );
  });

  test('the text contains all filled-in fields', () => {
    const { text } = buildEmail(form());
    expect(text).toContain('KI-assistent for klarspråk i vedtak');
    expect(text).toContain('Digitaliseringsdirektoratet');
    expect(text).toContain('991825827');
    expect(text).toContain('Digitale teknologier');
    expect(text).toContain('postmottak@digdir.no');
    expect(text).toContain('Gjennomføring');
  });

  test('checked choices are listed on one line, "Annet" with free text in parentheses', () => {
    const { text } = buildEmail(
      form({
        leveranse: 'Annet',
        leveranseAnnet: 'Rapport',
        kiType: ['Generativ KI', 'Språkteknologi'],
      }),
    );
    expect(text).toContain('Skal levere: Annet (Rapport)');
    expect(text).toContain('Type KI: Generativ KI, Språkteknologi');
  });

  test('empty optional fields are clearly marked', () => {
    const { text } = buildEmail(form());
    expect(text).toContain('Type KI: (ikke oppgitt)');
    expect(text).toContain('SAMARBEIDSVIRKSOMHETER\n  (ingen oppgitt)');
  });

  test('partner organisations are listed with name and organisation number', () => {
    const row = { ...newPartnerRow(), navn: 'KS', orgnr: '971032146' };
    const { text } = buildEmail(form({ samarbeid: [row] }));
    expect(text).toContain('1. KS (971032146)');
  });

  test('the content is plain text, without markup from the submission', () => {
    const { text, subject } = buildEmail(
      form({ navn: '<script>alert(1)</script>', beskrivelse: '<b>hei</b>' }),
    );
    // The text is sent as contentType Text, so the tags remain characters and never
    // become markup. We neither escape nor remove them.
    expect(subject).toContain('<script>alert(1)</script>');
    expect(text).toContain('<b>hei</b>');
  });
});

describe('consent in the email', () => {
  // 12.03 UTC is 14.03 in Oslo, summer time until 25 October 2026.
  const when = new Date('2026-10-20T12:03:00Z');

  test('records when consent was given and the exact text', () => {
    const { text } = buildEmail(form(), () => 'x', when);
    expect(text).toContain('SAMTYKKE');
    expect(text).toContain('Innsenderen krysset av for dette 20.10.2026 kl. 14.03:');
    expect(text).toContain(`«${CONSENT_TEXT}»`);
    expect(text).toContain('Ta vare på denne e-posten');
  });

  test('uses Norwegian winter time after the clocks change', () => {
    const { text } = buildEmail(form(), () => 'x', new Date('2026-11-02T08:30:00Z'));
    expect(text).toContain('02.11.2026 kl. 09.30');
  });

  test('says so plainly if consent is missing', () => {
    const { text } = buildEmail(form({ consent: false }), () => 'x', when);
    expect(text).toContain('Innsenderen har ikke krysset av for samtykke.');
    expect(text).not.toContain(CONSENT_TEXT);
  });

  test('consent is not part of the published entry', () => {
    expect(tiltakJson(form(), 'x')).not.toMatch(/consent|samtykke/i);
  });
});

describe('the JSON block in the email', () => {
  const blokk = (text: string) => text.split('ki-tiltak.json:\n\n')[1].split('\n\nSvar på')[0];

  test('pasted after [ gives valid JSON with one more entry', async () => {
    const fil = (await import('node:fs')).readFileSync(
      new URL('../data/ki-tiltak.json', import.meta.url),
      'utf-8',
    );
    const { text } = buildEmail(form(), () => '11111111-2222-4333-8444-555555555555');
    const limt = fil.replace('[', `[\n${blokk(text)}`);
    const data = JSON.parse(limt);
    expect(data).toHaveLength(JSON.parse(fil).length + 1);
    expect(data[0]).toMatchObject({
      id: '11111111-2222-4333-8444-555555555555',
      navn: 'KI-assistent for klarspråk i vedtak',
      orgnr: '991825827',
      fase: 'Gjennomføring',
      kontaktinfo: 'postmottak@digdir.no',
    });
  });

  test('leveranse and kiType are lists, and free text only when Annet is selected', () => {
    const { text } = buildEmail(
      form({ leveranse: 'Annet', leveranseAnnet: 'Rapport', kiType: ['Generativ KI'], kiTypeAnnet: 'glemt' }),
      () => 'x',
    );
    const post = JSON.parse(blokk(text).replace(/,$/, ''));
    expect(post.leveranse).toEqual(['Annet']);
    expect(post.leveranseAnnet).toBe('Rapport');
    expect(post.kiType).toEqual(['Generativ KI']);
    expect(post).not.toHaveProperty('kiTypeAnnet');
  });

  test('every email gets a new id', () => {
    expect(blokk(buildEmail(form()).text)).not.toBe(blokk(buildEmail(form()).text));
  });
});

describe('the JSON block with several organisations (#806)', () => {
  const post = (f: TiltakForm) => JSON.parse(tiltakJson(f, 'x').replace(/,$/, ''));

  test('without samarbeid, virksomhet and orgnr are text, as today', () => {
    const p = post(form());
    expect(p.virksomhet).toBe('Digitaliseringsdirektoratet');
    expect(p.orgnr).toBe('991825827');
  });

  test('with samarbeid both become lists, with the main organisation first', () => {
    const p = post(
      form({
        samarbeid: [
          { ...newPartnerRow(), navn: ' KS ', orgnr: '971032146' },
          { ...newPartnerRow(), navn: 'Entur AS', orgnr: '917422575' },
        ],
      }),
    );
    expect(p.virksomhet).toEqual(['Digitaliseringsdirektoratet', 'KS', 'Entur AS']);
    expect(p.orgnr).toEqual(['991825827', '971032146', '917422575']);
  });

  test('a row without orgnr gets empty text in its place, and fully empty rows are left out', () => {
    const p = post(
      form({
        samarbeid: [
          { ...newPartnerRow(), navn: 'KS', orgnr: '' },
          { ...newPartnerRow(), navn: ' ', orgnr: ' ' },
          { ...newPartnerRow(), navn: 'Entur AS', orgnr: '917422575' },
        ],
      }),
    );
    expect(p.virksomhet).toEqual(['Digitaliseringsdirektoratet', 'KS', 'Entur AS']);
    expect(p.orgnr).toEqual(['991825827', '', '917422575']);
  });

  test('the block through tilKiTiltak gives virksomheter and orgnr in the right order', () => {
    const t = tilKiTiltak(
      post(
        form({
          samarbeid: [
            { ...newPartnerRow(), navn: 'KS', orgnr: '' },
            { ...newPartnerRow(), navn: 'Entur AS', orgnr: '917422575' },
          ],
        }),
      ),
    );
    expect(t.virksomheter).toEqual(['Digitaliseringsdirektoratet', 'KS', 'Entur AS']);
    expect(t.orgnr).toEqual(['991825827', '', '917422575']);
  });
});
