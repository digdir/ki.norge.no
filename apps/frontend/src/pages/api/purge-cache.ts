import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

/**
 * Cache purge endpoint for Umbraco publish webhooks.
 *
 * When an editor publishes content in Umbraco, a webhook calls this
 * endpoint which purges the Cloudflare edge cache. The next visitor
 * triggers a fresh SSR render that gets cached again.
 *
 * Setup:
 * 1. Create a Cloudflare API token with Zone.Cache Purge permission
 * 2. Set CLOUDFLARE_ZONE_ID, CLOUDFLARE_PURGE_TOKEN, and PURGE_SECRET in env
 * 3. In Umbraco backoffice → Settings → Webhooks, add a webhook:
 *    URL: https://ki.norge.no/api/purge-cache?secret=<PURGE_SECRET>
 *    Events: Content Published, Content Unpublished
 */

export const POST: APIRoute = async ({ url }) => {
  const PURGE_SECRET = env.PURGE_SECRET || '';
  const CLOUDFLARE_ZONE_ID = env.CLOUDFLARE_ZONE_ID || '';
  const CLOUDFLARE_PURGE_TOKEN = env.CLOUDFLARE_PURGE_TOKEN || '';

  const secret = url.searchParams.get('secret');
  if (!PURGE_SECRET || secret !== PURGE_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_PURGE_TOKEN) {
    return new Response('Cloudflare credentials not configured', { status: 500 });
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_PURGE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ purge_everything: true }),
      },
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('Cloudflare purge failed:', result);
      return new Response(JSON.stringify({ success: false, error: result }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('Cache purged successfully');
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Cache purge error:', error);
    return new Response(JSON.stringify({ success: false, error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
