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
  test.each(['NA', 'na', ' N/A ', 'n/a'])('«%s» som hele verdien blir null', (verdi) => {
    expect(utenNA(verdi)).toEqual({ verdi: null, rettet: 1 });
  });

  test('NA-bit først, i midten og sist fjernes med skilletegnet', () => {
    expect(utenNA('NA ; Raskere svar').verdi).toBe('Raskere svar');
    expect(utenNA('Raskere svar ; NA ; Færre køer').verdi).toBe('Raskere svar ; Færre køer');
    expect(utenNA('Raskere svar ; NA').verdi).toBe('Raskere svar');
  });

  test('resten av teksten står urørt, også linjeskift og doble mellomrom', () => {
    const tekst = 'Første  del ; NA ; -Punkt én\r\n- Punkt to';
    expect(utenNA(tekst).verdi).toBe('Første  del ; -Punkt én\r\n- Punkt to');
  });

  test('NA inne i et ord eller en setning er ikke en plassholder', () => {
    for (const tekst of ['NAV bruker KI', 'Screening (NAS Råde)', 'Svar: NA-verdier håndteres']) {
      expect(utenNA(tekst)).toEqual({ verdi: tekst, rettet: 0 });
    }
  });

  test('bare NA-biter blir null', () => {
    expect(utenNA('NA ; N/A')).toEqual({ verdi: null, rettet: 2 });
  });
});

describe('rensTiltak', () => {
  test('bytter registerets varianter til våre verdier og teller dem', () => {
    const { tiltak: t, byttet } = rensTiltak(
      tiltak({ kiType: ['Språkteknologi (NLP)', 'Generativ KI'], leveranse: ['Fullskala / produksjonssatt'] }),
    );
    expect(t.kiType).toEqual(['Språkteknologi', 'Generativ KI']);
    expect(t.leveranse).toEqual(['Løsning i produksjon']);
    expect(byttet).toHaveLength(2);
  });

  test('fjerner NA fra lister og retter tekstfelt', () => {
    const r = rensTiltak(tiltak({ kiType: ['NA', 'Prediktiv KI'], beskrivelse: 'N/A', kontaktinfo: 'na' }));
    expect(r.tiltak.kiType).toEqual(['Prediktiv KI']);
    expect(r.tiltak.beskrivelse).toBeNull();
    expect(r.tiltak.kontaktinfo).toBeNull();
    expect(r.naRettet).toBe(3);
  });

  test('endrer ikke input', () => {
    const input = tiltak({ beskrivelse: 'NA' });
    rensTiltak(input);
    expect(input.beskrivelse).toBe('NA');
  });
});

describe('ukjenteVerdier', () => {
  test('rapporterer verdier utenfor skjemaet, uten å endre dem', () => {
    const t = tiltak({ fagomrade: 'Romfart', fase: 'I drift', kiType: ['Kvante-KI'], leveranse: ['Pilot'] });
    expect(ukjenteVerdier(t)).toEqual([
      { felt: 'fagomrade', verdi: 'Romfart' },
      { felt: 'kiType', verdi: 'Kvante-KI' },
    ]);
  });

  test('null og tomme lister er ikke ukjente', () => {
    expect(ukjenteVerdier(tiltak({ fagomrade: null, fase: null, kiType: [], leveranse: [] }))).toEqual([]);
  });
});

describe('brukOverstyringer', () => {
  const overstyringer = {
    a: { hvorfor: 'test', sett: { leveranse: ['PoC', 'Pilot'], kiTypeAnnet: 'Klassifisering' } },
    b: { hvorfor: 'test', erstatt: { beskrivelse: { fra: 'fisk?', til: 'fisk.' } } },
    borte: { hvorfor: 'test', sett: { fagomrade: 'Arbeid' } },
  };

  test('sett erstatter felt, og erstatt retter bare tekstbiten', () => {
    const { tiltak: ut } = brukOverstyringer(
      [tiltak({ leveranse: ['PoC'] }), tiltak({ id: 'b', beskrivelse: 'Sporing av fisk? Ja, fisk?' })],
      overstyringer,
    );
    expect(ut[0].leveranse).toEqual(['PoC', 'Pilot']);
    expect(ut[0].kiTypeAnnet).toBe('Klassifisering');
    expect(ut[1].beskrivelse).toBe('Sporing av fisk. Ja, fisk?');
  });

  test('melder id-er som ikke finnes, og overstyringer som ikke endrer noe', () => {
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
  test('skriver feltene i fast rekkefølge, og nye felt havner der de hører hjemme', () => {
    const { tiltak: ut } = klargjor(
      [tiltak({ kiType: ['Annet'], kontaktinfo: null })],
      { a: { hvorfor: 'test', sett: { kiTypeAnnet: 'Klassifisering' } } },
      {},
    );
    expect(Object.keys(ut[0])).toEqual(['id', 'navn', 'kiType', 'kiTypeAnnet', 'kontaktinfo']);
  });

  test('rapporterer orgnr uten navn og tiltak uten fagområde', () => {
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

  test('tilJson gir to mellomrom og linjeskift til slutt', () => {
    expect(tilJson([sorterFelt(tiltak())])).toBe('[\n  {\n    "id": "a",\n    "navn": "Testtiltak"\n  }\n]\n');
  });
});
