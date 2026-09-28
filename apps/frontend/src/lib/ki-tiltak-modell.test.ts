import { describe, expect, test } from 'vitest';
import {
  finnTiltak,
  normaliserTiltak,
  oppdaterIdAlias,
  rensListe,
  rensRad,
  rensTekst,
  rensValg,
  rensVirksomheter,
  settVisningsnavn,
  slaaSammenVarianter,
  tilFilformat,
  utenVerdi,
  KI_TYPER,
  KI_TYPE_ALIAS,
  type ImportTiltak,
} from './ki-tiltak-modell';

function tiltak(navn: string, felt: Partial<ImportTiltak> = {}): ImportTiltak {
  return { id: `id-${navn}`, navn, virksomheter: [], kiType: [], leveranse: [], ...felt };
}

describe('utenVerdi', () => {
  test.each([null, undefined, '', '   ', '\n\t', [], [''], [null, ' ', 'NA']])('%j har ingen verdi', (v) => {
    expect(utenVerdi(v)).toBe(true);
  });

  test.each(['NA', 'na', ' N/A ', '-', '–', 'null', 'NULL', 'Ikke oppgitt', ' ikke OPPGITT '])(
    'plassholderen %j har ingen verdi',
    (v) => {
      expect(utenVerdi(v)).toBe(true);
    },
  );

  test.each(['Pilot', ['', 'Pilot'], 'NAV', '--', 'Nav-kontor', 'ikke oppgitt ennå'])('%j har verdi', (v) => {
    expect(utenVerdi(v)).toBe(false);
  });
});

describe('rensTekst', () => {
  test('\\r\\n blir \\n, og mellomrom på linjeslutt forsvinner', () => {
    expect(rensTekst('Første \r\n- punkt  \r\n- punkt\t\n')).toBe('Første\n- punkt\n- punkt');
  });

  test('plassholderbiter fjernes fra tekster satt sammen med ;', () => {
    expect(rensTekst('NA ; Understøtte klinisk drift ; Raskere vurdering')).toBe(
      'Understøtte klinisk drift ; Raskere vurdering',
    );
    expect(rensTekst('Beslutningsstøtte ; NA ; - ')).toBe('Beslutningsstøtte');
    expect(rensTekst('NA ; n/a ; –')).toBeUndefined();
  });

  test('semikolon i vanlig tekst står urørt', () => {
    const prosa = 'Tidsbesparelse på lab;  tidsbesparelse for lege';
    expect(rensTekst(prosa)).toBe(prosa);
  });

  test('bare plassholder eller mellomrom gir ingen verdi', () => {
    expect(rensTekst(' NA ')).toBeUndefined();
    expect(rensTekst('   ')).toBeUndefined();
    expect(rensTekst(null)).toBeUndefined();
  });
});

describe('rensListe og rensValg', () => {
  test('tekst blir liste, og tomme verdier og duplikater forsvinner', () => {
    expect(rensListe('Pilot')).toEqual(['Pilot']);
    expect(rensListe(['Pilot', ' ', null, 'N/A', 'Pilot', 'MVP'])).toEqual(['Pilot', 'MVP']);
    expect(rensListe(null)).toEqual([]);
  });

  test('Språkteknologi (NLP) blir Språkteknologi', () => {
    expect(rensValg(['Språkteknologi (NLP)'], KI_TYPER, KI_TYPE_ALIAS)).toEqual({
      verdier: ['Språkteknologi'],
      ukjente: [],
    });
  });

  test('aliaset gir ikke duplikat når begge stavemåtene står', () => {
    expect(rensValg(['Språkteknologi', 'Språkteknologi (NLP)'], KI_TYPER, KI_TYPE_ALIAS).verdier).toEqual([
      'Språkteknologi',
    ]);
  });

  test('ukjente verdier beholdes og rapporteres', () => {
    expect(rensValg(['Generativ KI', 'Robotikk'], KI_TYPER, KI_TYPE_ALIAS)).toEqual({
      verdier: ['Generativ KI', 'Robotikk'],
      ukjente: ['Robotikk'],
    });
  });

  test('rensRad teller aliasene og melder ukjent fase og fagområde', () => {
    const { tiltak: t, ukjente, alias } = rensRad({
      id: 'a',
      navn: 'X',
      kiType: ['Språkteknologi (NLP)', 'Robotikk'],
      fase: 'Ferdig',
      fagomrade: 'Helse',
    });
    expect(t.kiType).toEqual(['Språkteknologi', 'Robotikk']);
    expect(alias).toBe(1);
    expect(ukjente.map((u) => u.felt)).toEqual(['kiType', 'fase', 'fagomrade']);
  });
});

describe('rensVirksomheter', () => {
  test('navn og orgnr pares på plass, før noe fjernes', () => {
    expect(rensVirksomheter(['A', null, 'C'], ['1', '2', '3'])).toEqual([
      { navn: 'A', orgnr: '1' },
      { navn: '', orgnr: '2' },
      { navn: 'C', orgnr: '3' },
    ]);
  });

  test('tekst, null og duplikate orgnr', () => {
    expect(rensVirksomheter('A', '1')).toEqual([{ navn: 'A', orgnr: '1' }]);
    expect(rensVirksomheter(null, null)).toEqual([]);
    expect(rensVirksomheter(['A', 'A igjen'], ['1', '1'])).toEqual([{ navn: 'A', orgnr: '1' }]);
  });
});

