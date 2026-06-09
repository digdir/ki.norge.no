/**
 * Hybrid search over the ki-content index: BM25 (norwegian analyzer) + dense
 * (E5-large semantic_text) fused with a weighted-linear retriever (0.4 / 0.6).
 * No reranker — the whole query path stays in-cluster (EU): no user query text
 * leaves to an external inference service. (Reranker choice deferred; see
 * infrastructure/elasticsearch.)
 *
 * Plain `fetch` (Cloudflare Workers-safe), server-side only. If ES isn't
 * configured it degrades gracefully to the existing Umbraco search so the search
 * UI never hard-fails.
 */
import { searchContent } from './umbraco';

const ES_ENDPOINT = (process.env.ES_ENDPOINT || import.meta.env.ES_ENDPOINT || '').replace(/\/$/, '');
const ES_API_KEY = process.env.ES_API_KEY || import.meta.env.ES_API_KEY || '';
const INDEX = process.env.KI_INDEX || import.meta.env.KI_INDEX || 'ki-content';
const TOP_N = 12;

export const isConfigured = Boolean(ES_ENDPOINT && ES_API_KEY);

export interface SearchHit {
  title: string;
  url: string;
  /** Umbraco content-type alias, e.g. "artikkel", "veiledningSteg", "faq". */
  type: string;
  excerpt: string;
}

function excerptOf(body: string, max = 220): string {
  const clean = (body ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max).replace(/\s+\S*$/, '') + ' …' : clean;
}

// linear(0.4 bm25 / 0.6 dense, minmax) — no reranker (keeps the query path in-EU).
function retrieverBody(query: string, size: number) {
  const lex = { standard: { query: { multi_match: { query, fields: ['title^2', 'body'] } } } };
  const sem = { standard: { query: { semantic: { field: 'body_semantic', query } } } };
  return {
    size,
    _source: ['title', 'url', 'type', 'body'],
    retriever: {
      linear: {
        retrievers: [
          { retriever: lex, weight: 0.4, normalizer: 'minmax' },
          { retriever: sem, weight: 0.6, normalizer: 'minmax' },
        ],
        rank_window_size: 50,
      },
    },
  };
}

// content-type → public route prefix, used ONLY by the Umbraco fallback
// (ES hits already carry an absolute ki.norge.no URL).
const TYPE_ROUTES: Record<string, string> = {
  artikkel: '/artikler/',
  eksempel: '/eksempler/',
  veiledning: '/veiledning/',
  veiledningGuide: '/veiledning/',
  veiledningSteg: '/veiledning/',
  side: '/',
};

export async function hybridSearch(query: string, size = TOP_N): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  if (!isConfigured) return fallbackSearch(q);

  const res = await fetch(`${ES_ENDPOINT}/${INDEX}/_search`, {
    method: 'POST',
    headers: { Authorization: `ApiKey ${ES_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(retrieverBody(q, size)),
  });
  if (!res.ok) throw new Error(`ES search ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { hits: { hits: { _source: Record<string, string> }[] } };
  return data.hits.hits.map((h) => {
    const s = h._source;
    return { title: s.title, url: s.url, type: s.type, excerpt: excerptOf(s.body) };
  });
}

// Graceful degradation when ES isn't configured: existing Umbraco search.
async function fallbackSearch(query: string): Promise<SearchHit[]> {
  const r = await searchContent(query);
  return r.data.map((d) => ({
    title: d.tittel,
    url: `${TYPE_ROUTES[d.contentType] ?? '/'}${d.slug}`,
    type: d.contentType,
    excerpt: d.excerpt,
  }));
}
