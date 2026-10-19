import { describe, expect, test } from 'vitest';
import {
  brukOverstyringer,
  klargjor,
  rensTiltak,
  sorterFelt,
  tilJson,
  ukjenteVerdier,
  utenNA,
  type Tiltak,
} from './klargjor-ki-tiltak';

const tiltak = (felt: Partial<Tiltak> = {}): Tiltak => ({ id: 'a', navn: 'Testtiltak', ...felt });

describe('utenNA', () => {
  test.each(['NA', 'na', ' N/A ', 'n/a'])('"%s" as the whole value becomes null', (verdi) => {
    expect(utenNA(verdi)).toEqual({ verdi: null, rettet: 1 });
  });

  test('an NA part first, in the middle and last is removed with its separator', () => {
    expect(utenNA('NA ; Raskere svar').verdi).toBe('Raskere svar');
    expect(utenNA('Raskere svar ; NA ; Færre køer').verdi).toBe('Raskere svar ; Færre køer');
    expect(utenNA('Raskere svar ; NA').verdi).toBe('Raskere svar');
  });

  test('the rest of the text is left untouched, including line breaks and double spaces', () => {
    const tekst = 'Første  del ; NA ; -Punkt én\r\n- Punkt to';
    expect(utenNA(tekst).verdi).toBe('Første  del ; -Punkt én\r\n- Punkt to');
  });

  test('NA inside a word or a sentence is not a placeholder', () => {
    for (const tekst of ['NAV bruker KI', 'Screening (NAS Råde)', 'Svar: NA-verdier håndteres']) {
      expect(utenNA(tekst)).toEqual({ verdi: tekst, rettet: 0 });
    }
  });

  test('only NA parts becomes null', () => {
    expect(utenNA('NA ; N/A')).toEqual({ verdi: null, rettet: 2 });
  });
});

describe('rensTiltak', () => {
  test('replaces the register variants with our values and counts them', () => {
    const { tiltak: t, byttet } = rensTiltak(
      tiltak({ kiType: ['Språkteknologi (NLP)', 'Generativ KI'], leveranse: ['Fullskala / produksjonssatt'] }),
    );
    expect(t.kiType).toEqual(['Språkteknologi', 'Generativ KI']);
    expect(t.leveranse).toEqual(['Løsning i produksjon']);
    expect(byttet).toHaveLength(2);
  });

  test('removes NA from lists and fixes text fields', () => {
    const r = rensTiltak(tiltak({ kiType: ['NA', 'Prediktiv KI'], beskrivelse: 'N/A', kontaktinfo: 'na' }));
    expect(r.tiltak.kiType).toEqual(['Prediktiv KI']);
    expect(r.tiltak.beskrivelse).toBeNull();
    expect(r.tiltak.kontaktinfo).toBeNull();
    expect(r.naRettet).toBe(3);
  });

  test('does not modify the input', () => {
    const input = tiltak({ beskrivelse: 'NA' });
    rensTiltak(input);
    expect(input.beskrivelse).toBe('NA');
  });
});

describe('ukjenteVerdier', () => {
  test('reports values outside the form, without changing them', () => {
    const t = tiltak({ fagomrade: 'Romfart', fase: 'I drift', kiType: ['Kvante-KI'], leveranse: ['Pilot'] });
    expect(ukjenteVerdier(t)).toEqual([
      { felt: 'fagomrade', verdi: 'Romfart' },
      { felt: 'kiType', verdi: 'Kvante-KI' },
    ]);
  });

  test('null and empty lists are not unknown', () => {
    expect(ukjenteVerdier(tiltak({ fagomrade: null, fase: null, kiType: [], leveranse: [] }))).toEqual([]);
  });
});

describe('brukOverstyringer', () => {
  const overstyringer = {
    a: { hvorfor: 'test', sett: { leveranse: ['PoC', 'Pilot'], kiTypeAnnet: 'Klassifisering' } },
    b: { hvorfor: 'test', erstatt: { beskrivelse: { fra: 'fisk?', til: 'fisk.' } } },
    borte: { hvorfor: 'test', sett: { fagomrade: 'Arbeid' } },
  };

  test('sett replaces fields, and erstatt only fixes the piece of text', () => {
    const { tiltak: ut } = brukOverstyringer(
      [tiltak({ leveranse: ['PoC'] }), tiltak({ id: 'b', beskrivelse: 'Sporing av fisk? Ja, fisk?' })],
      overstyringer,
    );
    expect(ut[0].leveranse).toEqual(['PoC', 'Pilot']);
    expect(ut[0].kiTypeAnnet).toBe('Klassifisering');
    expect(ut[1].beskrivelse).toBe('Sporing av fisk. Ja, fisk?');
  });

  test('reports ids that do not exist, and overrides that change nothing', () => {
    const { brukt, ukjenteId } = brukOverstyringer(
      [tiltak({ leveranse: ['PoC', 'Pilot'] }), tiltak({ id: 'b', beskrivelse: 'Allerede rettet.' })],
      overstyringer,
    );
    expect(ukjenteId).toEqual(['borte']);
    expect(brukt).toEqual([
      { id: 'a', navn: 'Testtiltak', endret: ['kiTypeAnnet'], uendret: ['leveranse'] },
      { id: 'b', navn: 'Testtiltak', endret: [], uendret: ['beskrivelse'] },
    ]);
  });
});

describe('klargjor', () => {
  test('writes the fields in a fixed order, and new fields end up where they belong', () => {
    const { tiltak: ut } = klargjor(
      [tiltak({ kiType: ['Annet'], kontaktinfo: null })],
      { a: { hvorfor: 'test', sett: { kiTypeAnnet: 'Klassifisering' } } },
      {},
    );
    expect(Object.keys(ut[0])).toEqual(['id', 'navn', 'kiType', 'kiTypeAnnet', 'kontaktinfo']);
  });

  test('reports orgnr without a name and tiltak without a fagområde', () => {
    const r = klargjor(
      [
        tiltak({ virksomhet: ['EKSEMPEL AS', 'KJENT AS'], orgnr: ['111111111', '222222222'], fagomrade: 'Arbeid' }),
        tiltak({ id: 'b', navn: 'Uten tema', fagomrade: null }),
      ],
      {},
      { '222222222': 'Kjent AS' },
    );
    expect(r.utenNavn).toEqual([{ orgnr: '111111111', navn: 'EKSEMPEL AS' }]);
    expect(r.utenFagomrade).toEqual(['Uten tema']);
  });

  test('tilJson gives two spaces and a trailing line break', () => {
    expect(tilJson([sorterFelt(tiltak())])).toBe('[\n  {\n    "id": "a",\n    "navn": "Testtiltak"\n  }\n]\n');
  });
});
