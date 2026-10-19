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
import { resolveContentUrl, searchContent } from './umbraco';

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

// Weighting keywords (BM25) vs semantics, combined linearly with minmax norm.
// No reranker (keeps the query path in the EU). Higher LEX favours exact
// words/titles, higher SEM similarity of meaning. Weighted towards keywords (was 0.4/0.6)
// so title/name searches do not end up below semantically close, lexically weaker
// hits (#544). Adjust as needed.
const LEX_WEIGHT = 0.6;
const SEM_WEIGHT = 0.4;

const SOURCE = ['title', 'url', 'type', 'body'];

function lexicalQuery(query: string) {
  return { multi_match: { query, fields: ['title^2', 'body'] } };
}

function retrieverBody(query: string, size: number) {
  const lex = { standard: { query: lexicalQuery(query) } };
  const sem = { standard: { query: { semantic: { field: 'body_semantic', query } } } };
  return {
    size,
    _source: SOURCE,
    retriever: {
      linear: {
        retrievers: [
          { retriever: lex, weight: LEX_WEIGHT, normalizer: 'minmax' },
          { retriever: sem, weight: SEM_WEIGHT, normalizer: 'minmax' },
        ],
        rank_window_size: 50,
      },
    },
  };
}

// Relevance gate: semantic search always finds the nearest documents, so nonsense
// ("middag") always gives hits. BM25 is a pure keyword match and is 0 when no
// search terms exist in the content. We require a minimum lexical hit before we show
// results. The raw semantic score does not work as a gate: E5 similarities are
// 0.90-0.96 for both relevant and irrelevant searches. Known limitation: English
// searches against Norwegian content and single common words can miss. Adjust as needed.
const LEX_GATE_MIN_SCORE = 1;

// Pure BM25 probe, only for the gate score (size 1, no _source).
function lexicalGateBody(query: string) {
  return { size: 1, _source: false, query: lexicalQuery(query) };
}

interface EsResponse {
  status?: number;
  error?: { type?: string; reason?: string };
  hits?: { max_score?: number | null; hits?: { _source: Record<string, string> }[] };
}

const esHeaders = (contentType: string) => ({ Authorization: `ApiKey ${ES_API_KEY}`, 'Content-Type': contentType });

async function bm25Search(query: string, size: number): Promise<EsResponse> {
  const res = await fetch(`${ES_ENDPOINT}/${INDEX}/_search`, {
    method: 'POST',
    headers: esHeaders('application/json'),
    body: JSON.stringify({ size, _source: SOURCE, query: lexicalQuery(query) }),
  });
  if (!res.ok) throw new Error(`ES search ${res.status}: ${await res.text()}`);
  return (await res.json()) as EsResponse;
}

export async function hybridSearch(query: string, size = TOP_N): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  if (!isConfigured) return fallbackSearch(q);

  // One _msearch call: [lexical gate probe, hybrid ranking] in one round trip.
  const ndjson =
    [JSON.stringify({}), JSON.stringify(lexicalGateBody(q)),
     JSON.stringify({}), JSON.stringify(retrieverBody(q, size))].join('\n') + '\n';

  const res = await fetch(`${ES_ENDPOINT}/${INDEX}/_msearch`, {
    method: 'POST',
    headers: esHeaders('application/x-ndjson'),
    body: ndjson,
  });
  if (!res.ok) throw new Error(`ES msearch ${res.status}: ${await res.text()}`);
  const { responses } = (await res.json()) as { responses: EsResponse[] };
  const [lexResp, hybridResp] = responses ?? [];

  if (lexResp?.error) throw new Error(`ES msearch probe ${lexResp.status}: ${lexResp.error.type}`);

  // No keyword anchoring in the content → treat as no hits (#544).
  if ((lexResp?.hits?.max_score ?? 0) < LEX_GATE_MIN_SCORE) return [];

  let ranked = hybridResp;
  if (!ranked || ranked.error) {
    // _msearch answers 200 even when one part fails. The semantic model scales
    // to zero and cold starts, and then BM25 alone is better than "Ingen resultater" (#822).
    console.error('ES hybrid search failed, falling back to BM25', {
      status: ranked?.status,
      type: ranked?.error?.type,
      reason: ranked?.error?.reason,
    });
    ranked = await bm25Search(q, size);
  }

  return (ranked.hits?.hits ?? []).map((h) => {
    const s = h._source;
    return { title: s.title, url: s.url, type: s.type, excerpt: excerptOf(s.body) };
  });
}

// Graceful degradation when ES isn't configured: existing Umbraco search.
// The ES hits have a finished URL from the CMS. Here the path is looked up in
// shared/content-routes.json, with the guide for a step. Hits without their own page,
// like faq, are removed instead of linking to a page that does not exist.
async function fallbackSearch(query: string): Promise<SearchHit[]> {
  const r = await searchContent(query);
  const hits = await Promise.all(
    r.data.map(async (d): Promise<SearchHit | null> => {
      const url = await resolveContentUrl({ contentType: d.contentType, id: d.id, properties: { slug: d.slug } });
      return url ? { title: d.tittel, url, type: d.contentType, excerpt: d.excerpt } : null;
    }),
  );
  return hits.filter((h): h is SearchHit => h !== null);
}
