import type { APIRoute } from 'astro';
import { hybridSearch } from '../../lib/search';

export const prerender = false;

// Hybrid search results as JSON, for client-side use. POST { query } → { results }.
export const POST: APIRoute = async ({ request }) => {
  try {
    const { query } = (await request.json()) as { query?: string };
    if (!query || typeof query !== 'string') return Response.json({ results: [] });
    return Response.json({ results: await hybridSearch(query) });
  } catch (err) {
    console.error('[/api/search]', err);
    return Response.json({ error: 'search_failed' }, { status: 502 });
  }
};
