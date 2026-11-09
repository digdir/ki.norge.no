// Live window for digital events (#926).
//
// The live stream and the interaction sit at the top of the event page from
// direktesendingStart to direktesendingSlutt, and are removed automatically
// afterwards. The page is cached at the edge for up to 10 minutes
// (CACHE_MAX_AGE in middleware.ts), so the server cannot alone decide what is
// shown at a given minute. Hence two layers:
//
// 1. The server renders the hero from FORHAANDSVISNING_MS before start, hidden,
//    so any cached copy made close to start already contains it.
// 2. A client script reveals it at start and removes it at the end, also on a
//    page that has been open for a while.

import { parseInteraksjonUrl, parseVideoUrl, type InteraksjonEmbed, type VideoEmbed } from './video-embed';

/** Longer than the edge cache, so a copy cached before this point has expired by start. */
export const FORHAANDSVISNING_MS = 15 * 60 * 1000;

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/;
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

// Last Sunday of a month, as a UTC day of month.
function lastSunday(year: number, month: number): number {
  const last = new Date(Date.UTC(year, month + 1, 0));
  return last.getUTCDate() - last.getUTCDay();
}

// EU rule: summer time from 01:00 UTC on the last Sunday of March to 01:00 UTC on
// the last Sunday of October. Computed by hand, because ICU time zone data is not
// guaranteed on Cloudflare Workers (see kalender.ts).
function osloOffsetMs(utcMs: number): number {
  const year = new Date(utcMs).getUTCFullYear();
  const summerStart = Date.UTC(year, 2, lastSunday(year, 2), 1);
  const summerEnd = Date.UTC(year, 9, lastSunday(year, 9), 1);
  return utcMs >= summerStart && utcMs < summerEnd ? 2 * 3600_000 : 3600_000;
}

/**
 * Umbraco date pickers return wall time without an offset ("2026-12-10T09:00:00"),
 * which the editor entered as Norwegian time. Workers run in UTC, so new Date() would
 * place it one or two hours late. Strings with an explicit offset are respected.
 * Also accepts { date } from the date picker with time zone.
 */
export function parseOsloDateTime(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'date' in value) return parseOsloDateTime((value as { date: unknown }).date);
  if (typeof value !== 'string' || !value.trim()) return null;
  const s = value.trim();
  if (HAS_OFFSET.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = NAIVE.exec(s);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', se = '0'] = m;
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  // Wall time minus offset, then check the offset at the result (correct around DST changes).
  let utc = wall - osloOffsetMs(wall);
  utc = wall - osloOffsetMs(utc);
  return new Date(utc);
}

/** Midnight Oslo time at the start of the day after the given date. */
function sluttenAvDagen(value: string | undefined): Date | null {
  const m = value ? NAIVE.exec(value.slice(0, 10)) : null;
  if (!m) return null;
  const next = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 1));
  return parseOsloDateTime(next.toISOString().slice(0, 10));
}

export interface DigitaltArrangementFelt {
  startDato: string;
  sluttDato?: string;
  direktesendingUrl?: string;
  interaksjonUrl?: string;
  direktesendingStart?: string;
  direktesendingSlutt?: string;
}

export interface Direktesending {
  video: VideoEmbed;
  interaksjon: InteraksjonEmbed | null;
  start: Date;
  slutt: Date;
}

/** Null when there is no valid live stream link or the window is empty. */
export function direktesending(h: DigitaltArrangementFelt): Direktesending | null {
  const video = parseVideoUrl(h.direktesendingUrl);
  if (!video) return null;
  const start = parseOsloDateTime(h.direktesendingStart) ?? parseOsloDateTime(h.startDato?.slice(0, 10));
  const slutt = parseOsloDateTime(h.direktesendingSlutt) ?? sluttenAvDagen(h.sluttDato || h.startDato);
  if (!start || !slutt || slutt.getTime() <= start.getTime()) return null;
  return { video, interaksjon: parseInteraksjonUrl(h.interaksjonUrl), start, slutt };
}

export type DirektesendingStatus = 'senere' | 'snart' | 'aktiv' | 'over';

/**
 * senere: more than FORHAANDSVISNING_MS before start, the hero is not rendered.
 * snart: rendered hidden, the client script reveals it at start.
 * aktiv: rendered visible.
 * over: not rendered.
 */
export function direktesendingStatus(d: Pick<Direktesending, 'start' | 'slutt'>, naa: Date): DirektesendingStatus {
  const t = naa.getTime();
  if (t >= d.slutt.getTime()) return 'over';
  if (t >= d.start.getTime()) return 'aktiv';
  if (t >= d.start.getTime() - FORHAANDSVISNING_MS) return 'snart';
  return 'senere';
}
