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