describe('slaaSammenVarianter', () => {
  const varianter = [
    tiltak('BoneView 2', {
      id: 'b2',
      virksomheter: [{ navn: 'HF B', orgnr: '2' }],
      beskrivelse: 'Kortere ventetid.',
      fase: 'I drift',
      kiType: ['Prediktiv KI'],
    }),
    tiltak('BoneView 1', {
      id: 'b1',
      virksomheter: [
        { navn: 'HF A', orgnr: '1' },
        { navn: 'HF B', orgnr: '2' },
      ],
      beskrivelse: 'Raskere vurdering.',
      fase: 'Gjennomføring',
      kontaktinfo: 'post@a.no',
    }),
    tiltak('BoneView 3', { id: 'b3', beskrivelse: 'Kortere ventetid.', fase: 'I drift' }),
    tiltak('Corsano Cardiowatch 287', { id: 'c' }),
    tiltak('Artsoraklet', { id: 'a' }),
  ];
  const { rader, sammenslaatt, erstattet } = slaaSammenVarianter(varianter);
  const bone = rader.find((t) => t.navn === 'BoneView')!;

  test('variantene blir ett tiltak med navnet uten nummer, og resten står', () => {
    expect(rader.map((t) => t.navn)).toEqual(['BoneView', 'Corsano Cardiowatch 287', 'Artsoraklet']);
  });

  test('id og hovedvirksomhet kommer fra laveste nummer, uavhengig av rekkefølgen i eksporten', () => {
    expect(bone.id).toBe('b1');
    expect(bone.virksomheter).toEqual([
      { navn: 'HF A', orgnr: '1' },
      { navn: 'HF B', orgnr: '2' },
    ]);
  });

  test('ulike beskrivelser settes sammen i nummerrekkefølge, like bare én gang', () => {
    expect(bone.beskrivelse).toBe('Raskere vurdering.\n\nKortere ventetid.');
  });

  test('ulik fase utelates, lik fase beholdes', () => {
    expect(bone.fase).toBeUndefined();
    const like = slaaSammenVarianter([tiltak('X 1', { fase: 'I drift' }), tiltak('X 2', { fase: 'I drift' })]);
    expect(like.rader[0].fase).toBe('I drift');
    expect(like.sammenslaatt[0].faseUtelatt).toBe(false);
  });

  test('KI-typer slås sammen, og første kontaktinfo brukes', () => {
    expect(bone.kiType).toEqual(['Prediktiv KI']);
    expect(bone.kontaktinfo).toBe('post@a.no');
  });

  test('rapporten og erstattet-tabellen', () => {
    expect(sammenslaatt).toEqual([
      {
        navn: 'BoneView',
        id: 'b1',
        varianter: ['BoneView 1', 'BoneView 2', 'BoneView 3'],
        beskrivelser: 2,
        faseUtelatt: true,
        fagomradeUlikt: false,
      },
    ]);
    expect(erstattet).toEqual({ b2: 'b1', b3: 'b1' });
  });

  test('et navn med tall alene er ingen variant', () => {
    expect(slaaSammenVarianter([tiltak('NFIs prosjekt 2025')]).sammenslaatt).toEqual([]);
  });
});

describe('settVisningsnavn', () => {
  const tabell = { '1': { navn: 'Helse A HF', forslag: true }, '2': { registernavn: 'HF B' } };

  test('navnet slås opp på orgnr, og manglende meldes', () => {
    const { tiltak: t, mangler } = settVisningsnavn(
      tiltak('X', {
        virksomheter: [
          { navn: 'HELSE A HF', orgnr: '1' },
          { navn: 'HF B', orgnr: '2' },
          { navn: 'Uten nummer' },
        ],
      }),
      tabell,
    );
    expect(t.virksomheter.map((v) => v.navn)).toEqual(['Helse A HF', 'HF B', 'Uten nummer']);
    expect(mangler.map((v) => v.navn)).toEqual(['HF B', 'Uten nummer']);
  });
});

