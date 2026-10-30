# Phase D.2 — Production Ingestion Success

**Date:** 2026-10-30  
**Branch:** `phase-d2-unframed-rag`  
**Fix commit:** `99803bf8 Handle PostgREST missing ingestion_version fallback`  
**Status:** UNFRAMED index ingested into production. RAG remains disabled. Held-out test not evaluated.

---

## 1. Ingestion result

`action: "ingest"` completed successfully after one transient OpenRouter `429` retry.

| Field             | Value                                                              |
| ----------------- | ------------------------------------------------------------------ |
| Status            | `ingested`                                                         |
| Document          | `doc_unframed_manuscript`                                          |
| Chunks            | `169`                                                              |
| Embedding batches | `6`                                                                |
| Model             | `baai/bge-m3`                                                      |
| Dimensions        | `1024`                                                             |
| Source SHA-256    | `cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923` |
| Manifest hash     | `78f704b33c900897256a7e9a3b6263c3d7114783ae184326be0301d32f0624d2` |
| Parser            | `unframed-parser-v1`                                               |
| Chunker           | `unframed-chunker-v1`                                              |
| Stale chunks      | `0`                                                                |
| Deleted chunks    | `0`                                                                |

The document was written with the production schema fallback: `ingestion_version` is stored in `metadata` because the live table lacks that column.

---

## 2. Integrity verification

| Check                           | Result       |
| ------------------------------- | ------------ |
| Document count is one           | Passed       |
| Chunk count is 169              | Passed       |
| Metadata matches local manifest | Passed       |
| No missing chunks               | Passed       |
| No extra chunks                 | Passed       |
| No duplicate IDs                | Passed       |
| All embeddings valid            | Passed       |
| All references valid            | Passed       |
| Anonymous table access          | `401` closed |
| Anonymous RPC access            | `401` closed |
| `PIERROT_RAG_ENABLED`           | `false`      |

Database state:

```text
documents: 1
chunks: 169
missing: 0
extra: 0
duplicate IDs: 0
bad embeddings: 0
bad references: 0
```

---

## 3. Transient OpenRouter failure

One ingestion attempt stopped before any database write with:

```json
{
  "status": "failed",
  "code": "embedding_provider",
  "providerStatus": 429
}
```

The database remained `0 / 0`. After a 60-second pause, a one-word embedding probe succeeded, and the ingestion retry completed normally.

No manuscript text was written during the failed attempt.

---

## 4. Semantic evaluation

Evaluated through the production admin endpoint, using the frozen C4 protocol hashes:

- question set: `d65b319474378ebc2f0f71ba946f11a4fdbf93417b1c53d05288834eb816d167`
- protocol: `d2dba136d553ddb959880bc315d4b886474f3559899dadfd171e60574d4541b8`

### Development split — 66 questions

| Metric          | Result             |
| --------------- | ------------------ |
| Verified        | `58`               |
| Answerable      | `42`               |
| Unanswerable    | `16`               |
| Recall@5        | `36/42 = 0.857`    |
| Precision@5     | `57/210 = 0.271`   |
| MRR             | `29.95/42 = 0.713` |
| Evidence misses | `6/42 = 0.143`     |

By language:

| Language mode                   |        Recall@5 |     MRR |
| ------------------------------- | --------------: | ------: |
| English                         | `17/20 = 0.850` | `0.700` |
| Russian with Latin proper nouns |   `5/6 = 0.833` | `0.833` |
| Pure Russian                    | `14/16 = 0.875` | `0.684` |

### Calibration split — 24 questions

| Metric          | Result            |
| --------------- | ----------------- |
| Verified        | `24`              |
| Answerable      | `12`              |
| Unanswerable    | `12`              |
| Recall@5        | `12/12 = 1.000`   |
| Precision@5     | `31/60 = 0.517`   |
| MRR             | `11.5/12 = 0.958` |
| Evidence misses | `0/12 = 0.000`    |

By language:

| Language mode                   |      Recall@5 |     MRR |
| ------------------------------- | ------------: | ------: |
| English                         | `6/6 = 1.000` | `0.917` |
| Russian with Latin proper nouns | `2/2 = 1.000` | `1.000` |
| Pure Russian                    | `4/4 = 1.000` | `1.000` |

### Held-out test

**Not evaluated.** The 44-question test split remains untouched until the retrieval configuration and threshold are frozen.

Semantic recall is not answer quality. No generation-quality claim is made.

---

## 5. Remaining blocker: retrieval configuration

The post-ingestion retrieval smoke returned:

```json
{
  "outcome": "unavailable",
  "code": "missing_configuration"
}
```

Cause: `UNFRAMED_EMBEDDING_MODEL` is not configured in the Vercel production environment.

The ingestion and evaluation endpoints hardcode the verified model contract, so they succeeded. The Pierrot retrieval path reads `UNFRAMED_EMBEDDING_MODEL` from the environment and correctly fails closed when it is absent.

Required Vercel variable:

```text
UNFRAMED_EMBEDDING_MODEL=baai/bge-m3
```

`PIERROT_RAG_ENABLED` must remain `false` for now.

After the variable is added:

1. Redeploy or trigger a new production deployment.
2. Run `verify` again.
3. Confirm `retrievalSmoke` returns `relevant_results` for both English and Russian probes.
4. Keep `PIERROT_RAG_ENABLED=false` until access-control and fallback tests pass.

---

## 6. Residual notes

- The live `knowledge_documents` table lacks `ingestion_version`; the code stores it in `metadata`.
- Ingestion used whichever OpenRouter provider routing selected per batch. The alias fix accepts Parasail and DeepInfra responses. If vector consistency needs to be guaranteed, re-index with `UNFRAMED_EMBEDDING_PROVIDER` pinned, then re-run evaluation.
- The provisional threshold remains `0.45`; it was not calibrated from production scores.
- The held-out test split remains untouched.
- No public RAG exposure was enabled.
