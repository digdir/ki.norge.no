# Hybrid search (ki.norge.no)

Search-only hybrid retrieval on Elastic Cloud Serverless: **BM25 (norwegian analyzer) + dense vector search (in-cluster E5-large `semantic_text`) fused with a weighted-linear retriever (0.4/0.6), no reranker**. No LLM, no Azure OpenAI, no Agent Builder — the lowest-risk slice. The whole query path is in-cluster/EU (no user query text leaves to an external inference service).

Content is **pushed** into the index by the Umbraco CMS on publish/unpublish (no crawler); the index mapping is **infrastructure as code**; retrieval runs in the Astro frontend.

## Architecture

```
apps/cms-umbraco (Umbraco) ──publish/unpublish/trash──▶  Elastic index "ki-content"
   extractor + event handlers      push                  (semantic_text + norwegian analyzer)
   + /search/reindex (backfill)                                   │
                                                                  │
/api/search ──hybridSearch()──▶ /ki-content/_search  ─────────────┘
(SearchDialog modal)      linear 0.4 bm25 / 0.6 dense (no reranker)
```

### Ingestion (push) — `apps/cms-umbraco/Search/`
The CMS keeps the index in sync via Umbraco notifications — no external crawl. Uses the official `Elastic.Clients.Elasticsearch` client; **ingestion only** (it never creates the mapping or queries).
- **`SearchComposer`** — wires the adapter, extractor, reindex job, and notification handlers (auto-discovered via `IComposer`).
- **`EventHandlers/`** — `ContentPublished` → upsert; `ContentUnpublished` / `ContentMovedToRecycleBin` → delete. The document `_id` is the content GUID, so re-publishing upserts and unpublish/trash deletes the same doc.
- **`ContentTextExtractor`** — builds `{title, url, body, type, language}` from a node: title = `tittel → sporsmal → term → name`; body harvested from TextBox/TextArea/RichText/Block List/Grid (inline RTE blocks expanded, HTML stripped); container content types skipped; nodes with < 20 chars of prose dropped. Content is culture-invariant → indexed once as `nb`.
- **`Elasticsearch/`** — `ElasticsearchIndexService` (upsert/delete by id), `ElasticsearchClientFactory` (no-ops when unconfigured so the CMS never fails to boot), `ElasticsearchOptions`, `SearchDocument` (the five mapped fields; `body_semantic` is generated server-side via `copy_to`, never sent).
- **`Jobs/ReindexBackgroundJob` + `Controllers/ReindexController`** — full backfill: `POST /umbraco/management/api/v1/search/reindex` (admin) walks all published content and upserts it; `GET …/search/reindex/status` reports progress. Replaces the old crawler's bulk role.

### Index as code — `infrastructure/elasticsearch/`
The index mapping is an Elasticsearch **component + index template** (versioned JSON), not defined in app code. `apply-templates.mjs` registers them (idempotent); an index matching `ki-content*` auto-creates with the hybrid mapping on first write. See that folder's README for apply / recreate / drift commands.
- `ki-content.component-template.json` — mappings (`title`/`body` → text, `norwegian`, `copy_to: body_semantic`; `body_semantic` → `semantic_text` via the **in-cluster** `e5-large-incluster` endpoint (int8 E5-large on the deployment's ML nodes); `url`/`language`/`type` → keyword).
- `ki-content.index-template.json` — composes it, matches `ki-content*`.
- `setup-incluster-embedding.mjs` — provisions `e5-large-incluster` (starts the e5-large deployment, min 1 warm + creates the endpoint). Prerequisite: the model is imported once with Eland — see the folder README.

### Retrieval + surface — `apps/frontend/`
- **`src/lib/search.ts`** — `hybridSearch(query)`: the `linear` 0.4/0.6 retriever, **no reranker** (golden-set Hit@3 ≈ 87% / MRR 0.838 — see `infrastructure/elasticsearch/eval/BASELINE.md`), via `fetch` (Workers-safe). Falls back to Umbraco search when ES is unconfigured.
- **`src/pages/api/search.ts`** — `POST { query } → { results }`: calls `hybridSearch`, the search surface's only entry point.
- **`src/components/shared/SearchDialog.tsx`** — search modal (React island, `client:load`): opened from the Header (search icon + Ctrl/Cmd+K), POSTs to `/api/search`, shows ranked hits (type badge + title + excerpt), links via the `url` (made relative for same-host nav). There is no `/sok` page.
- **Header** — a search icon (+ Ctrl/Cmd+K) that opens the modal.

## Configuration (env)
| Var | Where | Default |
|---|---|---|
| `Elasticsearch:Endpoint`, `Elasticsearch:ApiKey` | CMS (`apps/cms-umbraco`) — env/Key Vault as `Elasticsearch__*` | — (required) |
| `Elasticsearch:IndexName` | CMS | `ki-content` |
| `ES_ENDPOINT`, `ES_API_KEY`, `KI_INDEX` | frontend (server) | — / — / `ki-content` |
| `ES_ENDPOINT`, `ES_API_KEY` | `infrastructure/elasticsearch` (apply templates) | — (required) |

Secrets stay out of git: the CMS reads them from Azure Key Vault (`Elasticsearch__Endpoint` / `Elasticsearch__ApiKey`); local `.env` / `appsettings.Development.json` are git-ignored. When the CMS endpoint is empty, indexing cleanly disables (the CMS still runs).

## Verification
1. **Templates:** `apply-templates.mjs` → `POST {ES}/_index_template/_simulate_index/ki-content` resolves `body_semantic` to `semantic_text` via `e5-large-incluster` (in-cluster). ✓ (verified)
2. **CMS compiles:** `dotnet build apps/cms-umbraco`. ✓ (verified — 0 errors)
3. **Push E2E (staging):** publish a node in the CMS → it appears in `ki-content` (`GET {ES}/ki-content/_count` increments; the doc embeds `body_semantic`). Needs a CMS instance with content — the local dev DB is empty.
4. **Retrieval:** `apps/frontend` `pnpm dev` → open the search modal (Ctrl/Cmd+K) and query; keyword + paraphrase both hit the right page.

## Production notes
- **Keys:** scoped, read-only ES key for the frontend (retrieval); a write-capable key for the CMS. Rotate the spike admin key before non-demo use.
- **Inference / data residency:** the dense embedding runs **in-cluster** (int8 E5-large via `e5-large-incluster`) and there is **no reranker**, so the entire query path stays in the deployment — **no user query text leaves to any external inference service** (fully EU). ~5× lower latency than the prior EIS embedding. Adaptive allocations: pin **min 1** for interactive use (currently **min 0** to save cost in dev → first query after idle cold-starts). Reranker options were evaluated and deferred (jina = EIS/US + CC-BY-NC; in-cluster bge = Apache-2.0/EU but ~3.8 s CPU; deferred EU+fast path = bge on an EU Azure GPU via the `hugging_face` connector) — numbers + decision in `infrastructure/elasticsearch/eval/BASELINE.md`.
- **Initial backfill / cutover:** apply templates, then run the CMS reindex endpoint once to populate `ki-content`. A clean rebuild is `DELETE ki-content` → apply-templates → reindex. Steady-state freshness is handled by the publish/unpublish handlers.
- **Index name** `ki-content`; the `ki-content*` template pattern already covers a family for per-portal indices when info.altinn.no is added.
- **State-managed IaC (optional):** templates can be managed with Terraform (`elasticstack_elasticsearch_component_template` / `_index_template`) for drift detection — warranted only if Terraform is already in use.
