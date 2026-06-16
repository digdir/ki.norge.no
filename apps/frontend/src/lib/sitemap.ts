import {
  fetchAllPublishedContent,
  resolveContentUrl,
  type RawContentNode,
} from './umbraco';

// Innholdstyper som har en rute i content-routes.json, men som aldri skal
// indekseres. Speiler robots.txt på alias-nivå. Tom i dag — mekanismen står
// klar hvis en slik type dukker opp (match på alias er mer robust enn på sti).
export const EXCLUDED_CONTENT_TYPES = new Set<string>([]);

// Sti-prefikser som aldri skal i sitemap. Speiler Disallow-listen i
// src/pages/robots.txt.ts. Hold de to listene synkronisert (én delt konstant
// kan vurderes i en senere runde). Brukes som fallback når et innholdsnode
// likevel resolver til en reservert sti (f.eks. en `side` med slug "status").
export const EXCLUDED_PATH_PREFIXES = [
  '/sok',
  '/media',
  '/admin-tilgang',
  '/preview-tilgang',
  '/status',
  '/api',
  '/503',
  '/404',
] as const;

// Rene .astro-sider uten CMS-node bak seg. Tom i dag — alle statiske toppsider
// er dekket av singleton-innholdstyper (forside, omOss, oversiktene), som
// crawlen plukker opp. sitemap-pages.test.ts vokter at en ny kun-kode-side
// får en bevisst sitemap-beslutning i stedet for å falle stille ut.
export const STATIC_ROUTES: string[] = [];

type SitemapUrl = {
  loc: string;
  lastmod?: string;
};

type SitemapCacheEntry = {
  expiresAt: number;
  xmlPromise: Promise<string>;
};

const SITEMAP_CACHE_TTL_MS = 60 * 60 * 1000;
const sitemapXmlCache = new Map<string, SitemapCacheEntry>();

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function toAbsoluteUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

function toLastModified(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function isExcludedPath(path: string): boolean {
  return EXCLUDED_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

// Resolver ett node til en sitemap-URL, eller null om det skal utelates.
// To utelukkelses-porter: ekskludert innholdstype, eller ekskludert sti.
// Per-node feiltoleranse: et enkelt dårlig node (f.eks. ancestor-oppslag som
// feiler) skal ikke tømme hele sitemapet.
async function resolveNode(node: RawContentNode, publicBaseUrl: string): Promise<SitemapUrl | null> {
  try {
    if (EXCLUDED_CONTENT_TYPES.has(node.contentType)) return null;

    const path = await resolveContentUrl(node);
    if (!path) {
      // Ingen rute for typen, eller ancestor lot seg ikke resolve. Debug-nivå
      // slik at en glemt rute-mapping er synlig uten å være støy i produksjon.
      console.debug(`[sitemap] ingen URL for ${node.contentType} (id=${node.id})`);
      return null;
    }

    if (isExcludedPath(path)) return null;

    return { loc: toAbsoluteUrl(publicBaseUrl, path), lastmod: toLastModified(node.updateDate) };
  } catch (error) {
    console.error(`[sitemap] kunne ikke resolve node ${node.id}`, error);
    return null;
  }
}

async function collectSitemapUrls(publicBaseUrl: string): Promise<SitemapUrl[]> {
  // Inkluder alt som standard. Hele det publiserte treet hentes i én paginert
  // gjennomgang; utelatelse skjer kun gjennom de eksplisitte portene i resolveNode.
  let nodes: RawContentNode[] = [];
  try {
    nodes = await fetchAllPublishedContent();
  } catch (error) {
    console.error('[sitemap] crawl av innhold feilet', error);
  }

  const resolved = await Promise.all(nodes.map((node) => resolveNode(node, publicBaseUrl)));
  const urls: SitemapUrl[] = [];
  for (const entry of resolved) {
    if (entry) urls.push(entry);
  }

  // Statiske, kun-kode-ruter uten CMS-node. Tom i dag, men flettes inn for
  // framtidige sider. Respekter også sti-utelukkelsene her.
  for (const path of STATIC_ROUTES) {
    if (!isExcludedPath(path)) {
      urls.push({ loc: toAbsoluteUrl(publicBaseUrl, path) });
    }
  }

  return dedupeAndSort(urls);
}

function dedupeAndSort(urls: SitemapUrl[]): SitemapUrl[] {
  const byLoc = new Map<string, SitemapUrl>();
  for (const url of urls) {
    const existing = byLoc.get(url.loc);
    // Behold den nyeste lastmod om samme URL dukker opp flere ganger.
    // (Flere noder kan resolve til samme URL, f.eks. kalenderhendelse-oversikt.)
    if (!existing || (url.lastmod && (!existing.lastmod || url.lastmod > existing.lastmod))) {
      byLoc.set(url.loc, url);
    }
  }
  return [...byLoc.values()].sort((a, b) => a.loc.localeCompare(b.loc));
}

function buildSitemapXml(urls: SitemapUrl[]): string {
  const xmlUrls = urls.map(url => {
    const lines = [
      '  <url>',
      `    <loc>${escapeXml(url.loc)}</loc>`,
    ];
    if (url.lastmod) lines.push(`    <lastmod>${escapeXml(url.lastmod)}</lastmod>`);
    lines.push('  </url>');
    return lines.join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    xmlUrls,
    '</urlset>',
  ].join('\n');
}

async function generateSitemapXmlUncached(publicBaseUrl: string): Promise<string> {
  const urls = await collectSitemapUrls(publicBaseUrl);
  return buildSitemapXml(urls);
}

export async function generateSitemapXml(publicBaseUrl: string): Promise<string> {
  const cacheKey = publicBaseUrl.replace(/\/+$/, '');
  const now = Date.now();
  const cached = sitemapXmlCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.xmlPromise;
  }

  const xmlPromise = generateSitemapXmlUncached(publicBaseUrl);
  sitemapXmlCache.set(cacheKey, { expiresAt: now + SITEMAP_CACHE_TTL_MS, xmlPromise });

  try {
    return await xmlPromise;
  } catch (error) {
    if (sitemapXmlCache.get(cacheKey)?.xmlPromise === xmlPromise) {
      sitemapXmlCache.delete(cacheKey);
    }
    throw error;
  }
}
