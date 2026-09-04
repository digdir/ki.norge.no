import { describe, expect, test } from 'vitest';
import { hasValidCheckDigit } from './organisationNumber';
import { newPartnerRow, emptyForm, type TiltakForm } from './tiltakForm';
import { ERROR_MESSAGE, errorFor, validateTiltakForm } from './validateTiltakForm';

/** Ekte organisasjonsnummer, altså med gyldig kontrollsiffer. */
const DIGDIR = '991825827';
const ENTUR = '917422575';

function validForm(overstyr: Partial<TiltakForm> = {}): TiltakForm {
  return {
    ...emptyForm(),
    ansvarligNavn: 'Digitaliseringsdirektoratet',
    ansvarligOrgnr: DIGDIR,
    navn: 'KI lab',
    beskrivelse: 'Utforsker KI-løsninger for offentlige tjenester.',
    fagomrade: 'Digitale teknologier',
    kontaktinfo: 'postmottak@digdir.no',
    status: 'Pågående',
    ...overstyr,
  };
}

/** Feilmeldingen for ett felt, eller undefined. */
function message(form: TiltakForm, field: Parameters<typeof errorFor>[1]) {
  return errorFor(validateTiltakForm(form), field);
}

describe('hasValidCheckDigit', () => {
  test('godtar ekte organisasjonsnummer', () => {
    expect(hasValidCheckDigit(DIGDIR)).toBe(true);
    expect(hasValidCheckDigit(ENTUR)).toBe(true);
    expect(hasValidCheckDigit('986128433')).toBe(true);
  });

  test('avviser ni siffer med feil kontrollsiffer', () => {
    // Ser riktig ut, men kontrollsifferet skulle vært 5.
    expect(hasValidCheckDigit('123456789')).toBe(false);
    // Ett siffer endret i et ekte nummer, den vanligste tastefeilen.
    expect(hasValidCheckDigit('991825837')).toBe(false);
  });

  test('avviser alt som ikke er ni siffer', () => {
    expect(hasValidCheckDigit('')).toBe(false);
    expect(hasValidCheckDigit('99182582')).toBe(false);
    expect(hasValidCheckDigit('9918258270')).toBe(false);
    expect(hasValidCheckDigit('99182582a')).toBe(false);
  });
});

