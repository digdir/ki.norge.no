import type { APIRoute } from 'astro';
import { generateSitemapXml } from '../lib/sitemap';
import { isProdHost } from '../lib/prod-hosts';

const PUBLIC_BASE_URL = import.meta.env.SITE_URL || 'https://ki.norge.no';

export const GET: APIRoute = async ({ url }) => {
  // I produksjon brukes alltid det kanoniske domenet, slik at sitemap-URLer
  // som leses fra workers.dev-hosten fortsatt peker til ki.norge.no.
  const base = isProdHost(url.hostname) ? PUBLIC_BASE_URL : url.origin;

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
