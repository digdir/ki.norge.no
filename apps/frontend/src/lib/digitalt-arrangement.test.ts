import { describe, expect, test } from 'vitest';
import { direktesending, direktesendingStatus, parseOsloDateTime, FORHAANDSVISNING_MS } from './digitalt-arrangement';

describe('parseOsloDateTime', () => {
  test('naive wall time is Norwegian winter time (UTC+1)', () => {
    expect(parseOsloDateTime('2026-12-10T09:00:00')?.toISOString()).toBe('2026-12-10T08:00:00.000Z');
  });
  test('naive wall time is Norwegian summer time (UTC+2)', () => {
    expect(parseOsloDateTime('2026-06-16T09:30:00')?.toISOString()).toBe('2026-06-16T07:30:00.000Z');
  });
  test('date only is midnight Oslo time', () => {
    expect(parseOsloDateTime('2026-12-10')?.toISOString()).toBe('2026-12-09T23:00:00.000Z');
  });
  test('around the DST change', () => {
    // 29 March 2026: 02:00 -> 03:00. 01:30 is still winter time, 03:30 is summer time.
    expect(parseOsloDateTime('2026-03-29T01:30:00')?.toISOString()).toBe('2026-03-29T00:30:00.000Z');
    expect(parseOsloDateTime('2026-03-29T03:30:00')?.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    // 25 October 2026: 03:00 -> 02:00.
    expect(parseOsloDateTime('2026-10-25T04:00:00')?.toISOString()).toBe('2026-10-25T03:00:00.000Z');
  });
  test('explicit offset is respected', () => {
    expect(parseOsloDateTime('2026-12-10T09:00:00Z')?.toISOString()).toBe('2026-12-10T09:00:00.000Z');
    expect(parseOsloDateTime('2026-12-10T09:00:00+01:00')?.toISOString()).toBe('2026-12-10T08:00:00.000Z');
    expect(parseOsloDateTime({ date: '2026-12-10T09:00:00+01:00', timeZone: 'Europe/Oslo' })?.toISOString())
      .toBe('2026-12-10T08:00:00.000Z');
  });
  test('garbage gives null', () => {
    expect(parseOsloDateTime(undefined)).toBeNull();
    expect(parseOsloDateTime('')).toBeNull();
    expect(parseOsloDateTime('i morgen')).toBeNull();
  });
});

describe('direktesending', () => {
  const base = { startDato: '2026-12-10T00:00:00', direktesendingUrl: 'https://vimeo.com/event/4567890' };

  test('null without a valid live stream link', () => {
    expect(direktesending({ startDato: '2026-12-10T00:00:00' })).toBeNull();
    expect(direktesending({ ...base, direktesendingUrl: 'https://evil.example/x' })).toBeNull();
  });
  test('uses the explicit window', () => {
    const d = direktesending({
      ...base,
      interaksjonUrl: 'https://app.sli.do/event/abc123',
      direktesendingStart: '2026-12-10T08:30:00',
      direktesendingSlutt: '2026-12-10T12:15:00',
    });
    expect(d?.start.toISOString()).toBe('2026-12-10T07:30:00.000Z');
    expect(d?.slutt.toISOString()).toBe('2026-12-10T11:15:00.000Z');
    expect(d?.interaksjon?.provider).toBe('slido');
  });
  test('falls back to the whole day of the event', () => {
    const d = direktesending(base);
    expect(d?.start.toISOString()).toBe('2026-12-09T23:00:00.000Z');
    expect(d?.slutt.toISOString()).toBe('2026-12-10T23:00:00.000Z');
    expect(d?.interaksjon).toBeNull();
  });
  test('multi-day fallback ends after the last day', () => {
    const d = direktesending({ ...base, sluttDato: '2026-12-11T00:00:00' });
    expect(d?.slutt.toISOString()).toBe('2026-12-11T23:00:00.000Z');
  });
  test('an end before the start gives null', () => {
    expect(direktesending({ ...base, direktesendingStart: '2026-12-10T12:00:00', direktesendingSlutt: '2026-12-10T11:00:00' })).toBeNull();
  });
});

describe('direktesendingStatus', () => {
  const vindu = { start: new Date('2026-12-10T08:00:00Z'), slutt: new Date('2026-12-10T11:00:00Z') };
  const at = (ms: number) => new Date(vindu.start.getTime() + ms);

  test('the four states', () => {
    expect(direktesendingStatus(vindu, at(-FORHAANDSVISNING_MS - 1))).toBe('senere');
    expect(direktesendingStatus(vindu, at(-FORHAANDSVISNING_MS))).toBe('snart');
    expect(direktesendingStatus(vindu, at(-1))).toBe('snart');
    expect(direktesendingStatus(vindu, vindu.start)).toBe('aktiv');
    expect(direktesendingStatus(vindu, new Date(vindu.slutt.getTime() - 1))).toBe('aktiv');
    expect(direktesendingStatus(vindu, vindu.slutt)).toBe('over');
  });
});