describe('validateTiltakForm', () => {
  test('gyldig skjema gir ingen feil', () => {
    expect(validateTiltakForm(validForm())).toEqual([]);
  });

  describe('påkrevde felt', () => {
    const tilfeller: ReadonlyArray<[string, Partial<TiltakForm>, string, string]> = [
      ['virksomhet', { ansvarligNavn: '   ' }, 'ansvarligNavn', ERROR_MESSAGE.ansvarligNavn],
      ['organisasjonsnummer', { ansvarligOrgnr: '' }, 'ansvarligOrgnr', ERROR_MESSAGE.orgnrEmpty],
      ['tiltakets navn', { navn: '   ' }, 'navn', ERROR_MESSAGE.navn],
      ['beskrivelse', { beskrivelse: '   ' }, 'beskrivelse', ERROR_MESSAGE.beskrivelse],
      ['tema', { fagomrade: '' }, 'fagomrade', ERROR_MESSAGE.fagomrade],
      ['kontaktinfo', { kontaktinfo: '  ' }, 'kontaktinfo', ERROR_MESSAGE.kontaktinfoEmpty],
      ['status', { status: '' }, 'status', ERROR_MESSAGE.status],
    ];

    test.each(tilfeller)('krever %s', (_navn, overstyr, field, forventet) => {
      expect(message(validForm(overstyr), field as never)).toBe(forventet);
    });

    test('alle sju kan mangle samtidig', () => {
      const errors = validateTiltakForm(emptyForm());
      expect(errors).toHaveLength(7);
      expect(errors.map((item) => item.field)).toEqual([
        'ansvarligNavn',
        'ansvarligOrgnr',
        'navn',
        'beskrivelse',
        'fagomrade',
        'kontaktinfo',
        'status',
      ]);
    });
  });

  describe('organisasjonsnummer', () => {
    test('skiller mellom feil format og feil kontrollsiffer', () => {
      expect(message(validForm({ ansvarligOrgnr: '12345' }), 'ansvarligOrgnr')).toBe(
        ERROR_MESSAGE.orgnrFormat,
      );
      expect(message(validForm({ ansvarligOrgnr: '12345678a' }), 'ansvarligOrgnr')).toBe(
        ERROR_MESSAGE.orgnrFormat,
      );
      expect(message(validForm({ ansvarligOrgnr: '123456789' }), 'ansvarligOrgnr')).toBe(
        ERROR_MESSAGE.orgnrInvalid,
      );
    });
  });

  describe('kontaktinfo', () => {
    test.each(['ikke-en-epost', 'mangler-krøllalfa.no', '@digdir.no', 'to adresser@digdir.no'])(
      'avviser %s',
      (value) => {
        expect(message(validForm({ kontaktinfo: value }), 'kontaktinfo')).toBe(
          ERROR_MESSAGE.kontaktinfoFormat,
        );
      },
    );

    test.each(['postmottak@digdir.no', 'ki-tiltak@kin.norge.no', 'fornavn.etternavn@sub.digdir.no'])(
      'godtar %s',
      (value) => {
        expect(message(validForm({ kontaktinfo: value }), 'kontaktinfo')).toBeUndefined();
      },
    );
  });

  describe('samarbeidsvirksomheter', () => {
    test('en tom rad brukeren aldri fylte ut stopper ikke innsendingen', () => {
      const form = validForm({ samarbeid: [newPartnerRow()] });
      expect(validateTiltakForm(form)).toEqual([]);
    });

    test('en utfylt rad krever både navn og gyldig organisasjonsnummer', () => {
      const row = { ...newPartnerRow(), navn: 'Entur AS' };
      const errors = validateTiltakForm(validForm({ samarbeid: [row] }));
      expect(errorFor(errors, `samarbeid:${row.id}:orgnr`)).toBe(ERROR_MESSAGE.orgnrEmpty);

      const withoutName = { ...newPartnerRow(), orgnr: ENTUR };
      const errors2 = validateTiltakForm(validForm({ samarbeid: [withoutName] }));
      expect(errorFor(errors2, `samarbeid:${withoutName.id}:navn`)).toBe(ERROR_MESSAGE.samarbeidNavn);
    });

    test('en fullstendig rad er gyldig', () => {
      const row = { ...newPartnerRow(), navn: 'Entur AS', orgnr: ENTUR };
      expect(validateTiltakForm(validForm({ samarbeid: [row] }))).toEqual([]);
    });

    test('feil i flere rader holdes fra hverandre', () => {
      const first = { ...newPartnerRow(), navn: 'Entur AS', orgnr: '123' };
      const second = { ...newPartnerRow(), navn: 'Nav', orgnr: '123456789' };
      const errors = validateTiltakForm(validForm({ samarbeid: [first, second] }));
      expect(errors).toHaveLength(2);
      expect(errorFor(errors, `samarbeid:${first.id}:orgnr`)).toBe(ERROR_MESSAGE.orgnrFormat);
      expect(errorFor(errors, `samarbeid:${second.id}:orgnr`)).toBe(ERROR_MESSAGE.orgnrInvalid);
    });
  });

  describe('datoer', () => {
    test('sluttdato kan ikke være før oppstartsdato', () => {
      const form = validForm({ oppstart: '2026-06-01', slutt: '2026-01-01' });
      expect(message(form, 'slutt')).toBe(ERROR_MESSAGE.slutt);
    });

    test('like datoer er greit', () => {
      const form = validForm({ oppstart: '2026-06-01', slutt: '2026-06-01' });
      expect(message(form, 'slutt')).toBeUndefined();
    });

    test('bare én dato satt gir ingen datofeil', () => {
      expect(message(validForm({ slutt: '2026-01-01' }), 'slutt')).toBeUndefined();
      expect(message(validForm({ oppstart: '2026-01-01' }), 'slutt')).toBeUndefined();
    });
  });

  test('feilene kommer i samme rekkefølge som feltene står i skjemaet', () => {
    const row = { ...newPartnerRow(), navn: 'Entur AS', orgnr: '123' };
    const errors = validateTiltakForm({
      ...emptyForm(),
      samarbeid: [row],
      oppstart: '2026-06-01',
      slutt: '2026-01-01',
    });
    expect(errors.map((item) => item.field)).toEqual([
      'ansvarligNavn',
      'ansvarligOrgnr',
      `samarbeid:${row.id}:orgnr`,
      'navn',
      'beskrivelse',
      'fagomrade',
      'kontaktinfo',
      'status',
      'slutt',
    ]);
  });
});
