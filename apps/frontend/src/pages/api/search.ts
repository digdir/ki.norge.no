import type { APIRoute } from 'astro';
import { hybridSearch } from '../../lib/search';
import { withinRateLimit } from '../../lib/rate-limit';

export const prerender = false;

/** Longer than this is not a search, and matches nothing useful anyway. */
const QUERY_MAX_LENGTH = 200;

// Hybrid search results as JSON, for client-side use. POST { query } → { results }.
//
// The route is open and drives both Elasticsearch and an embedding model, so
// there is a cost per call. The rate limit therefore sits in front. Turnstile is
// deliberately left out here: search is interactive, and a single-use token per
// search would give a poor user experience without solving anything the limit doesn't.
export const POST: APIRoute = async ({ request }) => {
  try {
    if (!(await withinRateLimit('SEARCH_LIMIT', request))) {
      return Response.json({ error: 'rate_limited' }, { status: 429 });
    }

    const { query } = (await request.json()) as { query?: string };
    if (!query || typeof query !== 'string') return Response.json({ results: [] });
    if (query.length > QUERY_MAX_LENGTH) return Response.json({ results: [] });

    return Response.json({ results: await hybridSearch(query) });
  } catch (err) {
    console.error('[/api/search]', err);
    return Response.json({ error: 'search_failed' }, { status: 502 });
  }
};
