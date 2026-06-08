# ki-content index — infrastructure as code

The Elasticsearch index that powers ki.norge.no hybrid search (`ki-content`) is
declared here as an Elasticsearch **component + index template**. These JSON files
are the single source of truth for the index mapping — BM25 (`norwegian` analyzer)
plus a dense `semantic_text` field (E5-large). The CMS writes documents into the
index (see `apps/cms-umbraco/Search/`) but never owns its mapping; retrieval is the
Astro frontend's `hybridSearch`.

## Files
- `ki-content.component-template.json` — the mappings.
- `ki-content.index-template.json` — composes the component template, matches `ki-content*`.
- `apply-templates.mjs` — registers/updates both templates (idempotent, zero-dep).

## Apply
```sh
cp .env.example .env        # fill in ES_ENDPOINT / ES_API_KEY
node --env-file=.env apply-templates.mjs
```
Run once before the first deploy/reindex, and again whenever the mapping changes.
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
Shards/replicas/ILM are platform-managed, so the template carries mappings only;
`norwegian` is a built-in analyzer and the inference IDs are preconfigured EIS
endpoints — nothing else to provision. For state-managed IaC (drift detection,
multi-env governance), the same templates can be managed with Terraform
(`elasticstack_elasticsearch_component_template` / `_index_template`).
