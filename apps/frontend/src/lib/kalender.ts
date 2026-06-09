import type { Kalenderhendelse } from './umbraco';

// Norske maanedsnavn. Vi bruker en fast tabell (ikke toLocaleString('nb-NO'))
// fordi ICU-locale-data ikke er garantert tilgjengelig paa Cloudflare Workers,
// og toLocaleString da kan falle tilbake til engelske navn.
const MANEDER = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

// Merkelapp (alias fortsatt "type") er en kommaseparert liste,
// f.eks. "Frokostseminar, Offentlig". Hvert ledd blir en merkelapp paa kortet.
export function parseMerkelapp(value?: string): string[] {
  return (value || '').split(',').map(t => t.trim()).filter(Boolean);
}

export function isFlerDager(startIso: string, endIso?: string): boolean {
  if (!endIso) return false;
  const s = new Date(startIso);
  const e = new Date(endIso);
  return e.getTime() > s.getTime() && e.toDateString() !== s.toDateString();
}

// Range-aware datolabel. Endags: { day: "16" }. Flerdags: { day: "16. — 17" }.
// EventCard rendrer "{day}. {month}" + year, saa day har ikke etterstilt punktum.
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

// Felles mapping fra hendelse til EventCard-props. Brukt av forside, kalender-liste
// og featured-boks, saa de tre ikke kan drifte fra hverandre.
// featured-varianten viser tittel som <h2> og ingress som paragraf UTENFOR kortet,
// derfor utelates title/description der (rendres tomme, EventCard skjuler dem).
export function hendelseTilEventCard(
  h: Kalenderhendelse,
  opts: { variant?: 'featured' | 'kort'; clickable?: boolean } = {},
): EventCardData {
  const { variant = 'kort', clickable = true } = opts;
  const dato = formatHendelseDato(h.startDato, h.sluttDato);
  return {
    href: clickable ? `/kalender/${h.slug}` : undefined,
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
