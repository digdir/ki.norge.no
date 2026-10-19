import { describe, expect, test } from 'vitest';
import { parseMerkelapp, isFlerDager, formatHendelseDato, hendelseTilEventCard, tidligereTomTekst } from './kalender';

describe('parseMerkelapp', () => {
  test('splits comma-separated values and trims', () => {
    expect(parseMerkelapp('Frokostseminar, Offentlig , Politiet')).toEqual(['Frokostseminar', 'Offentlig', 'Politiet']);
  });
  test('empty/undefined gives an empty list', () => {
    expect(parseMerkelapp(undefined)).toEqual([]);
    expect(parseMerkelapp('')).toEqual([]);
    expect(parseMerkelapp('  ,  ')).toEqual([]);
  });
});

describe('formatHendelseDato', () => {
  test('single day gives a day without a trailing period', () => {
    expect(formatHendelseDato('2026-06-16T00:00:00')).toEqual({ day: '16', month: 'juni', year: '2026' });
  });
  test('multi-day gives a range in day', () => {
    expect(formatHendelseDato('2026-06-16T00:00:00', '2026-06-17T00:00:00'))
      .toEqual({ day: '16. — 17', month: 'juni', year: '2026' });
  });
  test('equal start and end counts as single day', () => {
    expect(formatHendelseDato('2026-06-16T00:00:00', '2026-06-16T00:00:00').day).toBe('16');
  });
  test('empty start date gives empty fields', () => {
    expect(formatHendelseDato('')).toEqual({ day: '', month: '', year: '' });
  });
});

describe('isFlerDager', () => {
  test('without an end date is false', () => {
    expect(isFlerDager('2026-06-16T00:00:00')).toBe(false);
  });
  test('end date on another day is true', () => {
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

  test('kort variant: title, ingress, merkelapp as tags, range date, href', () => {
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

  test('featured variant: title and ingress empty (shown outside the card)', () => {
    const d = hendelseTilEventCard(base, { variant: 'featured' });
    expect(d.title).toBe('');
    expect(d.description).toBe('');
    expect(d.tags).toEqual(['Frokostseminar', 'Offentlig']);
  });

  test('clickable:false drops href (past event)', () => {
    expect(hendelseTilEventCard(base, { clickable: false }).href).toBeUndefined();
  });
});

describe('tidligereTomTekst', () => {
  const naa = new Date('2026-09-03T12:00:00Z');
  const OPPOVER = 'Det tidligere arrangementet er vist øverst på siden.';
  const INGEN = 'Ingen tidligere arrangement.';

  test('featured event has taken place: the tab is empty because it is shown at the top', () => {
    expect(tidligereTomTekst({ startDato: '2026-06-16T09:00:00Z' }, naa)).toBe(OPPOVER);
  });

  test('nothing featured: the tab is empty because the archive is empty', () => {
    expect(tidligereTomTekst(null, naa)).toBe(INGEN);
    expect(tidligereTomTekst(undefined, naa)).toBe(INGEN);
  });

  test('featured event is upcoming: the archive is empty, not lifted', () => {
    expect(tidligereTomTekst({ startDato: '2026-09-07T09:00:00Z' }, naa)).toBe(INGEN);
  });

  test('a multi-day event counts as held only once the end date has passed', () => {
    const overGaar = { startDato: '2026-09-01T09:00:00Z', sluttDato: '2026-09-02T16:00:00Z' };
    const paagaar = { startDato: '2026-09-02T09:00:00Z', sluttDato: '2026-09-04T16:00:00Z' };
    expect(tidligereTomTekst(overGaar, naa)).toBe(OPPOVER);
    expect(tidligereTomTekst(paagaar, naa)).toBe(INGEN);
  });
});
