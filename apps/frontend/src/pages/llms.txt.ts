import type { APIRoute } from 'astro';
import { generateLlmsTxt } from '../lib/llms-txt';
import { isProdHost, CANONICAL_SITE_URL } from '../lib/prod-hosts';

export const GET: APIRoute = async ({ url }) => {
  // Same rule as the sitemap: when read from the workers.dev host, the links
  // should still point to the canonical domain.
  const base = isProdHost(url.hostname) ? CANONICAL_SITE_URL : url.origin;

  try {
    const body = await generateLlmsTxt(base);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  } catch (error) {
    console.error('[llms.txt] generation failed', error);
    return new Response('llms.txt er ikke tilgjengelig.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
};
