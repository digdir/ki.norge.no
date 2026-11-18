import { describe, expect, test } from 'vitest';
import { eventHasEnded } from './event-time';

describe('eventHasEnded', () => {
  test('uses the event end time in Europe/Oslo', () => {
    expect(eventHasEnded('2026-06-17T00:00:00', '09:00-16:00', new Date('2026-06-17T13:59:00Z'))).toBe(false);
    expect(eventHasEnded('2026-06-17T00:00:00', '09:00-16:00', new Date('2026-06-17T14:00:00Z'))).toBe(true);
  });

  test('keeps a stream visible throughout the final day when no valid end time is given', () => {
    expect(eventHasEnded('2026-06-17T00:00:00', 'Hele dagen', new Date('2026-06-17T21:59:00Z'))).toBe(false);
    expect(eventHasEnded('2026-06-17T00:00:00', undefined, new Date('2026-06-17T22:00:00Z'))).toBe(true);
    expect(eventHasEnded('2026-06-17T00:00:00', '09:00-25:00', new Date('2026-06-17T21:00:00Z'))).toBe(false);
  });

  test('uses the final date of a multi-day event', () => {
    expect(eventHasEnded('2026-06-18T00:00:00', '09:00-16:00', new Date('2026-06-17T14:00:00Z'))).toBe(false);
    expect(eventHasEnded('2026-06-18T00:00:00', '09:00-16:00', new Date('2026-06-18T14:00:00Z'))).toBe(true);
  });
});
