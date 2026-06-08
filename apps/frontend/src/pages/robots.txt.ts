import type { APIRoute } from 'astro';

const PROD_HOSTS = new Set([
  'ki.norge.no',
  'www.ki.norge.no',
  'ki-norge-frontend-prod.digitaliseringsdirektoratet.workers.dev',
]);

export const GET: APIRoute = ({ url }) => {
  const isProd = PROD_HOSTS.has(url.hostname);

  const body = isProd
    ? `# Allows Siteimprove only (todo: allow at launch)
User-agent: SiteimproveBot
User-agent: SiteimproveBot-Crawler
Allow: /
Disallow: /admin-tilgang
Disallow: /preview-tilgang
Disallow: /status
Disallow: /api/
Disallow: /503

User-agent: *
Disallow: /

Sitemap: https://ki.norge.no/sitemap-index.xml

# Human/LLM-readable route expectations for automated testing:
# See /llm.txt
`
    : `# Non-production environment — disallow all (crawling on test would give bad content for Search Engines and give false results for Siteimprove)

User-agent: *
Disallow: /
`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
