# ki-content index — infrastructure as code

Filene og kommandoene under gjelder `infrastructure/elasticsearch/`, og kjøres derfra.

The Elasticsearch index that powers ki.norge.no hybrid search (`ki-content`) is
declared here as an Elasticsearch **component + index template**. These JSON files
are the single source of truth for the index mapping — BM25 (`norwegian` analyzer)
plus a dense `semantic_text` field. The CMS writes documents into the index (see
`apps/cms-umbraco/Search/`) but never owns its mapping; retrieval is the Astro
frontend's `hybridSearch`.

The dense embedding runs **in-cluster** (int8-quantized E5-large on the deployment's
own ML nodes) — no Elastic Inference Service / third-party round-trip, so query
content stays inside the deployment and embedding latency is ~5× lower than EIS.
There is **no reranker** — the dense + lexical hybrid keeps the entire query path
in-cluster/EU (no user query text ever leaves the deployment). Reranker options were
evaluated and deferred — see [eval/BASELINE.md](../infrastructure/elasticsearch/eval/BASELINE.md).

## Files
- `ki-content.component-template.json` — the mappings (`body_semantic.inference_id` = `e5-large-incluster`).
- `ki-content.index-template.json` — composes the component template, matches `ki-content*`.
- `apply-templates.mjs` — registers/updates both templates (idempotent, zero-dep).
- `setup-incluster-embedding.mjs` — starts the e5-large deployment with adaptive allocations + creates the `e5-large-incluster` endpoint. It asks for min 1, but Serverless keeps min 0 (see Notes).
- `crawl-umbraco.mjs` — extracts all indexable content from the Umbraco Delivery API (`{id,title,url,body,language,type}`).
- `rebuild-from-umbraco.mjs` — local (re)build of the index from that extract (dev/backfill; the CMS push is the production path).
- `eval/golden-ki.tsv` + `eval/run-golden.mjs` — 46-query golden-set regression eval (exits non-zero if quality drops below baseline).
- `eval/BASELINE.md` — recorded baseline numbers + the reranker/embedding analysis behind the current config.

## In-cluster embedding setup (one-time, prerequisite)
The `e5-large-incluster` endpoint references a trained model that must be imported
with Eland first. e5-large fp32 (~2 GB) does **not** fit the project's ML tier
(~2.2 GB nodes), so it is imported **int8-quantized** (~1.33 GB):

```sh
python3 -m venv /tmp/eland-venv && /tmp/eland-venv/bin/pip install 'eland[pytorch]'

# Apple Silicon: the trace must run on CPU and quantization needs the QNNPACK
# backend. Run via a wrapper that sets both before eland starts:
cat > /tmp/eland-cpu.py <<'PY'
import sys, torch
torch.backends.mps.is_available = lambda: False          # force CPU trace
torch.backends.quantized.engine = "qnnpack"               # enable --quantize on ARM
from eland.cli.eland_import_hub_model import main
sys.exit(main())
PY

set -a; . .env; set +a   # ES_ENDPOINT / ES_API_KEY
/tmp/eland-venv/bin/python /tmp/eland-cpu.py \
  --url "$ES_ENDPOINT" --es-api-key "$ES_API_KEY" \
  --hub-model-id intfloat/multilingual-e5-large --es-model-id multilingual-e5-large \
  --task-type text_embedding --quantize --clear-previous

# Deploy it + create the inference endpoint (Serverless keeps min 0, see Notes):
node --env-file=.env setup-incluster-embedding.mjs
```
(On Linux/x86 the wrapper is unnecessary — `eland_import_hub_model … --quantize`
works directly.) For true fp32 parity instead of int8, raise the project's ML tier
so a ≥~3–4 GB ML node is available, then import without `--quantize`.

## Apply the templates
```sh
cp .env.example .env        # fill in ES_ENDPOINT / ES_API_KEY
node --env-file=.env apply-templates.mjs
```
Run after the embedding endpoint exists, and again whenever the mapping changes.
An index matching `ki-content*` then auto-creates with the correct mapping on first
write, so a CMS reindex after applying templates is enough.

