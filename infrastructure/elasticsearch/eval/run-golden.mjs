// Golden-set regression eval for ki-content retrieval quality.
//
// Runs the PRODUCTION retriever (linear 0.4/0.6 BM25+dense, no reranker — see
// apps/frontend/src/lib/search.ts) over the 63-query golden set and reports
// Hit@1/Hit@3/MRR overall + by group. Compares ALL-group numbers to the recorded
// baseline (see BASELINE.md) and exits non-zero on a regression — so it can gate CI
// or be run after any retrieval/embedding change or index rebuild.
//
//   node --env-file=.env run-golden.mjs
//   node --env-file=.env run-golden.mjs --rerank .jina-reranker-v2-base-multilingual   # try a reranker variant
//
// Env: ES_ENDPOINT, ES_API_KEY, KI_INDEX (default ki-content).
// NOTE: the golden targets are content slugs for the current corpus snapshot. If the
// index content changes substantially, update golden-ki.tsv + the baseline below.
import { readFileSync } from 'node:fs';

const ES = (process.env.ES_ENDPOINT || '').replace(/\/$/, '');
const KEY = process.env.ES_API_KEY || '';
const INDEX = process.env.KI_INDEX || 'ki-content';
const K = 5;

// Recorded production baseline (no reranker, in-cluster int8 e5-large embeddings).
const BASELINE = { hit1: 0.83, hit3: 0.93, mrr: 0.893 };
const TOL = 0.03; // tolerate minor run-to-run noise; flag drops beyond this

if (!ES || !KEY) { console.error('Missing ES_ENDPOINT / ES_API_KEY'); process.exit(2); }
const h = { Authorization: `ApiKey ${KEY}`, 'Content-Type': 'application/json' };
const ri = process.argv.indexOf('--rerank');
const RERANK = ri >= 0 ? process.argv[ri + 1] : null;

const lex = (q) => ({ standard: { query: { multi_match: { query: q, fields: ['title^2', 'body'] } } } });
const sem = (q) => ({ standard: { query: { semantic: { field: 'body_semantic', query: q } } } });
const linear = (q) => ({ linear: { retrievers: [
  { retriever: lex(q), weight: 0.4, normalizer: 'minmax' },
  { retriever: sem(q), weight: 0.6, normalizer: 'minmax' },
], rank_window_size: 50 } });
const retriever = (q) => RERANK
  ? { text_similarity_reranker: { retriever: linear(q), field: 'body', inference_id: RERANK, inference_text: q, rank_window_size: K } }
  : linear(q);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function search(q) {
  let last;
  for (let a = 0; a < 6; a++) { // retry absorbs ML cold-start (min-0 endpoints scale up on demand)
    try {
      const r = await fetch(`${ES}/${INDEX}/_search`, { method: 'POST', headers: h, body: JSON.stringify({ size: K, _source: ['url'], retriever: retriever(q) }) });
      if (r.ok) return (await r.json()).hits.hits.map((x) => x._source.url);
      last = `${r.status} ${(await r.text()).slice(0, 120)}`;
    } catch (e) { last = e.message; }
    await sleep(2500 * (a + 1));
  }
  throw new Error(last);
}

const rows = readFileSync(new URL('./golden-ki.tsv', import.meta.url), 'utf8').trim().split('\n').slice(1)
  .map((l) => { const [id, category, lang, query, targets] = l.split('\t'); return { id, category, lang, query, targets: (targets || '').split(';').filter(Boolean) }; });
const slug = (u) => u.replace(/\/$/, '').split('/').pop();
const rankOf = (urls, t) => { for (let i = 0; i < urls.length; i++) if (t.includes(slug(urls[i]))) return i + 1; return 0; };

const ranks = [];
for (const row of rows) { ranks.push({ ...row, rank: rankOf(await search(row.query), row.targets) }); }

const groups = [['ALL', () => true], ['sem', (q) => q.category === 'sem'], ['kw', (q) => q.category === 'kw'], ['def', (q) => q.category === 'def'], ['nb', (q) => q.lang === 'nb'], ['nn', (q) => q.lang === 'nn']];
const pct = (x) => (x * 100).toFixed(0) + '%';
const pad = (s, n) => String(s).padEnd(n);
const m = (pred) => { const s = ranks.filter(pred); const n = s.length; return { n, h1: s.filter((x) => x.rank === 1).length / n, h3: s.filter((x) => x.rank > 0 && x.rank <= 3).length / n, mrr: s.reduce((a, x) => a + (x.rank > 0 ? 1 / x.rank : 0), 0) / n }; };

console.log(`\nGolden eval — index: ${INDEX}, reranker: ${RERANK || 'none (production)'}, ${rows.length} queries\n`);
console.log(pad('group', 7) + pad('n', 4) + pad('Hit@1', 8) + pad('Hit@3', 8) + 'MRR');
console.log('-'.repeat(35));
for (const [g, pred] of groups) { const r = m(pred); if (!r.n) continue; console.log(pad(g, 7) + pad(r.n, 4) + pad(pct(r.h1), 8) + pad(pct(r.h3), 8) + r.mrr.toFixed(3)); }

const all = m(() => true);
if (RERANK) { console.log('\n(variant run — not checked against the production baseline)'); process.exit(0); }
const checks = [['Hit@1', all.h1, BASELINE.hit1], ['Hit@3', all.h3, BASELINE.hit3], ['MRR', all.mrr, BASELINE.mrr]];
let regressed = false;
console.log(`\nRegression check vs baseline (tol ${TOL}):`);
for (const [name, got, base] of checks) {
  const ok = got >= base - TOL;
  if (!ok) regressed = true;
  console.log(`  ${ok ? 'PASS' : 'REGRESSION'}  ${name}: ${got.toFixed(3)} (baseline ${base})`);
}
process.exit(regressed ? 1 : 0);
