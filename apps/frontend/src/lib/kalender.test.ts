import { describe, expect, test } from 'vitest';
import { parseMerkelapp, isFlerDager, formatHendelseDato, hendelseTilEventCard, tidligereTomTekst } from './kalender';

describe('parseMerkelapp', () => {
  test('splitter kommaseparert og trimmer', () => {
    expect(parseMerkelapp('Frokostseminar, Offentlig , Politiet')).toEqual(['Frokostseminar', 'Offentlig', 'Politiet']);
  });
  test('tom/undefined gir tom liste', () => {
    expect(parseMerkelapp(undefined)).toEqual([]);
    expect(parseMerkelapp('')).toEqual([]);
    expect(parseMerkelapp('  ,  ')).toEqual([]);
  });
});

describe('formatHendelseDato', () => {
  test('endags gir dag uten etterstilt punktum', () => {
    expect(formatHendelseDato('2026-06-16T00:00:00')).toEqual({ day: '16', month: 'juni', year: '2026' });
  });
  test('flerdags gir range i day', () => {
    expect(formatHendelseDato('2026-06-16T00:00:00', '2026-06-17T00:00:00'))
      .toEqual({ day: '16. — 17', month: 'juni', year: '2026' });
  });
  test('lik start og slutt regnes som endags', () => {
    expect(formatHendelseDato('2026-06-16T00:00:00', '2026-06-16T00:00:00').day).toBe('16');
  });
  test('tom startdato gir tomme felt', () => {
    expect(formatHendelseDato('')).toEqual({ day: '', month: '', year: '' });
  });
});

describe('isFlerDager', () => {
  test('uten sluttdato er false', () => {
    expect(isFlerDager('2026-06-16T00:00:00')).toBe(false);
  });
  test('sluttdato paa annen dag er true', () => {
    expect(isFlerDager('2026-06-16T00:00:00', '2026-06-18T00:00:00')).toBe(true);
  });
});

describe('hendelseTilEventCard', () => {
  const base = {
    id: '1', documentId: '1', tittel: 'Bærekraftseminar', slug: 'baerekraftseminar',
    type: 'Frokostseminar, Offentlig', ingress: 'Om grøn teknologi.',
    startDato: '2026-06-16T00:00:00', sluttDato: '2026-06-17T00:00:00',
    tid: '09:00-16:00', sted: 'Digitalt',
    createdAt: '', updatedAt: '', publishedAt: '', locale: 'nb-NO',
  } as never;

  test('kort-variant: tittel, ingress, merkelapp som tags, range-dato, href', () => {
    expect(hendelseTilEventCard(base)).toEqual({
      href: '/kalender/baerekraftseminar',
      title: 'Bærekraftseminar',
      description: 'Om grøn teknologi.',
      tags: ['Frokostseminar', 'Offentlig'],
      day: '16. — 17', month: 'juni', year: '2026',
      time: '09:00-16:00',
      timeNote: 'Arrangement over flere dager',
      location: 'Digitalt',
    });
  });

  test('featured-variant: tittel og ingress tomme (vises utenfor kortet)', () => {
    const d = hendelseTilEventCard(base, { variant: 'featured' });
    expect(d.title).toBe('');
    expect(d.description).toBe('');
    expect(d.tags).toEqual(['Frokostseminar', 'Offentlig']);
  });

  test('clickable:false dropper href (tidligere arrangement)', () => {
    expect(hendelseTilEventCard(base, { clickable: false }).href).toBeUndefined();
  });
});

describe('tidligereTomTekst', () => {
  const naa = new Date('2026-09-03T12:00:00Z');
  const OPPOVER = 'Det tidligere arrangementet er vist øverst på siden.';
  const INGEN = 'Ingen tidligere arrangement.';

  test('fremhevet hendelse er avholdt: fanen er tom fordi den står øverst', () => {
    expect(tidligereTomTekst({ startDato: '2026-06-16T09:00:00Z' }, naa)).toBe(OPPOVER);
  });

  test('ingenting fremhevet: fanen er tom fordi arkivet er tomt', () => {
    expect(tidligereTomTekst(null, naa)).toBe(INGEN);
    expect(tidligereTomTekst(undefined, naa)).toBe(INGEN);
  });

  test('fremhevet hendelse er kommende: arkivet er tomt, ikke løftet', () => {
    expect(tidligereTomTekst({ startDato: '2026-09-07T09:00:00Z' }, naa)).toBe(INGEN);
  });

  test('flerdagers teller som avholdt først når sluttdatoen er passert', () => {
    const overGaar = { startDato: '2026-09-01T09:00:00Z', sluttDato: '2026-09-02T16:00:00Z' };
    const paagaar = { startDato: '2026-09-02T09:00:00Z', sluttDato: '2026-09-04T16:00:00Z' };
    expect(tidligereTomTekst(overGaar, naa)).toBe(OPPOVER);
    expect(tidligereTomTekst(paagaar, naa)).toBe(INGEN);
  });
});
