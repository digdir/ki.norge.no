import type { APIRoute } from 'astro';
import { hybridSearch } from '../../lib/search';
import { withinRateLimit } from '../../lib/rate-limit';

export const prerender = false;

/** Lengre enn dette er ikke et søk, og treffer uansett ingenting nyttig. */
const QUERY_MAX_LENGTH = 200;

// Hybrid search results as JSON, for client-side use. POST { query } → { results }.
//
// Ruta er åpen og driver både Elasticsearch og en embedding-modell, altså
// kostnad per kall. Hastighetsgrensa står derfor foran. Turnstile er bevisst
// utelatt her: søket er interaktivt, og et engangstoken per søk ville gitt
// dårlig brukeropplevelse uten å løse noe grensa ikke løser.
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