## Reindex
The CMS keeps the index fresh: publish events go through `ContentTextExtractor`, and
`POST /umbraco/management/api/v1/search/reindex` (admin) upserts all published content.
That is the production path.

For a local rebuild, backfill or eval, `pnpm run search:reindex` (from the repo root,
= `rebuild-from-umbraco.mjs` with `infrastructure/elasticsearch/.env`) reads the public
Delivery API and writes to ES with the ES key, with no backoffice auth. URLs are built
from `shared/content-routes.json`, the same map as the frontend and the CMS push, so
hits link to the real routes (`/artikler/…`, `/veiledning/…`). Documents are keyed by
content GUID, as in the CMS push, so the two are interchangeable.
```sh
cp .env.example .env                    # ES_ENDPOINT / ES_API_KEY / UMBRACO_URL / UMBRACO_PUBLIC_URL
node --env-file=.env apply-templates.mjs   # ensure the mapping (once)
pnpm run search:reindex                 # upsert by content GUID (from repo root)
pnpm run search:reindex -- --rebuild    # full clean rebuild (drops the index first)
```
Only *indexable* content is written: listing and taxonomy containers are skipped and
bodies under 20 characters dropped. That is about 60 documents, with no glossary.
**Both modes write to `KI_INDEX` (default `ki-content`), and `--rebuild` deletes it
first. Prod and tt02 share the index, so a rebuild affects both.**

## Recreate the index from scratch
```sh
curl -XDELETE "$ES_ENDPOINT/ki-content" -H "Authorization: ApiKey $ES_API_KEY"
node --env-file=.env apply-templates.mjs
pnpm run search:reindex          # repopulate (see above)
```

## Inspect drift
```sh
curl -XPOST "$ES_ENDPOINT/_index_template/_simulate_index/ki-content" \
  -H "Authorization: ApiKey $ES_API_KEY"
```
Compare the resolved mapping with `ki-content.component-template.json`.

## Notes (Serverless)
- Shards/replicas/ILM are platform-managed, so the template carries mappings only;
  `norwegian` is a built-in analyzer.
- The cluster is Elastic Serverless (9.6.0). The `e5-large-incluster` endpoint has
  **adaptive allocations min 0, max 8**, so e5-large scales to zero when idle and the
  first query after that cold-starts it (normally 30–60 s).
- **Min 1 cannot be set from here on Serverless** (measured 2026-10-05).
  `PUT _inference/text_embedding/e5-large-incluster/_update` with min 1 answers 200,
  but the value is not stored; reading it back still shows 0.
  `_ml/trained_models/.../deployment/_update` answers 409, because the deployment is
  owned by the inference endpoint.
- From 2026-09-05 to 2026-10-05 the model was allocated 82 % of the time and was
  scaled to 0 nine times. On 2026-10-02 there was no ML node from 10:05 to 13:52.
  The scaling history is in `.ml-notifications-000002`.
- While e5-large is cold or missing, the semantic half of `_msearch` fails inside a
  200 response. The frontend logs it and falls back to a plain BM25 search, so users
  still get keyword hits (#824).
- **No reranker** is used — the hybrid (BM25 + dense) query path is fully in-cluster/EU.
  Rerankers were evaluated (`eval/BASELINE.md`): jina (EIS) is best + fast but US +
  CC-BY-NC; in-cluster bge-reranker-v2-m3 matches its quality (Apache-2.0, EU) but
  reranks in ~3.8 s on CPU. Deferred EU+fast+quality option: bge on a GPU in an EU
  Azure region (TEI) wired via the `hugging_face` rerank inference service.
- For state-managed IaC (drift detection, multi-env), the templates can be managed
  with Terraform (`elasticstack_elasticsearch_component_template` / `_index_template`).
