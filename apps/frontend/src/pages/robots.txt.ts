import type { APIRoute } from 'astro';
import { isProdHost } from '../lib/prod-hosts';

export const GET: APIRoute = ({ url }) => {
  const isProd = isProdHost(url.hostname);

  const body = isProd
    ? `# Robots.txt for https://ki.norge.no/
# Updated: 2026-06-11 — optimized for SEO, security and AI search

User-agent: *

# Allow resources required for correct rendering and Core Web Vitals measurements
Allow: /*.css$
Allow: /*.js$
Allow: /*.png$
Allow: /*.jpg$
Allow: /*.jpeg$
Allow: /*.webp$
Allow: /*.svg$

# --- Search (should not appear in search results) ---
Disallow: /sok/

# --- Media library (Umbraco media files) ---
Disallow: /media/

# --- Admin and internal routes ---
Disallow: /admin-tilgang
Disallow: /preview-tilgang
Disallow: /status
Disallow: /api/
Disallow: /503
Disallow: /404

Sitemap: https://ki.norge.no/sitemap.xml

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
