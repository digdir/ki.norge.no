# ki-content index — infrastructure as code

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
evaluated and deferred — see `eval/BASELINE.md`.

## Files
- `ki-content.component-template.json` — the mappings (`body_semantic.inference_id` = `e5-large-incluster`).
- `ki-content.index-template.json` — composes the component template, matches `ki-content*`.
- `apply-templates.mjs` — registers/updates both templates (idempotent, zero-dep).
- `setup-incluster-embedding.mjs` — starts the e5-large deployment (warm, min 1) + creates the `e5-large-incluster` endpoint.
- `crawl-umbraco.mjs` — extracts all indexable content from the Umbraco Delivery API (`{id,title,url,body,language,type}`).
- `rebuild-from-umbraco.mjs` — local (re)build of the index from that extract (dev/backfill; the CMS push is the production path).
- `eval/golden-ki.tsv` + `eval/run-golden.mjs` — 63-query golden-set regression eval (exits non-zero if quality drops below baseline).
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

# Deploy it (warm, min 1) + create the inference endpoint:
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

## Reindex (the authoritative path)
The CMS owns indexing (`ReindexBackgroundJob` → `ContentTextExtractor`). Trigger a
full reindex without the backoffice using the Management-API client-credentials
trigger — a thin wrapper over `POST /search/reindex`, not a second indexer:
```sh
cp .env.example .env   # + CMS_URL / UMBRACO_CLIENT_ID / UMBRACO_CLIENT_SECRET
pnpm run search:reindex          # from the repo root; see reindex.mjs
```
Create the API user once: backoffice → Users → API Users. See `reindex.mjs` for the
exact auth + polling logic.

## Recreate the index from scratch
```sh
curl -XDELETE "$ES_ENDPOINT/ki-content" -H "Authorization: ApiKey $ES_API_KEY"
node --env-file=.env apply-templates.mjs
pnpm run search:reindex          # repopulate via the CMS (see above)
```

## Local rebuild from Umbraco (restored crawler)
A standalone alternative to the CMS push, for local dev/backfill/evals — pulls the
Delivery API and writes documents directly (mapping still owned by the template):
```sh
cp .env.example .env   # + UMBRACO_URL / UMBRACO_PUBLIC_URL
node --env-file=.env apply-templates.mjs                  # ensure mapping (once)
node --env-file=.env rebuild-from-umbraco.mjs --rebuild   # DROP + rebuild the index
# or idempotent upsert by content GUID (no drop):
node --env-file=.env rebuild-from-umbraco.mjs
```
Indexes only *indexable* content (listing/taxonomy containers skipped, <20-char
bodies dropped) — ~259 docs, mostly glossary (`ordbokOppslag`). Documents are keyed
by content GUID, matching the CMS push, so the two are interchangeable. The CMS push
(publish events + `POST /search/reindex`) stays the production path; this crawler is
for local rebuilds. **Both modes write to `KI_INDEX` (default `ki-content`); `--rebuild`
deletes it first.**

## Inspect drift
```sh
curl -XPOST "$ES_ENDPOINT/_index_template/_simulate_index/ki-content" \
  -H "Authorization: ApiKey $ES_API_KEY"
```
Compare the resolved mapping with `ki-content.component-template.json`.

## Notes (Serverless)
- Shards/replicas/ILM are platform-managed, so the template carries mappings only;
  `norwegian` is a built-in analyzer.
- The embedding deployment uses **adaptive allocations**. For an interactive search
  box pin **min 1** (stays warm, bills continuously); it is currently **min 0**
  (scale-to-zero) to save cost in dev — the first query after idle cold-starts e5-large.
- **No reranker** is used — the hybrid (BM25 + dense) query path is fully in-cluster/EU.
  Rerankers were evaluated (`eval/BASELINE.md`): jina (EIS) is best + fast but US +
  CC-BY-NC; in-cluster bge-reranker-v2-m3 matches its quality (Apache-2.0, EU) but
  reranks in ~3.8 s on CPU. Deferred EU+fast+quality option: bge on a GPU in an EU
  Azure region (TEI) wired via the `hugging_face` rerank inference service.
- For state-managed IaC (drift detection, multi-env), the templates can be managed
  with Terraform (`elasticstack_elasticsearch_component_template` / `_index_template`).
