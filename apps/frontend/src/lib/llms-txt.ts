/**
 * Generates /llms.txt following the llms.txt convention: H1, a short blockquote that
 * says what the site is, and then sections with markdown links.
 *
 * The content comes from the same crawl as the sitemap, so the two never drift
 * apart. The predecessor was a handwritten English text without links, which drifted from
 * the content as soon as anything was published.
 */
import {
  fetchAllPublishedContent,
  resolveContentUrl,
  type RawContentNode,
} from './umbraco';
import { isExcludedPath } from './sitemap';

type Entry = {
  path: string;
  title: string;
  summary?: string;
};

// Section layout for the output. The order here is the order in the file, and
// it is deliberate: veiledning is what an agent most often answers from.
// Content types not listed here end up under "Andre sider" as long as they have a
// route, so a new type becomes visible instead of disappearing silently.
const SECTIONS: Array<{ heading: string; types: readonly string[] }> = [
  {
    heading: 'Veiledning',
    types: ['veiledninger', 'veiledningGuide', 'veiledningSteg', 'stegartikkel', 'enkelVeiledning'],
  },
  { heading: 'Eksempler', types: ['eksempler', 'eksempel'] },
  { heading: 'Artikler', types: ['artikler', 'artikkel'] },
  { heading: 'Kalender', types: ['kalender', 'kalenderhendelse'] },
  { heading: 'Om nettstedet', types: ['forside', 'omOss', 'sandkasse', 'side'] },
];

const FALLBACK_HEADING = 'Andre sider';
const SUMMARY_MAX_LENGTH = 200;
const CACHE_TTL_MS = 60 * 60 * 1000;

const cache = new Map<string, { expiresAt: number; textPromise: Promise<string> }>();

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

// The ingresses are long enough to drown the link list. Cut at a word boundary.
function truncate(text: string, max = SUMMARY_MAX_LENGTH): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

// Brackets and parentheses would break the markdown link they are in.
function escapeLinkText(text: string): string {
  return text.replaceAll('[', '\\[').replaceAll(']', '\\]');
}

function titleOf(node: RawContentNode): string {
  const p = node.properties ?? {};
  return firstNonEmptyString(p.tittel, p.heroTittel, node.name) ?? 'Uten tittel';
}

// Editorial leftovers exist: one article has a row of underscores as its ingress.
// Without letters the text is noise in a link list, so the summary is dropped.
function hasLetters(text: string): boolean {
  return /\p{L}/u.test(text);
}

function summaryOf(node: RawContentNode): string | undefined {
  const p = node.properties ?? {};
  const raw = firstNonEmptyString(p.ingress, p.seoBeskrivelse, p.heroSubtittel);
  return raw && hasLetters(raw) ? truncate(raw) : undefined;
}

function headingFor(contentType: string): string {
  return SECTIONS.find((s) => s.types.includes(contentType))?.heading ?? FALLBACK_HEADING;
}

// One node to one entry, or null if it does not belong in the list.
// Same two gates as the sitemap: no route, or an excluded path.
async function resolveEntry(node: RawContentNode): Promise<{ heading: string; entry: Entry } | null> {
  try {
    const path = await resolveContentUrl(node);
    if (!path || isExcludedPath(path)) return null;
    return {
      heading: headingFor(node.contentType),
      entry: { path, title: titleOf(node), summary: summaryOf(node) },
    };
  } catch (error) {
    console.error(`[llms.txt] could not resolve node ${node.id}`, error);
    return null;
  }
}

function renderEntry(entry: Entry, baseUrl: string): string {
  const url = new URL(entry.path, baseUrl).toString();
  const link = `- [${escapeLinkText(entry.title)}](${url})`;
  return entry.summary ? `${link}: ${entry.summary}` : link;
}

function renderSection(heading: string, entries: Entry[], baseUrl: string): string {
  // Sorting on path keeps the veiledning steps together under their guide,
  // since the steps inherit the guide's slug in the URL.
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path, 'nb'));
  return [`## ${heading}`, '', ...sorted.map((e) => renderEntry(e, baseUrl)), ''].join('\n');
}

async function generateUncached(baseUrl: string): Promise<string> {
  let nodes: RawContentNode[] = [];
  try {
    nodes = await fetchAllPublishedContent();
  } catch (error) {
    console.error('[llms.txt] content crawl failed', error);
  }

  const resolved = await Promise.all(nodes.map(resolveEntry));

  const byHeading = new Map<string, Entry[]>();
  const seenPaths = new Set<string>();
  for (const item of resolved) {
    if (!item) continue;
    // Several nodes can resolve to the same path (e.g. overview and singleton).
    if (seenPaths.has(item.entry.path)) continue;
    seenPaths.add(item.entry.path);
    const list = byHeading.get(item.heading);
    if (list) list.push(item.entry);
    else byHeading.set(item.heading, [item.entry]);
  }

  const orderedHeadings = [...SECTIONS.map((s) => s.heading), FALLBACK_HEADING];
  const sections = orderedHeadings
    .filter((heading) => byHeading.get(heading)?.length)
    .map((heading) => renderSection(heading, byHeading.get(heading)!, baseUrl));

  return [
    '# KI Norge',
    '',
    '> Nasjonal inngang til offentlig informasjon om ansvarlig og innovativ bruk av',
    '> kunstig intelligens. Drives av Digitaliseringsdirektoratet.',
    '',
    'KI Norge samler veiledning, eksempler og artikler om kunstig intelligens i norsk',
    'offentlig sektor, rettet mot ansatte og beslutningstakere i offentlige',
    'virksomheter. Innholdet er på norsk.',
    '',
    'Denne fila genereres fra publisert innhold i CMS-et og speiler /sitemap.xml.',
    '',
    'Alle sidene under finnes også som markdown: legg til `.md` på slutten av',
    'stien, for eksempel /veiledning.md. Forsiden er /index.md.',
    '',
    '`Accept: text/markdown` virker også, men bare når svaret ikke allerede ligger',
    'i cachen. Bruk .md når du vil være sikker.',
    '',
    ...sections,
    '## Maskinlesbare endepunkter',
    '',
    `- [Sitemap](${new URL('/sitemap.xml', baseUrl)}): alle publiserte URL-er med lastmod`,
    `- [robots.txt](${new URL('/robots.txt', baseUrl)}): crawl-regler og innholdssignaler`,
    `- [Agent skills](${new URL('/.well-known/agent-skills/index.json', baseUrl)}): veiledningene som maskinlesbare skills`,
    '',
  ].join('\n');
}

export async function generateLlmsTxt(baseUrl: string): Promise<string> {
  const key = baseUrl.replace(/\/+$/, '');
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.textPromise;

  const textPromise = generateUncached(baseUrl);
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, textPromise });

  try {
    return await textPromise;
  } catch (error) {
    if (cache.get(key)?.textPromise === textPromise) cache.delete(key);
    throw error;
  }
}
