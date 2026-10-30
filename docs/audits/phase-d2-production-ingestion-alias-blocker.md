# Phase D.2 — Production Ingestion Attempt: OpenRouter Alias Blocker

**Date:** 2026-10-29  
**Branch:** `phase-d2-unframed-rag`  
**First deployed HEAD:** `1d3c2f7c Accept OpenRouter BGE model-id casing`  
**Fix commit:** `99803bf8 Handle PostgREST missing ingestion_version fallback`  
**Status:** Resolved. Both blockers were fixed; production ingestion later completed successfully. See `docs/audits/phase-d2-production-ingestion-success.md`.

---

## 1. Production preflight

Checked through the existing admin endpoint `/api/admin/knowledge/unframed-run` with `action: "preflight"`.

| Check                         | Result                         |
| ----------------------------- | ------------------------------ |
| Project                       | `txvkqcitalfbjytmnawq`         |
| OpenRouter key present        | Yes                            |
| Supabase service role present | Yes                            |
| Source hash                   | Matches frozen value           |
| Manifest / 169 chunks         | Matches                        |
| Model contract                | `baai/bge-m3`, 1024 dimensions |
| Tables                        | Present                        |
| Search RPC                    | Present                        |
| Idempotency check             | Passed                         |
| Anonymous table access        | `401` closed                   |
| Anonymous RPC access          | `401` closed                   |
| Documents                     | `0`                            |
| Chunks                        | `0`                            |
| `canIngest`                   | `true`                         |
| `PIERROT_RAG_ENABLED`         | `false`                        |

A minimal paid embedding probe (`action: "probe-embedding"`, one word `ping`) also succeeded:

- requested/client model: `baai/bge-m3`
- dimensions: `1024`
- vectors: `1`
- latency: `486 ms`

No manuscript content was sent in the probe.

---

## 2. Ingestion attempt

Command action:

```json
{
  "action": "ingest",
  "confirm": "INGEST_PAID_EMBEDDING"
}
```

Result:

```json
{
  "status": "failed",
  "code": "embedding_model_mismatch",
  "expectedModel": "baai/bge-m3",
  "actualModel": "parasail-bge-m3"
}
```

The client rejected the response before `applyUnframedIngestion` ran.

### Post-attempt state

A second read-only preflight confirmed:

| Field                 | Value   |
| --------------------- | ------- |
| Document count        | `0`     |
| Chunk count           | `0`     |
| Document present      | `false` |
| Missing chunks        | `169`   |
| Stale chunks          | `0`     |
| `canIngest`           | `true`  |
| `PIERROT_RAG_ENABLED` | `false` |

No partial index and no production data were written.

---

## 3. Cause

OpenRouter routes the same `baai/bge-m3` model through more than one provider:

- Parasail
- DeepInfra

Depending on routing, the response `model` field can be the canonical id or a provider-prefixed alias such as `parasail-bge-m3`.

The deployed client accepted case differences (`BAAI/bge-m3`) but required the canonical id exactly after lowercasing. The probe happened to receive a canonical response; the ingestion hit the Parasail alias.

This is a provider-routing inconsistency, not an unavailable key or model.

---

## 4. Local fix

The fix was made locally only. It was not committed, pushed or deployed.

### Accepted aliases

`lib/knowledge/rag/config.ts` now defines:

```text
baai/bge-m3
parasail-bge-m3
deepinfra-bge-m3
```

Validation is case-insensitive. Unknown models are still rejected. The canonical `baai/bge-m3` id remains the only persisted model id.

### Optional provider pin

Added optional `UNFRAMED_EMBEDDING_PROVIDER`.

When set, requests send:

```json
{
  "provider": {
    "order": ["deepinfra"],
    "allow_fallbacks": false
  }
}
```

This pins ingestion and query embeddings to one provider, preventing mixed-provider vectors in one index. When unset, alias validation still permits either provider.

Updated files:

