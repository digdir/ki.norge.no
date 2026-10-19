# infrastructure/elasticsearch

The mapping for the search index `ki-content` as code, and the scripts for embedding, reindexing and evaluation. The recipes are in [docs/elasticsearch-index.md](../../docs/elasticsearch-index.md).

**Prod and tt02 share the index.** `--rebuild` and a `DELETE` on the index hit both environments.
