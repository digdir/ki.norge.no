import { buildUrlForContent, type Kalenderhendelse } from './umbraco';

// Norwegian month names. We use a fixed table (not toLocaleString('nb-NO'))
// because ICU locale data is not guaranteed to be available on Cloudflare Workers,
// and toLocaleString can then fall back to English names.
const MANEDER = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

// Merkelapp (alias still "type") is a comma-separated list,
// e.g. "Frokostseminar, Offentlig". Each item becomes a label on the card.
export function parseMerkelapp(value?: string): string[] {
  return (value || '').split(',').map(t => t.trim()).filter(Boolean);
}

export function isFlerDager(startIso: string, endIso?: string): boolean {
  if (!endIso) return false;
  const s = new Date(startIso);
  const e = new Date(endIso);
  return e.getTime() > s.getTime() && e.toDateString() !== s.toDateString();
}

// Range-aware date label. Single day: { day: "16" }. Multi-day: { day: "16. — 17" }.
// EventCard renders "{day}. {month}" + year, so day has no trailing period.
export function formatHendelseDato(startIso: string, endIso?: string): { day: string; month: string; year: string } {
  if (!startIso) return { day: '', month: '', year: '' };
  const start = new Date(startIso);
  const day = String(start.getDate());
  const month = MANEDER[start.getMonth()] ?? '';
  const year = String(start.getFullYear());
  if (isFlerDager(startIso, endIso)) {
    const end = new Date(endIso!);
    return { day: `${day}. — ${end.getDate()}`, month, year };
  }
  return { day, month, year };
}

// A featured event is pulled out of the past list so it isn't duplicated. If the
// only past event is lifted into the hero box, the tab is empty without anything
// missing, and "Ingen tidligere arrangement" contradicts the box right above. Then we point
// upwards instead, as the upcoming tab already does.
// If the featured event is upcoming, the tab is empty because the archive actually is
// empty, and then the original text should stay.
export function tidligereTomTekst(
  featured: Pick<Kalenderhendelse, 'startDato' | 'sluttDato'> | null | undefined,
  naa: Date,
): string {
  const slutt = featured ? new Date(featured.sluttDato || featured.startDato) : null;
  return slutt && slutt < naa
    ? 'Det tidligere arrangementet er vist øverst på siden.'
    : 'Ingen tidligere arrangement.';
}

export interface EventCardData {
  href?: string;
  title: string;
  description: string;
  tags: string[];
  day: string;
  month: string;
  year: string;
  time: string;
  timeNote?: string;
  location: string;
}

// Shared mapping from event to EventCard props. Used by the front page, the calendar list
// and the featured box, so the three cannot drift apart.
// The featured variant shows the title as <h2> and the ingress as a paragraph OUTSIDE the card,
// which is why title/description are left out there (rendered empty, EventCard hides them).
export function hendelseTilEventCard(
  h: Kalenderhendelse,
  opts: { variant?: 'featured' | 'kort'; clickable?: boolean } = {},
): EventCardData {
  const { variant = 'kort', clickable = true } = opts;
  const dato = formatHendelseDato(h.startDato, h.sluttDato);
  return {
    href: clickable
      ? buildUrlForContent({ contentType: 'kalenderhendelse', properties: { slug: h.slug } }, [])
      : undefined,
    title: variant === 'featured' ? '' : h.tittel,
    description: variant === 'featured' ? '' : (h.ingress || ''),
    tags: parseMerkelapp(h.type),
    day: dato.day,
    month: dato.month,
    year: dato.year,
    time: h.tid || '',
    timeNote: isFlerDager(h.startDato, h.sluttDato) ? 'Arrangement over flere dager' : undefined,
    location: h.sted || '',
  };
}
