# ki-content retrieval — eval baseline & analysis

Regression baseline for search quality, plus the analysis behind the current
config. Re-run after any retrieval/embedding/reranker change or index rebuild:

```sh
cd infrastructure/elasticsearch && node --env-file=.env eval/run-golden.mjs
# variant (not checked against baseline):
node --env-file=.env eval/run-golden.mjs --rerank .jina-reranker-v2-base-multilingual
```
`run-golden.mjs` runs the golden set (`golden-ki.tsv`) and **exits non-zero if the
ALL-group numbers drop more than 0.03 below the baseline**.

## Current production config
- **Embedding:** in-cluster, int8-quantized `multilingual-e5-large` (`e5-large-incluster`) — EU, on the deployment's ML nodes.
- **Retrieval:** `linear` 0.4 BM25 / 0.6 dense (minmax), `rank_window_size` 50.
- **Reranker:** **none** — keeps the whole query path in-cluster/EU (no user query text leaves to any external inference service).

## Recorded baseline (no reranker) — measured 2026-06-09
**Corpus:** 60 production docs (Umbraco Delivery API, `cms-kinorgeportal-prod…workers.dev`), guidance-heavy (`veiledningSteg`/`enkelVeiledning`/`eksempel`/`artikkel`); no glossary/faq. **Golden set:** 46 queries (sem + kw, nb + nn) — re-derived from this corpus; **first-pass, relevance to be sanity-checked.**

| group | n | Hit@1 | Hit@3 | MRR |
|---|---|---|---|---|
| ALL | 46 | 83% | 93% | **0.893** |
| sem | 36 | 78% | 92% | 0.863 |
| kw | 10 | 100% | 100% | 1.000 |
| nb | 40 | 83% | 95% | 0.896 |
| nn | 6 | 83% | 83% | 0.875 |

Regression thresholds (ALL): Hit@1 ≥ 0.80, Hit@3 ≥ 0.90, MRR ≥ 0.863 (baseline − 0.03).

## Analysis behind the config
Measured on the **prior 259-doc corpus** (mostly glossary), but the *relative* findings
still drive the config decisions:

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
- **Reranker → none, for now.** A reranker added ~+7 pp Hit@3 / +11 pp Hit@1 on the prior corpus, but:
  - **jina** (best quality + fast) runs on **EIS in the US** and is **CC-BY-NC** (can't self-host for production).
  - **bge-reranker-v2-m3** matches jina's quality, is **Apache-2.0** and EU, but in-cluster CPU reranking is **~3.8 s** (Serverless ML is CPU-only).
  - **rerank-v1** is slow *and* weak (esp. nynorsk).
  - No-rerank keeps it fast + fully in-EU. Accepted the quality dip for now (and on the leaner production corpus, no-rerank already reaches Hit@3 93%).
- **Deferred reranker path (EU + fast + quality):** host bge-reranker-v2-m3 on a **GPU in an EU Azure region** (TEI / Azure AI Foundry) and connect via Elasticsearch's `hugging_face` rerank inference service. Revisit if the quality bump is wanted.

## Caveat
The golden targets are content **slugs** for the current production corpus (60 docs).
If the index content changes substantially, refresh `golden-ki.tsv` + re-record the
baseline above — otherwise score drops may reflect content changes, not retrieval
regressions. The golden set is a first-pass derivation; review query→target relevance.
