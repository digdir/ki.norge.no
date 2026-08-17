/**
 * Delte verdier for robots.txt. Ligger i lib slik at både ruta og testene leser
 * det samme, og slik at sitemapets utelukkelsesliste kan sjekkes mot denne.
 */

/**
 * Content Signals: hva innholdet kan brukes til.
 *
 * search    oppføring i søkeresultater
 * ai-input  hentes som kilde når en modell svarer (RAG, grounding)
 * ai-train  brukes til å trene modeller
 *
 * REDAKSJONELL BESLUTNING, ikke en teknisk innstilling. KI Norge publiserer
 * offentlig informasjon som er ment å spres, og portalens eget formål er å gjøre
 * KI-kunnskap tilgjengelig. Derfor ja på alle tre. Skal dette endres, er det
 * Sara og Marie som eier avgjørelsen, ikke koden.
 *
 * SENDES SOM HTTP-HEADER, ikke i robots.txt. Direktivet lå i robots.txt fram til
 * august 2026, men står ikke i robots.txt-spesifikasjonen, så Lighthouse og
 * Search Console forkastet hele fila som ugyldig og SEO-scoren falt til 92.
 * Headeren settes i middleware.ts, kun for prod-hostene.
 *
 * https://contentsignals.org/
 */
export const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=yes';

/**
 * Ruter som ikke skal crawles. Speiler EXCLUDED_PATH_PREFIXES i sitemap.ts;
 * robots-sitemap-sync.test.ts vokter at de to ikke kommer i utakt.
 *
 * Skrivemåten med skråstrek på /media/ og /api/ er bevisst: uten den ville
 * Disallow: /api også truffet en framtidig side som het /api-oversikt.
 */
export const DISALLOWED_PATHS = [
  '/media/',
  '/admin-tilgang',
  '/preview-tilgang',
  '/status',
  '/api/',
  '/503',
  '/404',
] as const;

/**
 * AI-crawlere som får en egen gruppe i robots.txt.
 *
 * Poenget er ikke å begrense dem, de får de samme reglene som alle andre.
 * Poenget er å si det eksplisitt: en agent som leter etter sitt eget navn skal
 * finne et svar i stedet for å måtte gjette ut fra wildcard-gruppen.
 */
export const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'meta-externalagent',
  'Amazonbot',
  'Bytespider',
  'CCBot',
  'cohere-ai',
  'DuckAssistBot',
  'MistralAI-User',
  'YouBot',
] as const;
