import {
  getArtikler,
  getEksempler,
  getSider,
  getVeiledningGuider,
  getKalenderhendelser,
  fetchContentAncestorsById,
} from './umbraco';

// Statiske toppsider som ikke har eget innholdsnode med slug, men som
// alltid finnes. Forsiden, oversiktene og singleton-sider.
const STATIC_PATHS = [
  '/',
  '/artikler',
  '/eksempler',
  '/veiledning',
  '/sandkasse',
  '/om-oss',
  '/kalender',
] as const;

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

// Stegartikkel-URLer trenger guide- og steg-slug fra forfedrene i innholdstreet.
// Veiledning-steg har feltet guideSlug allerede, så denne brukes kun for stegartikkel.
async function resolveStegartikkelPath(id: string): Promise<{ path: string; updateDate?: string } | null> {
  const ancestors = await fetchContentAncestorsById(id);
  const guide = ancestors.find(a => a.contentType === 'veiledningGuide');
  const steg = ancestors.find(a => a.contentType === 'veiledningSteg');
  const guideSlug = guide?.properties?.slug as string | undefined;
  const stegSlug = steg?.properties?.slug as string | undefined;
  if (!guideSlug || !stegSlug) return null;
  return { path: `/veiledning/${guideSlug}/${stegSlug}` };
}

async function collectSitemapUrls(publicBaseUrl: string): Promise<SitemapUrl[]> {
  const urls: SitemapUrl[] = STATIC_PATHS.map(path => ({
    loc: toAbsoluteUrl(publicBaseUrl, path),
  }));

  // Hver fetcher kan feile uavhengig (CMS-utfall, nettverksfeil) uten å ta ned hele sitemapet.
  const [
    artikler,
    eksempler,
    sider,
    guider,
    hendelser,
  ] = await Promise.all([
    safeFetch(() => getArtikler(500).then(r => r.data)),
    safeFetch(() => getEksempler({ take: 500 }).then(r => r.data)),
    safeFetch(() => getSider({ take: 500 }).then(r => r.data)),
    safeFetch(() => getVeiledningGuider({ take: 500 }).then(r => r.data)),
    safeFetch(() => getKalenderhendelser().then(r => r.data)),
  ]);

  for (const a of artikler) {
    if (!a.slug) continue;
    urls.push({ loc: toAbsoluteUrl(publicBaseUrl, `/artikler/${a.slug}`), lastmod: toLastModified(a.updatedAt) });
  }
  for (const e of eksempler) {
    if (!e.slug) continue;
    urls.push({ loc: toAbsoluteUrl(publicBaseUrl, `/eksempler/${e.slug}`), lastmod: toLastModified(e.updatedAt) });
  }
  for (const s of sider) {
    if (!s.slug) continue;
    urls.push({ loc: toAbsoluteUrl(publicBaseUrl, `/${s.slug}`), lastmod: toLastModified(s.updatedAt) });
  }
  for (const g of guider) {
    if (!g.slug) continue;
    urls.push({ loc: toAbsoluteUrl(publicBaseUrl, `/veiledning/${g.slug}`), lastmod: toLastModified(g.updatedAt) });
  }
  for (const h of hendelser) {
    if (!h.slug) continue;
    urls.push({ loc: toAbsoluteUrl(publicBaseUrl, `/kalender/${h.slug}`), lastmod: toLastModified(h.updatedAt) });
  }

  // enkelVeiledning, veiledningSteg og stegartikkel hentes via Delivery API direkte siden de ikke
  // har egne high-level getters i umbraco.ts. Bruker fetch direkte mot collection-endepunktet.
  // enkelVeiledning og veiledningGuide deler ruten /veiledning/{slug} (se shared/content-routes.json);
  // dedupeAndSort filtrerer eventuelle slug-kollisjoner mellom typene.
  const [enkelVeiledninger, veiledningSteg, stegartikler] = await Promise.all([
    safeFetchRaw('enkelVeiledning'),
    safeFetchRaw('veiledningSteg'),
    safeFetchRaw('stegartikkel'),
  ]);

  for (const v of enkelVeiledninger) {
    const slug = v.properties?.slug as string | undefined;
    if (!slug) continue;
    urls.push({
      loc: toAbsoluteUrl(publicBaseUrl, `/veiledning/${slug}`),
      lastmod: toLastModified(v.updateDate),
    });
  }

  for (const step of veiledningSteg) {
    const slug = step.properties?.slug as string | undefined;
    const guideSlug = step.properties?.guideSlug as string | undefined;
    if (!slug || !guideSlug) continue;
    urls.push({
      loc: toAbsoluteUrl(publicBaseUrl, `/veiledning/${guideSlug}/${slug}`),
      lastmod: toLastModified(step.updateDate),
    });
  }

  // Stegartikkel krever forfedrene for å bygge hele URL-en. Henter dem parallelt.
  const stegartikkelEntries = await Promise.all(
    stegartikler.map(async (item) => {
      const slug = item.properties?.slug as string | undefined;
      if (!slug) return null;
      const parent = await resolveStegartikkelPath(item.id);
      if (!parent) return null;
      return {
        loc: toAbsoluteUrl(publicBaseUrl, `${parent.path}/${slug}`),
        lastmod: toLastModified(item.updateDate),
      };
    }),
  );
  for (const entry of stegartikkelEntries) {
    if (entry) urls.push(entry);
  }

  return dedupeAndSort(urls);
}

function dedupeAndSort(urls: SitemapUrl[]): SitemapUrl[] {
  const byLoc = new Map<string, SitemapUrl>();
  for (const url of urls) {
    const existing = byLoc.get(url.loc);
    // Behold den nyeste lastmod om samme URL dukker opp flere ganger.
    if (!existing || (url.lastmod && (!existing.lastmod || url.lastmod > existing.lastmod))) {
      byLoc.set(url.loc, url);
    }
  }
  return [...byLoc.values()].sort((a, b) => a.loc.localeCompare(b.loc));
}

async function safeFetch<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (error) {
    console.error('[sitemap] fetch failed', error);
    return [];
  }
}

type RawItem = { id: string; updateDate?: string; properties?: Record<string, unknown> };

async function safeFetchRaw(contentType: string): Promise<RawItem[]> {
  const UMBRACO_URL = process.env.UMBRACO_URL || import.meta.env.UMBRACO_URL || 'http://localhost:5000';
  const url = `${UMBRACO_URL}/umbraco/delivery/api/v2/content?filter=contentType:${contentType}&take=500`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json() as { items?: RawItem[] };
    return data.items ?? [];
  } catch (error) {
    console.error(`[sitemap] raw fetch failed for ${contentType}`, error);
    return [];
  }
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
