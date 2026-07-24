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

// Vekting nøkkelord (BM25) vs semantikk, lineært kombinert med minmax-norm.
// Ingen reranker (holder query-stien in-EU). Høyere LEX favoriserer eksakte
// ord/titler, høyere SEM betydningslikhet. Vektet mot nøkkelord (var 0.4/0.6)
// så tittel-/navnesøk ikke havner under semantisk nære, ordmessig svakere
// treff (#544). Juster ved behov.
const LEX_WEIGHT = 0.6;
const SEM_WEIGHT = 0.4;

function retrieverBody(query: string, size: number) {
  const lex = { standard: { query: { multi_match: { query, fields: ['title^2', 'body'] } } } };
  const sem = { standard: { query: { semantic: { field: 'body_semantic', query } } } };
  return {
    size,
    _source: ['title', 'url', 'type', 'body'],
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

// Relevans-gate: semantisk søk finner alltid de nærmeste dokumentene, så tull
// ("middag") gir alltid treff. BM25 er en ren nøkkelord-match og er 0 når ingen
// søkeord finnes i innholdet. Vi krever et minimum lexikalsk treff før vi viser
// resultater. Rå semantisk score duger ikke som gate: E5-similariteter ligger
// 0.90-0.96 for både relevante og irrelevante søk. Kjent begrensning: engelske
// søk mot norsk innhold og enkeltstående vanlige ord kan bomme. Juster ved behov.
const LEX_GATE_MIN_SCORE = 1;

// Ren BM25-probe, kun for gate-scoren (size 1, ingen _source).
function lexicalGateBody(query: string) {
  return { size: 1, _source: false, query: { multi_match: { query, fields: ['title^2', 'body'] } } };
}

export async function hybridSearch(query: string, size = TOP_N): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  if (!isConfigured) return fallbackSearch(q);

  // Ett _msearch-kall: [lexikalsk gate-probe, hybrid rangering] i én rundtur.
  const ndjson =
    [JSON.stringify({}), JSON.stringify(lexicalGateBody(q)),
     JSON.stringify({}), JSON.stringify(retrieverBody(q, size))].join('\n') + '\n';

  const res = await fetch(`${ES_ENDPOINT}/${INDEX}/_msearch`, {
    method: 'POST',
    headers: { Authorization: `ApiKey ${ES_API_KEY}`, 'Content-Type': 'application/x-ndjson' },
    body: ndjson,
  });
  if (!res.ok) throw new Error(`ES msearch ${res.status}: ${await res.text()}`);
  const { responses } = (await res.json()) as {
    responses: { hits?: { max_score?: number | null; hits?: { _source: Record<string, string> }[] } }[];
  };
  const [lexResp, hybridResp] = responses ?? [];

  // Ingen nøkkelord-forankring i innholdet → behandle som ingen treff (#544).
  if ((lexResp?.hits?.max_score ?? 0) < LEX_GATE_MIN_SCORE) return [];

  return (hybridResp?.hits?.hits ?? []).map((h) => {
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
