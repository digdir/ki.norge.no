/**
 * Stikonvertering mellom en vanlig side og markdown-varianten.
 *
 * Ligger i en EGEN modul, uten importer, med vilje. Funksjonene bodde tidligere
 * i html-to-markdown.ts, som importerer linkedom. Da webmcp.ts hentet
 * markdownPathFor derfra, fulgte hele linkedom med inn i klient-bundlen, og
 * hver besøkende lastet ned en DOM-implementasjon for å bruke to strengfunksjoner.
 * WebMCP er dessuten en no-op i nesten alle nettlesere, så byten ble aldri brukt.
 *
 * Legg ingenting hit som trenger DOM eller andre moduler.
 */

/**
 * Stien en agent kan hente som markdown med sin egen cache-nøkkel.
 * `/veiledning` -> `/veiledning.md`, forsiden -> `/index.md`.
 */
export function markdownPathFor(pathname: string): string {
  const clean = pathname.replace(/\/+$/, '');
  return clean ? `${clean}.md` : '/index.md';
}

/**
 * Motsatt vei. Returnerer null når stien ikke er en markdown-variant, slik at
 * middleware kan la alt annet gå urørt.
 */
export function pathFromMarkdownPath(pathname: string): string | null {
  if (!pathname.endsWith('.md')) return null;
  const stripped = pathname.slice(0, -3);
  if (stripped === '' || stripped === '/index') return '/';
  return stripped;
}