describe('oppdaterIdAlias', () => {
  test('ny id matches på navn, og tabellen peker til den nye', () => {
    const r = oppdaterIdAlias({
      forrige: [{ id: 'gammel', navn: 'Artsoraklet' }],
      publisert: [{ id: 'ny', navn: 'Artsoraklet' }],
      alias: {},
    });
    expect(r.alias).toEqual({ gammel: 'ny' });
    expect(r.nyId).toEqual([{ navn: 'Artsoraklet', fra: 'gammel', til: 'ny' }]);
  });

  test('samler opp over flere importer: A→B og B→C blir A→C', () => {
    const r = oppdaterIdAlias({
      forrige: [{ id: 'B', navn: 'Artsoraklet' }],
      publisert: [{ id: 'C', navn: 'Artsoraklet' }],
      alias: { A: 'B' },
    });
    expect(r.alias).toEqual({ A: 'C', B: 'C' });
  });

  test('uendret id gir ingen endring og beholder tabellen', () => {
    const r = oppdaterIdAlias({
      forrige: [{ id: 'C', navn: 'Artsoraklet' }],
      publisert: [{ id: 'C', navn: 'Artsoraklet' }],
      alias: { A: 'C' },
    });
    expect(r.nyId).toEqual([]);
    expect(r.alias).toEqual({ A: 'C' });
  });

  test('en variant som er slått sammen, følger sammenslåingen', () => {
    const r = oppdaterIdAlias({
      forrige: [{ id: 'b2', navn: 'BoneView 2' }],
      publisert: [{ id: 'b1', navn: 'BoneView' }],
      alias: {},
      erstattet: { b2: 'b1' },
    });
    expect(r.alias).toEqual({ b2: 'b1' });
  });

  test('uten treff forsvinner tiltaket, og mål som ikke er publisert fjernes', () => {
    const r = oppdaterIdAlias({
      forrige: [{ id: 'x', navn: 'Borte' }],
      publisert: [{ id: 'y', navn: 'Annet' }],
      alias: { gammel: 'x' },
    });
    expect(r.forsvunnet).toEqual(['Borte']);
    expect(r.fjernet).toEqual(['gammel']);
    expect(r.alias).toEqual({});
  });

  test('to tiltak med samme navn gir ingen gjetning', () => {
    const r = oppdaterIdAlias({
      forrige: [{ id: 'x', navn: 'KI-lab' }],
      publisert: [
        { id: 'y', navn: 'KI-lab' },
        { id: 'z', navn: 'KI-lab' },
      ],
      alias: {},
    });
    expect(r.forsvunnet).toEqual(['KI-lab']);
  });

  test('en gammel id som er i bruk igjen, fjernes fra tabellen', () => {
    const r = oppdaterIdAlias({ forrige: [], publisert: [{ id: 'A', navn: 'X' }], alias: { A: 'B' } });
    expect(r.alias).toEqual({});
  });
});

describe('finnTiltak', () => {
  const liste = [{ id: 'ny' }];
  test('direkte, via gammel id, og ukjent', () => {
    expect(finnTiltak('ny', liste, {})).toEqual({ tiltak: liste[0], gammelId: false });
    expect(finnTiltak('gammel', liste, { gammel: 'ny' })).toEqual({ tiltak: liste[0], gammelId: true });
    expect(finnTiltak('ukjent', liste, { gammel: 'ny' })).toBeNull();
  });
});

describe('normaliserTiltak', () => {
  test('tåler registerets form: lister, null og plassholdere', () => {
    expect(
      normaliserTiltak({
        id: 'a',
        navn: 'BoneView',
        virksomhet: ['Helse A HF', 'Helse B HF'],
        orgnr: ['1', '2'],
        fagomrade: null,
        beskrivelse: 'NA',
        fase: null,
        kiType: [],
        leveranse: null,
        kontaktinfo: ' ',
      }),
    ).toEqual({
      id: 'a',
      navn: 'BoneView',
      virksomheter: ['Helse A HF', 'Helse B HF'],
      orgnr: ['1', '2'],
      fagomrade: '',
      beskrivelse: '',
    });
  });

  test('én virksomhet som tekst', () => {
    const t = normaliserTiltak({ id: 'a', navn: 'X', virksomhet: 'Entur AS', orgnr: '917422575' });
    expect(t.virksomheter).toEqual(['Entur AS']);
    expect(t.orgnr).toEqual(['917422575']);
  });

  test('ukjent fase kaster fortsatt', () => {
    expect(() => normaliserTiltak({ id: 'a', navn: 'X', fase: 'Ferdig' })).toThrow(/Ukjent fase på X/);
  });
});

describe('tilFilformat', () => {
  test('én virksomhet som tekst, flere som liste, og felt uten verdi utelates', () => {
    expect(
      tilFilformat(tiltak('X', { id: 'a', virksomheter: [{ navn: 'A', orgnr: '1' }], fagomrade: 'Arbeid' })),
    ).toEqual({ id: 'a', navn: 'X', virksomhet: 'A', orgnr: '1', fagomrade: 'Arbeid' });
    const flere = tilFilformat(
      tiltak('Y', {
        virksomheter: [
          { navn: 'A', orgnr: '1' },
          { navn: 'B', orgnr: '2' },
        ],
      }),
    );
    expect([flere.virksomhet, flere.orgnr]).toEqual([
      ['A', 'B'],
      ['1', '2'],
    ]);
  });

  test('fast feltrekkefølge', () => {
    const ut = tilFilformat(
      tiltak('X', { kontaktinfo: 'post@x.no', fase: 'I drift', virksomheter: [{ navn: 'A', orgnr: '1' }] }),
    );
    expect(Object.keys(ut)).toEqual(['id', 'navn', 'virksomhet', 'orgnr', 'fase', 'kontaktinfo']);
  });
});
