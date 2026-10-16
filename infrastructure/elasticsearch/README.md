# infrastructure/elasticsearch

Mappingen for søkeindeksen `ki-content` som kode, og skriptene for embedding, reindeksering og evaluering. Oppskriftene står i [docs/elasticsearch-indeks.md](../../docs/elasticsearch-indeks.md).

**Prod og tt02 deler indeksen.** `--rebuild` og en `DELETE` på indeksen treffer begge miljøene.
