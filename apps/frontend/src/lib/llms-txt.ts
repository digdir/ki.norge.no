/**
 * Genererer /llms.txt etter llms.txt-konvensjonen: H1, en kort blockquote som
 * sier hva nettstedet er, og deretter seksjoner med markdown-lenker.
 *
 * Innholdet hentes fra samme crawl som sitemapet, slik at de to aldri kommer i
 * utakt. Forgjengeren var en håndskrevet engelsk tekst uten lenker, som drev fra
 * innholdet med en gang noe ble publisert.
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

// Seksjonsinndeling for utskriften. Rekkefølgen her er rekkefølgen i fila, og
// den er bevisst: veiledning er det en agent oftest skal svare ut fra.
// Innholdstyper som ikke står her havner under "Andre sider" så lenge de har en
// rute, slik at en ny type blir synlig i stedet for å forsvinne stille.
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

// Ingressene er lange nok til å drukne lenkelista. Kutt på ordgrense.
function truncate(text: string, max = SUMMARY_MAX_LENGTH): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

// Klammer og parenteser ville brutt markdown-lenka de står i.
function escapeLinkText(text: string): string {
  return text.replaceAll('[', '\\[').replaceAll(']', '\\]');
}

function titleOf(node: RawContentNode): string {
  const p = node.properties ?? {};
  return firstNonEmptyString(p.tittel, p.heroTittel, node.name) ?? 'Uten tittel';
}

// Redaksjonelle rester finnes: én artikkel har en rad understreker som ingress.
// Uten bokstaver er teksten støy i en lenkeliste, så da droppes sammendraget.
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

// Ett node til én oppføring, eller null om det ikke hører hjemme i lista.
// Samme to porter som sitemapet: ingen rute, eller ekskludert sti.
async function resolveEntry(node: RawContentNode): Promise<{ heading: string; entry: Entry } | null> {
  try {
    const path = await resolveContentUrl(node);
    if (!path || isExcludedPath(path)) return null;
    return {
      heading: headingFor(node.contentType),
      entry: { path, title: titleOf(node), summary: summaryOf(node) },
    };
  } catch (error) {
    console.error(`[llms.txt] kunne ikke resolve node ${node.id}`, error);
    return null;
  }
}

function renderEntry(entry: Entry, baseUrl: string): string {
  const url = new URL(entry.path, baseUrl).toString();
  const link = `- [${escapeLinkText(entry.title)}](${url})`;
  return entry.summary ? `${link}: ${entry.summary}` : link;
}

function renderSection(heading: string, entries: Entry[], baseUrl: string): string {
  // Sortering på sti holder veiledningsstegene samlet under guiden sin,
  // siden stegene arver guidens slug i URL-en.
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path, 'nb'));
  return [`## ${heading}`, '', ...sorted.map((e) => renderEntry(e, baseUrl)), ''].join('\n');
}

async function generateUncached(baseUrl: string): Promise<string> {
  let nodes: RawContentNode[] = [];
  try {
    nodes = await fetchAllPublishedContent();
  } catch (error) {
    console.error('[llms.txt] crawl av innhold feilet', error);
  }

  const resolved = await Promise.all(nodes.map(resolveEntry));

  const byHeading = new Map<string, Entry[]>();
  const seenPaths = new Set<string>();
  for (const item of resolved) {
    if (!item) continue;
    // Flere noder kan resolve til samme sti (f.eks. oversikt og singleton).
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
