import type { APIRoute } from 'astro';

const PROD_HOSTS = new Set([
  'ki.norge.no',
  'www.ki.norge.no',
  'ki-norge-frontend-prod.digitaliseringsdirektoratet.workers.dev',
]);

export const GET: APIRoute = ({ url }) => {
  const isProd = PROD_HOSTS.has(url.hostname);

  const body = isProd
    ? `# Pre-launch: allow Siteimprove only
User-agent: SiteimproveBot
Allow: /

User-agent: *
Disallow: /
`
    : `User-agent: *
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
