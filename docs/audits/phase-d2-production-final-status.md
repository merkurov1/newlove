# Phase D.2 — Production Status (2026-10-30)

**Status:** UNFRAMED index is ingested in production. RAG is still disabled. One configuration blocker remains before retrieval can be tested end-to-end.

**Branch:** `phase-d2-unframed-rag`  
**Production fix commit:** `99803bf8 Handle PostgREST missing ingestion_version fallback`  
**Push for this report:** not performed  
**Held-out C4 test:** not evaluated

---

## 1. Production ingestion

The production index was created successfully.

| Field              | Value                                                              |
| ------------------ | ------------------------------------------------------------------ |
| Status             | `ingested`                                                         |
| Document           | `doc_unframed_manuscript`                                          |
| Documents in table | `1`                                                                |
| Chunks             | `169`                                                              |
| Embedding requests | `6` batches                                                        |
| Model              | `baai/bge-m3`                                                      |
| Dimensions         | `1024`                                                             |
| Source SHA-256     | `cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923` |
| Manifest hash      | `78f704b33c900897256a7e9a3b6263c3d7114783ae184326be0301d32f0624d2` |
| Parser             | `unframed-parser-v1`                                               |
| Chunker            | `unframed-chunker-v1`                                              |
| Stale chunks       | `0`                                                                |
| Deleted chunks     | `0`                                                                |

### Transient failure

One earlier attempt stopped before writing with OpenRouter `429`. After a 60-second pause, a one-word probe succeeded and the ingestion retry completed. The database stayed empty during the failed attempt.

---

## 2. Integrity checks

| Check                                | Result       |
| ------------------------------------ | ------------ |
| Document count is one                | Passed       |
| Chunk count is 169                   | Passed       |
| Metadata matches the frozen manifest | Passed       |
| No missing chunks                    | Passed       |
| No extra chunks                      | Passed       |
| No duplicate IDs                     | Passed       |
| All embeddings valid                 | Passed       |
| All references valid                 | Passed       |
| Anonymous table access               | `401` closed |
| Anonymous RPC access                 | `401` closed |
| `PIERROT_RAG_ENABLED`                | `false`      |

Database verification:

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

## 3. Semantic evaluation

Frozen hashes verified at runtime:

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

The 44-question held-out split was **not evaluated**. The configuration and threshold are not frozen yet.

Semantic recall is not answer quality. No generation-quality claim is made.

---

## 4. Remaining blocker

The post-ingestion retrieval smoke returned:

```json
{
  "outcome": "unavailable",
  "code": "missing_configuration"
}
```

Cause: `UNFRAMED_EMBEDDING_MODEL` is not configured in Vercel production.

Required variable:

```text
UNFRAMED_EMBEDDING_MODEL=baai/bge-m3
```

The ingestion and evaluation endpoints hardcode the verified model contract, so they succeeded. The live Pierrot retrieval path reads this environment variable and fails closed when it is absent.

`PIERROT_RAG_ENABLED` must remain `false` until retrieval and access-control checks pass.

---

## 5. Tests

| Check                | Result                                                                 |
| -------------------- | ---------------------------------------------------------------------- |
| RAG tests            | `32` passed                                                            |
| All knowledge tests  | `7` suites, `92` tests passed                                          |
| Repository-wide Jest | `72` suites, `497` tests passed (`--forceExit`; open handles reported) |
| TypeScript           | `npx tsc --noEmit` — `0` errors                                        |

New coverage includes:

- `PGRST204` schema-cache fallback;
- `42703` fallback;
- metadata storage of `ingestion_version`;
- OpenRouter provider aliases;
- optional provider pin;
- retrieval authorization and fallbacks;
- deterministic ingestion and stale-chunk guard.

---

## 6. Schema and provider notes

### `ingestion_version`

The live `knowledge_documents` table does not have `ingestion_version`, while the local migration defines it. The deployed code stores it in `metadata` when PostgREST or PostgreSQL reports the missing column.

This works, but the migration history and live schema should be reconciled separately.

### Provider routing

OpenRouter can serve `baai/bge-m3` through Parasail or DeepInfra. Both provider aliases are accepted. The current index may contain vectors from more than one provider because no provider pin was set during ingestion.

If strict vector consistency is required, re-index with:

```text
UNFRAMED_EMBEDDING_PROVIDER=deepinfra
```

and repeat the evaluation. The existing index is already valid and produced strong dev/calibration results.

### Threshold

`UNFRAMED_RAG_MIN_SIMILARITY=0.45` remains provisional and uncalibrated. It was not selected from production scores and must not be presented as validated.

---

## 7. Next steps

1. Add `UNFRAMED_EMBEDDING_MODEL=baai/bge-m3` in Vercel.
2. Trigger a new production deployment.
3. Run `action: "verify"` and confirm both English and Russian retrieval probes return `relevant_results`.
4. Keep `PIERROT_RAG_ENABLED=false`.
5. Calibrate the threshold on calibration data.
6. Freeze the configuration.
7. Evaluate the held-out test split once.
8. Enable RAG only after access-control, fallback and retrieval tests pass.

No push, commit or deployment was performed for this report.
