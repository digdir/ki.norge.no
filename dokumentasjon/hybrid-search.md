# Hybrid search (ki.norge.no)

Search-only hybrid retrieval on Elastic Cloud Serverless: **BM25 (norwegian analyzer) + dense vector search (E5-large `semantic_text`) fused + jina rerank**. No LLM, no Azure OpenAI, no Agent Builder — the lowest-risk slice, production-ready.

Content is **pushed** into the index by the Umbraco CMS on publish/unpublish (no crawler); the index mapping is **infrastructure as code**; retrieval runs in the Astro frontend.

## Architecture

```
apps/cms-umbraco (Umbraco) ──publish/unpublish/trash──▶  Elastic index "ki-content"
   extractor + event handlers      push                  (semantic_text + norwegian analyzer)
   + /search/reindex (backfill)                                   │
                                                                  │
/sok  ──hybridSearch()──▶ /ki-content/_search  ───────────────────┘
(SSR, apps/frontend)      linear 0.4 bm25 / 0.6 dense + jina rerank
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
- `ki-content.component-template.json` — mappings (`title`/`body` → text, `norwegian`, `copy_to: body_semantic`; `body_semantic` → `semantic_text` via `.microsoft-multilingual-e5-large`; `url`/`language`/`type` → keyword).
- `ki-content.index-template.json` — composes it, matches `ki-content*`.

### Retrieval + surface — `apps/frontend/`
- **`src/lib/search.ts`** — `hybridSearch(query)`: the tuned retriever (verified Hit@3 ≈ 100% on the golden set) via `fetch` (Workers-safe). Falls back to Umbraco search when ES is unconfigured.
- **`src/pages/sok.astro`** — search page (SSR): reads `?q=`, calls `hybridSearch`, shows ranked hits (type badge + title + excerpt), links via the `url` (made relative for same-host nav).
- **`src/pages/api/search.ts`** — `POST { query } → { results }` for optional client use.
- **Header** — a search icon linking to `/sok`.

## Configuration (env)
| Var | Where | Default |
|---|---|---|
| `Elasticsearch:Endpoint`, `Elasticsearch:ApiKey` | CMS (`apps/cms-umbraco`) — env/Key Vault as `Elasticsearch__*` | — (required) |
| `Elasticsearch:IndexName` | CMS | `ki-content` |
| `ES_ENDPOINT`, `ES_API_KEY`, `KI_INDEX` | frontend (server) | — / — / `ki-content` |
| `ES_ENDPOINT`, `ES_API_KEY` | `infrastructure/elasticsearch` (apply templates) | — (required) |

Secrets stay out of git: the CMS reads them from Azure Key Vault (`Elasticsearch__Endpoint` / `Elasticsearch__ApiKey`); local `.env` / `appsettings.Development.json` are git-ignored. When the CMS endpoint is empty, indexing cleanly disables (the CMS still runs).

## Verification
1. **Templates:** `apply-templates.mjs` → `POST {ES}/_index_template/_simulate_index/ki-content` resolves `body_semantic` to `semantic_text` (e5-large). ✓ (verified)
2. **CMS compiles:** `dotnet build apps/cms-umbraco`. ✓ (verified — 0 errors)
3. **Push E2E (staging):** publish a node in the CMS → it appears in `ki-content` (`GET {ES}/ki-content/_count` increments; the doc embeds `body_semantic`). Needs a CMS instance with content — the local dev DB is empty.
4. **Retrieval:** `apps/frontend` `pnpm dev` → `/sok?q=…` returns ranked hits; keyword + paraphrase both hit the right page.

## Production notes
- **Keys:** scoped, read-only ES key for the frontend (retrieval); a write-capable key for the CMS. Rotate the spike admin key before non-demo use.
- **Data residency / EIS:** embedding + rerank run on the Elastic Inference Service. Confirm data-residency terms, or move to in-cluster / region-pinned models.
- **Initial backfill / cutover:** apply templates, then run the CMS reindex endpoint once to populate `ki-content`. A clean rebuild is `DELETE ki-content` → apply-templates → reindex. Steady-state freshness is handled by the publish/unpublish handlers.
- **Index name** `ki-content`; the `ki-content*` template pattern already covers a family for per-portal indices when info.altinn.no is added.
- **State-managed IaC (optional):** templates can be managed with Terraform (`elasticstack_elasticsearch_component_template` / `_index_template`) for drift detection — warranted only if Terraform is already in use.
