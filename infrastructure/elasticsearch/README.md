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
The reranker is still jina on EIS (a planned follow-up moves it in-cluster too).

## Files
- `ki-content.component-template.json` — the mappings (`body_semantic.inference_id` = `e5-large-incluster`).
- `ki-content.index-template.json` — composes the component template, matches `ki-content*`.
- `apply-templates.mjs` — registers/updates both templates (idempotent, zero-dep).
- `setup-incluster-embedding.mjs` — starts the e5-large deployment (warm, min 1) + creates the `e5-large-incluster` endpoint.

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

## Recreate the index from scratch
```sh
curl -XDELETE "$ES_ENDPOINT/ki-content" -H "Authorization: ApiKey $ES_API_KEY"
node --env-file=.env apply-templates.mjs
# then trigger a full reindex from the CMS backoffice:
#   POST /umbraco/management/api/v1/search/reindex   (admin auth)
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
- The embedding deployment runs with **adaptive allocations, min 1** so it stays
  warm for the interactive search box — that allocation bills continuously (VCU).
  Drop to `min 0` to scale-to-zero if you accept cold-start latency on idle.
- The jina reranker (`.jina-reranker-v2-base-multilingual`) is still EIS; moving it
  in-cluster (Eland-import the jina model) is the planned follow-up for a fully
  EIS-free pipeline.
- For state-managed IaC (drift detection, multi-env), the templates can be managed
  with Terraform (`elasticstack_elasticsearch_component_template` / `_index_template`).
