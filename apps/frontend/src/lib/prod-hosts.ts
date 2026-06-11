// Kanonisk produksjons-URL for portalen. Brukes som loc-base i sitemap og
// som canonical-pekepinn i strukturert data.
//
// Hardkodet med vilje. SITE_URL fra .env settes til http://localhost:4321 i
// dev, og blir bakt inn i prod-byggene hvis vi leser den derfra. Det
// kanoniske domenet er ki.norge.no uansett miljø, så det hører hjemme her.
export const CANONICAL_SITE_URL = 'https://ki.norge.no';

// Verter som regnes som "produksjon" når en innkommende request skal vurderes.
// Brukes til å bestemme om responser (robots.txt, sitemap.xml) skal peke på det
// kanoniske domenet eller på request-origin (lokal dev, tt02-preview osv.).
//
// Hold denne synkronisert på tvers av endepunkter. Begge `robots.txt.ts` og
// `sitemap.xml.ts` importerer herfra.
export const PROD_HOSTS = new Set<string>([
  'ki.norge.no',
  'www.ki.norge.no',
  'ki-norge-frontend-prod.digitaliseringsdirektoratet.workers.dev',
]);

export function isProdHost(hostname: string): boolean {
  return PROD_HOSTS.has(hostname);
}
