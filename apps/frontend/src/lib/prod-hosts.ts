// Canonical production URL for the portal. Used as the loc base in the sitemap and
// as the canonical pointer in structured data.
//
// Hardcoded on purpose. SITE_URL from .env is set to http://localhost:4321 in
// dev, and gets baked into the prod builds if we read it from there. The
// canonical domain is ki.norge.no regardless of environment, so it belongs here.
export const CANONICAL_SITE_URL = 'https://ki.norge.no';

// Hosts that count as "production" when an incoming request is evaluated.
// Used to decide whether responses (robots.txt, sitemap.xml) should point to the
// canonical domain or to the request origin (local dev, tt02 preview etc.).
//
// Keep this in sync across endpoints. Both `robots.txt.ts` and
// `sitemap.xml.ts` import from here.
export const PROD_HOSTS = new Set<string>([
  'ki.norge.no',
  'www.ki.norge.no',
  'ki-norge-frontend-prod.digitaliseringsdirektoratet.workers.dev',
]);

export function isProdHost(hostname: string): boolean {
  return PROD_HOSTS.has(hostname);
}
