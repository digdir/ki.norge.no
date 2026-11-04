import { describe, expect, test } from 'vitest';
import { hasValidCheckDigit } from './organisationNumber';
import { newPartnerRow, emptyForm, type TiltakForm } from './tiltakForm';
import { ERROR_MESSAGE, errorFor, validateTiltakForm } from './validateTiltakForm';

/** Real organisation numbers, that is with a valid check digit. */
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
    fase: 'Gjennomføring',
    leveranse: 'Pilot',
    consent: true,
    ...overstyr,
  };
}

/** The error message for one field, or undefined. */
function message(form: TiltakForm, field: Parameters<typeof errorFor>[1]) {
  return errorFor(validateTiltakForm(form), field);
}

describe('hasValidCheckDigit', () => {
  test('accepts real organisation numbers', () => {
    expect(hasValidCheckDigit(DIGDIR)).toBe(true);
    expect(hasValidCheckDigit(ENTUR)).toBe(true);
    expect(hasValidCheckDigit('986128433')).toBe(true);
  });

  test('rejects nine digits with a wrong check digit', () => {
    // Looks right, but the check digit should have been 5.
    expect(hasValidCheckDigit('123456789')).toBe(false);
    // One digit changed in a real number, the most common typo.
    expect(hasValidCheckDigit('991825837')).toBe(false);
  });

  test('rejects anything that is not nine digits', () => {
    expect(hasValidCheckDigit('')).toBe(false);
    expect(hasValidCheckDigit('99182582')).toBe(false);
    expect(hasValidCheckDigit('9918258270')).toBe(false);
    expect(hasValidCheckDigit('99182582a')).toBe(false);
  });
});

