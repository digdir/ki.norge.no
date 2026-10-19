import type { APIRoute } from 'astro';
import { generateSitemapXml } from '../lib/sitemap';
import { isProdHost, CANONICAL_SITE_URL } from '../lib/prod-hosts';

export const GET: APIRoute = async ({ url }) => {
  // In production the canonical domain is always used, so that sitemap URLs
  // read from the workers.dev host still point to ki.norge.no.
  const base = isProdHost(url.hostname) ? CANONICAL_SITE_URL : url.origin;

  try {
    const xml = await generateSitemapXml(base);
    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  } catch (error) {
    console.error('[sitemap.xml] generation failed', error);
    return new Response('sitemap.xml er ikke tilgjengelig.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
};
