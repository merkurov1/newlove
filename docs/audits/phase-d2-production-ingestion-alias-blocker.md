# Phase D.2 — Production Ingestion Attempt: OpenRouter Alias Blocker

**Date:** 2026-10-29  
**Branch:** `phase-d2-unframed-rag`  
**Deployed HEAD:** `1d3c2f7c Accept OpenRouter BGE model-id casing`  
**Status:** Ingestion stopped before any database write. No commit, push or deploy was made after the attempt. `PIERROT_RAG_ENABLED` remains `false`.

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

The deployed code handles this by writing `ingestion_version` into `metadata` when PostgreSQL reports `42703`. This is a schema/migration-history reconciliation issue, not the cause of the alias failure.

---

## 7. What is needed to complete ingestion

1. Commit the local alias/provider fix.
2. Push to `main` so Vercel deploys the fixed route.
3. Optionally set `UNFRAMED_EMBEDDING_PROVIDER` in Vercel to pin one provider. Recommended before the final index is built.
4. Re-run `preflight`.
5. Re-run `ingest` with `INGEST_PAID_EMBEDDING`.
6. Confirm the response reports `status: "ingested"` and `verify.status: "ok"`.
7. Keep `PIERROT_RAG_ENABLED=false` until retrieval and access-control checks pass.

No push or deploy was performed in this local fix.