describe('validateTiltakForm', () => {
  test('a valid form gives no errors', () => {
    expect(validateTiltakForm(validForm())).toEqual([]);
  });

  describe('required fields', () => {
    const tilfeller: ReadonlyArray<[string, Partial<TiltakForm>, string, string]> = [
      ['organisation', { ansvarligNavn: '   ' }, 'ansvarligNavn', ERROR_MESSAGE.ansvarligNavn],
      ['organisation number', { ansvarligOrgnr: '' }, 'ansvarligOrgnr', ERROR_MESSAGE.orgnrEmpty],
      ['ki-tiltak name', { navn: '   ' }, 'navn', ERROR_MESSAGE.navn],
      ['description', { beskrivelse: '   ' }, 'beskrivelse', ERROR_MESSAGE.beskrivelse],
      ['topic', { fagomrade: '' }, 'fagomrade', ERROR_MESSAGE.fagomrade],
      ['contact info', { kontaktinfo: '  ' }, 'kontaktinfo', ERROR_MESSAGE.kontaktinfoEmpty],
      ['phase', { fase: '' }, 'fase', ERROR_MESSAGE.fase],
      ['deliverable', { leveranse: '' }, 'leveranse', ERROR_MESSAGE.leveranse],
      ['consent', { consent: false }, 'consent', ERROR_MESSAGE.consent],
      ['unknown deliverable', { leveranse: 'Noe oppdiktet' }, 'leveranse', ERROR_MESSAGE.leveranse],
      [
        'free text when "Annet" is ticked',
        { leveranse: 'Annet', leveranseAnnet: '  ' },
        'leveranseAnnet',
        ERROR_MESSAGE.leveranseAnnet,
      ],
    ];

    test.each(tilfeller)('requires %s', (_navn, overstyr, field, forventet) => {
      expect(message(validForm(overstyr), field as never)).toBe(forventet);
    });

    test('all nine can be missing at once', () => {
      const errors = validateTiltakForm(emptyForm());
      expect(errors).toHaveLength(9);
      expect(errors.map((item) => item.field)).toEqual([
        'ansvarligNavn',
        'ansvarligOrgnr',
        'navn',
        'beskrivelse',
        'fagomrade',
        'fase',
        'leveranse',
        'kontaktinfo',
        'consent',
      ]);
    });
  });

  describe('organisation number', () => {
    test('distinguishes between wrong format and wrong check digit', () => {
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
      'rejects %s',
      (value) => {
        expect(message(validForm({ kontaktinfo: value }), 'kontaktinfo')).toBe(
          ERROR_MESSAGE.kontaktinfoFormat,
        );
      },
    );

    test.each(['postmottak@digdir.no', 'ki-tiltak@kin.norge.no', 'fornavn.etternavn@sub.digdir.no'])(
      'accepts %s',
      (value) => {
        expect(message(validForm({ kontaktinfo: value }), 'kontaktinfo')).toBeUndefined();
      },
    );
  });

  describe('partner organisations', () => {
    test('an empty row the user never filled in does not stop the submission', () => {
      const form = validForm({ samarbeid: [newPartnerRow()] });
      expect(validateTiltakForm(form)).toEqual([]);
    });

    test('a filled-in row requires both a name and a valid organisation number', () => {
      const row = { ...newPartnerRow(), navn: 'Entur AS' };
      const errors = validateTiltakForm(validForm({ samarbeid: [row] }));
      expect(errorFor(errors, `samarbeid:${row.id}:orgnr`)).toBe(ERROR_MESSAGE.orgnrEmpty);

      const withoutName = { ...newPartnerRow(), orgnr: ENTUR };
      const errors2 = validateTiltakForm(validForm({ samarbeid: [withoutName] }));
      expect(errorFor(errors2, `samarbeid:${withoutName.id}:navn`)).toBe(ERROR_MESSAGE.samarbeidNavn);
    });

    test('a complete row is valid', () => {
      const row = { ...newPartnerRow(), navn: 'Entur AS', orgnr: ENTUR };
      expect(validateTiltakForm(validForm({ samarbeid: [row] }))).toEqual([]);
    });

    test('errors in several rows are kept apart', () => {
      const first = { ...newPartnerRow(), navn: 'Entur AS', orgnr: '123' };
      const second = { ...newPartnerRow(), navn: 'Nav', orgnr: '123456789' };
      const errors = validateTiltakForm(validForm({ samarbeid: [first, second] }));
      expect(errors).toHaveLength(2);
      expect(errorFor(errors, `samarbeid:${first.id}:orgnr`)).toBe(ERROR_MESSAGE.orgnrFormat);
      expect(errorFor(errors, `samarbeid:${second.id}:orgnr`)).toBe(ERROR_MESSAGE.orgnrInvalid);
    });
  });

  describe('values outside the option lists', () => {
    // The form cannot produce these. They can only come from a POST straight
    // to the route, and are treated as "not selected".
    test('unknown topic is treated as not selected', () => {
      expect(message(validForm({ fagomrade: 'Oppdiktet tema' }), 'fagomrade')).toBe(
        ERROR_MESSAGE.fagomrade,
      );
    });

    test('unknown phase is treated as not selected', () => {
      expect(message(validForm({ fase: 'Pågående' }), 'fase')).toBe(ERROR_MESSAGE.fase);
    });

    test('too long text is rejected', () => {
      expect(message(validForm({ navn: 'a'.repeat(201) }), 'navn')).toBe(ERROR_MESSAGE.forLangt);
      expect(message(validForm({ beskrivelse: 'a'.repeat(801) }), 'beskrivelse')).toBe(
        ERROR_MESSAGE.forLangt,
      );
      expect(message(validForm({ kiTypeAnnet: 'a'.repeat(201) }), 'kiTypeAnnet')).toBe(
        ERROR_MESSAGE.forLangt,
      );
    });

    test('text within the limit is valid', () => {
      expect(validateTiltakForm(validForm({ navn: 'a'.repeat(200) }))).toHaveLength(0);
    });
  });

  describe('optional questions', () => {
    test('kiType can be empty', () => {
      expect(validateTiltakForm(validForm({ kiType: [] }))).toHaveLength(0);
    });

    test('"Annet" in kiType without free text passes', () => {
      const form = validForm({ kiType: ['Annet'], kiTypeAnnet: '' });
      expect(validateTiltakForm(form)).toHaveLength(0);
    });

    test('"Annet" in leveranse with free text is valid', () => {
      const form = validForm({ leveranse: 'Annet', leveranseAnnet: 'Rapport' });
      expect(validateTiltakForm(form)).toHaveLength(0);
    });
  });

  test('the errors come in the same order as the fields appear in the form', () => {
    const row = { ...newPartnerRow(), navn: 'Entur AS', orgnr: '123' };
    const errors = validateTiltakForm({
      ...emptyForm(),
      samarbeid: [row],
    });
    expect(errors.map((item) => item.field)).toEqual([
      'ansvarligNavn',
      'ansvarligOrgnr',
      `samarbeid:${row.id}:orgnr`,
      'navn',
      'beskrivelse',
      'fagomrade',
      'fase',
      'leveranse',
      'kontaktinfo',
      'consent',
    ]);
  });
});
