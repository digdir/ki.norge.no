import {
  fetchAllPublishedContent,
  resolveContentUrl,
  type RawContentNode,
} from './umbraco';

// Content types that have a route in content-routes.json, but must never
// be indexed. Mirrors robots.txt at alias level. Empty today; the mechanism is
// ready if such a type shows up (matching on alias is more robust than on path).
export const EXCLUDED_CONTENT_TYPES = new Set<string>([]);

// Path prefixes that must never be in the sitemap. Mirrors the Disallow list in
// src/pages/robots.txt.ts. Keep the two lists in sync (one shared constant
// can be considered in a later round). Used as a fallback when a content node
// still resolves to a reserved path (e.g. a `side` with slug "404").
export const EXCLUDED_PATH_PREFIXES = [
  '/media',
  '/preview-tilgang',
  '/api',
  '/503',
  '/404',
] as const;

// Pure .astro pages without a CMS node behind them. /ki-tiltak is code-driven with a
// static dataset, and /ki-tiltak/del is its submission form, so neither has a
// singleton content type to be picked up by. sitemap-pages.test.ts guards that a
// new code-only page gets a deliberate sitemap decision instead of silently dropping out.
export const STATIC_ROUTES: string[] = ['/ki-tiltak', '/ki-tiltak/del'];

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

// Resolves one node to a sitemap URL, or null if it is to be left out.
// Two exclusion gates: excluded content type, or excluded path.
// Per-node fault tolerance: a single bad node (e.g. an ancestor lookup that
// fails) must not empty the whole sitemap.
async function resolveNode(node: RawContentNode, publicBaseUrl: string): Promise<SitemapUrl | null> {
  try {
    if (EXCLUDED_CONTENT_TYPES.has(node.contentType)) return null;

    const path = await resolveContentUrl(node);
    if (!path) {
      // No route for the type, or the ancestor could not be resolved. Debug level
      // so a forgotten route mapping is visible without being noise in production.
      console.debug(`[sitemap] no URL for ${node.contentType} (id=${node.id})`);
      return null;
    }

    if (isExcludedPath(path)) return null;

    return { loc: toAbsoluteUrl(publicBaseUrl, path), lastmod: toLastModified(node.updateDate) };
  } catch (error) {
    console.error(`[sitemap] could not resolve node ${node.id}`, error);
    return null;
  }
}

async function collectSitemapUrls(publicBaseUrl: string): Promise<SitemapUrl[]> {
  // Include everything by default. The whole published tree is fetched in one paginated
  // pass; exclusion only happens through the explicit gates in resolveNode.
  let nodes: RawContentNode[] = [];
  try {
    nodes = await fetchAllPublishedContent();
  } catch (error) {
    console.error('[sitemap] content crawl failed', error);
  }

  const resolved = await Promise.all(nodes.map((node) => resolveNode(node, publicBaseUrl)));
  const urls: SitemapUrl[] = [];
  for (const entry of resolved) {
    if (entry) urls.push(entry);
  }

  // Static, code-only routes without a CMS node, see STATIC_ROUTES above.
  // Respect the path exclusions here too.
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
    // Keep the newest lastmod if the same URL shows up several times.
    // (Several nodes can resolve to the same URL, e.g. the kalenderhendelse overview.)
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