- `lib/knowledge/rag/config.ts`
- `lib/knowledge/rag/embeddings.ts`
- `app/api/admin/knowledge/unframed-run/route.ts`
- `lib/knowledge/rag/__tests__/rag.test.ts`
- `.env.example`

---

## 5. Verification

| Check                | Result                                                             |
| -------------------- | ------------------------------------------------------------------ |
| RAG suite            | 30 tests passed                                                    |
| All knowledge suites | 7 suites, 90 tests passed                                          |
| Repository-wide Jest | 72 suites, 495 tests passed (`--forceExit`; open handles reported) |
| TypeScript           | `npx tsc --noEmit` — 0 errors                                      |
| Production DB        | Still `0` documents / `0` chunks                                   |
| Production RAG flag  | Still `false`                                                      |

New tests cover:

- canonical response model;
- case-insensitive canonical response;
- `parasail-bge-m3` alias;
- `deepinfra-bge-m3` alias;
- rejection of an unknown model;
- provider slug validation;
- `provider.order` and `allow_fallbacks: false` request body.

---

## 6. Production schema note

The live `knowledge_documents` table does not currently have an `ingestion_version` column, while the local migration file defines it.

The deployed code handled only PostgreSQL error `42703`. Production PostgREST returned `PGRST204` with a schema-cache message, so the fallback did not run. This became the second blocker.

---

## 7. Second attempt: PostgREST schema-cache failure

After the alias fix was deployed, `ingest` was retried.

Result:

```json
{
  "status": "failed",
  "code": "database_failed"
}
```

Post-attempt checks:

| Field                 | Value   |
| --------------------- | ------- |
| Document count        | `0`     |
| Chunk count           | `0`     |
| Document present      | `false` |
| Missing chunks        | `169`   |
| Stale chunks          | `0`     |
| `canIngest`           | `true`  |
| `PIERROT_RAG_ENABLED` | `false` |

No partial write occurred. The document upsert failed before any chunk rows were written.

### Root cause

PostgREST reports a missing column as:

```json
{
  "code": "PGRST204",
  "message": "Could not find the 'ingestion_version' column of 'knowledge_documents' in the schema cache"
}
```

The fallback checked only `error.code === "42703"`.

### Local fix

Added:

- `isMissingIngestionVersionColumn(error)` — accepts `42703` and `PGRST204`, but only when the message names `ingestion_version`;
- `upsertKnowledgeDocument(store, document)` — retries without the top-level column and stores `ingestion_version` in `metadata`.

Updated files:

- `lib/knowledge/rag/supabaseStore.ts`
- `lib/knowledge/rag/__tests__/rag.test.ts`

New tests cover the `PGRST204` schema-cache error, unrelated missing columns, and the metadata retry.

### Verification after the schema fix

| Check               | Result                           |
| ------------------- | -------------------------------- |
| RAG suite           | 32 tests passed                  |
| TypeScript          | `npx tsc --noEmit` — 0 errors    |
| Production DB       | Still `0` documents / `0` chunks |
| Production RAG flag | Still `false`                    |

Committed as `99803bf8 Handle PostgREST missing ingestion_version fallback` and pushed to `main`.

The Vercel deployment for `99803bf8` was **canceled by `ignoreCommand`** from `vercel.json`, not by a build failure. A follow-up commit is required to trigger a fresh production deployment.

---

## 8. What is needed to complete ingestion

1. Trigger a fresh production deployment from the fixed commit.
2. Optionally set `UNFRAMED_EMBEDDING_PROVIDER` in Vercel to pin one provider. Recommended before the final index is built.
3. Re-run `preflight`.
4. Re-run `ingest` with `INGEST_PAID_EMBEDDING`.
5. Confirm the response reports `status: "ingested"` and `verify.status: "ok"`.
6. Keep `PIERROT_RAG_ENABLED=false` until retrieval and access-control checks pass.

No production ingestion has completed yet. The database remains empty.
