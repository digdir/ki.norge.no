/**
 * Shared values for robots.txt. Lives in lib so that both the route and the tests read
 * the same thing, and so that the sitemap's exclusion list can be checked against this.
 */

/**
 * Content Signals: what the content may be used for.
 *
 * search    listing in search results
 * ai-input  fetched as a source when a model answers (RAG, grounding)
 * ai-train  used to train models
 *
 * EDITORIAL DECISION, not a technical setting. KI Norge publishes
 * public information that is meant to be spread, and the portal's own purpose is to make
 * AI knowledge available. Hence yes to all three. If this is to change, it is
 * Sara and Marie who own the decision, not the code.
 *
 * SENT AS AN HTTP HEADER, not in robots.txt. The directive was in robots.txt until
 * August 2026, but is not in the robots.txt specification, so Lighthouse and
 * Search Console rejected the whole file as invalid and the SEO score dropped to 92.
 * The header is set in middleware.ts, only for the prod hosts.
 *
 * https://contentsignals.org/
 */
export const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=yes';

/**
 * Routes that must not be crawled. Mirrors EXCLUDED_PATH_PREFIXES in sitemap.ts;
 * robots-sitemap-sync.test.ts guards that the two do not drift apart.
 *
 * The trailing slash on /media/ and /api/ is deliberate: without it
 * Disallow: /api would also hit a future page called /api-oversikt.
 */
export const DISALLOWED_PATHS = [
  '/media/',
  '/preview-tilgang',
  '/api/',
  '/503',
  '/404',
] as const;

/**
 * AI crawlers that get their own group in robots.txt.
 *
 * The point is not to restrict them, they get the same rules as everyone else.
 * The point is to say it explicitly: an agent looking for its own name should
 * find an answer instead of having to guess from the wildcard group.
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
