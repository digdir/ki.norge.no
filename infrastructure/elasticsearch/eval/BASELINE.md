# ki-content retrieval — eval baseline & analysis

Regression baseline for search quality, plus the analysis behind the current
config. Re-run after any retrieval/embedding/reranker change or index rebuild:

```sh
cd infrastructure/elasticsearch && node --env-file=.env eval/run-golden.mjs
# variant (not checked against baseline):
node --env-file=.env eval/run-golden.mjs --rerank .jina-reranker-v2-base-multilingual
```
`run-golden.mjs` runs the 63-query golden set (`golden-ki.tsv`) and **exits non-zero
if the ALL-group numbers drop more than 0.03 below the baseline**.

## Current production config
- **Embedding:** in-cluster, int8-quantized `multilingual-e5-large` (`e5-large-incluster`) — EU, on the deployment's ML nodes.
- **Retrieval:** `linear` 0.4 BM25 / 0.6 dense (minmax), `rank_window_size` 50.
- **Reranker:** **none** — keeps the whole query path in-cluster/EU (no user query text leaves to any external inference service).

## Recorded baseline (no reranker)  — measured 2026-06-09, 63 queries
| group | n | Hit@1 | Hit@3 | MRR |
|---|---|---|---|---|
| ALL | 63 | 78% | 87% | **0.838** |
| sem | 38 | 71% | 84% | 0.785 |
| kw | 11 | 82% | 91% | 0.882 |
| def | 14 | 93% | 93% | 0.946 |
| nb | 55 | 80% | 87% | 0.851 |
| nn | 8 | 63% | 88% | 0.750 |

Regression thresholds (ALL): Hit@1 ≥ 0.75, Hit@3 ≥ 0.84, MRR ≥ 0.808 (baseline − 0.03).

## Analysis behind the config

**Reranker comparison** (same in-cluster e5-large dense leg, linear 0.4/0.6):
| reranker | Hit@1 | Hit@3 | MRR | median latency | residency | license |
|---|---|---|---|---|---|---|
| none (production) | 78% | 87% | 0.838 | **69 ms** | 🇪🇺 in-cluster | — |
| rerank-v1 (in-cluster) | 79% | 89% | 0.848 | 2967 ms | 🇪🇺 | Elastic |
| bge-reranker-v2-m3 (in-cluster) | 89% | 94% | 0.913 | 3805 ms | 🇪🇺 | Apache-2.0 |
| jina-v2 (EIS) | 87% | 94% | 0.905 | 154 ms | 🇺🇸 us-east-1 | CC-BY-NC |

**Embedding comparison** (linear 0.4/0.6 + jina): EIS fp32 e5-large = Hit@1 90 / Hit@3 95 / MRR 0.929 @ ~992 ms; in-cluster int8 e5-large = 87 / 94 / 0.905 @ ~187 ms.

## Decisions & rationale
- **Embedding → in-cluster int8 e5-large.** ~Parity with EIS fp32 (Hit@3 95→94), ~5× faster, removes the EIS/OpenRouter dependency, keeps data in-EU. (fp32 didn't fit the ~2.2 GB ML tier at the time; ML has since autoscaled larger.)
- **Reranker → none, for now.** A reranker adds ~+7 pp Hit@3 / +11 pp Hit@1, but:
  - **jina** (best quality + fast) runs on **EIS in the US** and is **CC-BY-NC** (can't self-host for production).
  - **bge-reranker-v2-m3** matches jina's quality, is **Apache-2.0** and EU, but in-cluster CPU reranking is **~3.8 s** (Serverless ML is CPU-only).
  - **rerank-v1** is slow *and* weak (esp. nynorsk).
  - No-rerank keeps it fast + fully in-EU. Accepted the quality dip for now.
- **Deferred reranker path (EU + fast + quality):** host bge-reranker-v2-m3 on a **GPU in an EU Azure region** (TEI / Azure AI Foundry) and connect via Elasticsearch's `hugging_face` rerank inference service. Revisit if the quality bump is wanted.

## Caveat
The golden targets are content **slugs** for the current corpus snapshot (259 docs,
crawler-extracted). If the index content changes substantially, refresh
`golden-ki.tsv` and re-record the baseline above — otherwise score drops may reflect
content changes, not retrieval regressions.
