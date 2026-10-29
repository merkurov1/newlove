# Phase D — Architecture Assessment and Blocker Report

**Status:** Stopped before implementation. No files were created or modified. No branch was created, no commit or push, no dependency changes, no model download, no paid API call, no Supabase access, no migration, no ingestion and no Pierrot integration.

**Current branch:** `phase-c4-multilingual-bakeoff`

**Working tree:** existing untracked Phase B–C.4 files preserved unchanged.

---

## 1. Verified repository findings

- Canonical manuscript: `app/unframed/Unframed.markdown`
- SHA-256: `cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923`
- Manifest hash: `78f704b33c900897256a7e9a3b6263c3d7114783ae184326be0301d32f0624d2`
- Parser/chunker: `unframed-parser-v1` / `unframed-chunker-v1`
- Existing knowledge tests: **6 suites, 60 tests passed**
- Existing local implementations remain intact under `lib/knowledge/` and `scripts/knowledge/`.

Relevant existing integration points:

- `app/api/pierrot-web/route.ts` uses DeepSeek only, preserves conversation persistence, commercial intents, replay, rate limits and `maxDuration = 60`.
- Admin status is derived server-side through `getCurrentUser()` and `requireAdminFromRequest()`. The legacy `x-admin-key` path exists separately in Pierrot.
- `lib/supabase/server.ts` supports service-role clients with no persisted cookies.
- Existing migrations contain no `vector`, `pgvector`, embedding table or RAG schema.
- `.env.local` contains only `VERCEL_OIDC_TOKEN`; no Supabase URL, anon key, service-role key, embedding provider key or database URL is available in this workspace.
- No live Supabase schema, extension list, RLS policy, grant or RPC could be inspected.

This means both the **embedding decision** and the **live database audit** are blockers, not implementation details.

---

## 2. Hard blocker: no authorized multilingual embedding path

No suitable model/provider is available and authorized:

- No embedding API key or provider is configured.
- `.env.example` documents DeepSeek only; no embedding provider.
- The local ONNX candidate found earlier is `all-MiniLM-L6-v2`:
  - 384 dimensions
  - English-only
  - **not acceptable for Russian-to-English retrieval**
- No local runtime is installed:
  - `onnxruntime-node`: absent
  - `onnxruntime-web`: absent
  - Transformers.js: absent
  - Python `torch`, `sentence-transformers`, `onnxruntime`: absent
- No multilingual model weights are cached locally.

Installing a runtime, downloading weights or calling a paid embedding API would violate the Phase D constraints. Retrieval cannot be implemented production-compatibly without first choosing and authorizing a model/provider.

### Smallest decision required

Choose one:

**Option A — Approved managed multilingual embedding API**

Recommended for the smallest production path:

- Candidate: `text-embedding-3-small`
- Explicit dimension: **1536**
- Multilingual support must be validated against the frozen C4 Russian questions.
- The existing `openai` SDK is already installed, but an `OPENAI_API_KEY` and paid usage must be explicitly approved.
- Manuscript chunks would be sent to the embedding provider; this is a third-party data-processing decision.
- Query embeddings and document embeddings would both be generated through the same model.
- One-time ingestion cost is small; per-message query embedding cost is provider-pricing dependent and must be confirmed before activation.

**Option B — Approved self-hosted multilingual model**

- Suitable multilingual model family must be named, versioned and have a fixed vector dimension.
- It requires an offline ingestion runtime and a production query-embedding host.
- Vercel serverless constraints make large local model inference unattractive unless a separate approved service exists.

**Option C — Defer semantic retrieval**

- Implement Supabase full-text search only.
- This does not satisfy the pure-Russian requirement and must not be presented as multilingual semantic retrieval.

No option can be implemented silently.

---

## 3. Proposed minimal data model

Subject to live `vector` extension verification and model approval:

```text
knowledge.documents
  id                  text primary key
  source_id           text unique
  source_type         text
  canonical_ref       text
  title               text
  language            text
  access_scope        text  -- public | owner
  approval_state      text  -- pending | approved | revoked
  source_hash         text
  source_version      text
  chunker_version     text
  embedding_model     text
  embedding_dimension integer
  ingested_at         timestamptz
  updated_at          timestamptz

knowledge.chunks
  id                  text primary key
  document_id         text references documents(id) on delete cascade
  chunk_index         integer
  section_path        text[]
  heading             text
  content             text
  content_hash        text
  char_start          integer
  char_end            integer
  embedding           vector(1536)  -- dimension depends on approved model
  embedding_model     text
  created_at          timestamptz
  unique (document_id, chunk_index)

knowledge.ingestion_runs
  id                  uuid primary key
  document_id         text references documents(id)
  status              text
  source_hash         text
  chunker_version     text
  embedding_model     text
  created_count       integer
  updated_count       integer
  skipped_count       integer
  failed_count        integer
  error_code          text
  started_at          timestamptz
  finished_at         timestamptz
```

### Indexing decision

The UNFRAMED corpus is only **169 chunks**. A sequential pgvector scan is acceptable initially. An HNSW or IVFFlat index is not justified yet and can be added after the corpus grows or latency measurements require it.

### Access model

- Dedicated `knowledge` schema, not exposed through PostgREST if Supabase configuration permits.
- `REVOKE ALL` from `PUBLIC`, `anon`, `authenticated`.
- Service-role-only access through `SECURITY DEFINER` RPCs.
- RLS enabled as defense-in-depth.
- The schema name alone is not a security boundary.
- Public retrieval must filter `access_scope = 'public'` and explicit approval state **inside the query**, before text enters the model context.
- No owner-only RAG in the public Pierrot route in this phase.

### Migration status

No migration file was created. The dimension, extension availability and access model cannot be finalized until the model/provider is approved and live Supabase is inspected read-only.

---

## 4. Proposed ingestion design

Reuse the existing Phase B parser/chunker. Do not create a second chunker.

1. Resolve the canonical source and verify SHA-256.
2. Parse and chunk using the existing `unframed-parser-v1` / `unframed-chunker-v1`.
3. Compute stable chunk IDs and content hashes.
4. Compare source hash and chunker version with the current document.
5. Skip unchanged chunks; embed only new or changed chunks.
6. Write embeddings and metadata in a new ingestion run.
7. Publish the new run only after all chunks succeed.
8. Remove stale chunks safely.
9. Support `--dry-run` with no database writes and no content logging.
10. Run only as an explicit local/admin script. Never during build, page rendering or a visitor request.

The current ingestion work would be a no-op/blocked until the embedding model is authorized.

---

## 5. Proposed retrieval design

Server-only module, disabled by default:

```text
PIERROT_RAG_ENABLED=false
```

Retrieval flow:

1. Verify the request server-side using existing `getCurrentUser()` / `requireAdminFromRequest()`.
2. Derive access scope server-side. Never accept `scope`, `isAdmin`, role, document ID or chunk ID from the client.
3. For this phase, public retrieval only; no owner RAG in the public route.
4. Embed the query with the same approved model family.
5. Call a bounded Supabase RPC returning chunk IDs, section metadata, similarity and text.
6. Apply a calibrated threshold and query/result/context limits.
7. Return `relevant_results`, `weak_match`, `no_match` or `unavailable`.
8. Never treat database failure as “no answer.”
9. Never log queries, passages, embeddings or secrets.

Proposed integration point: inside the existing `plan.useModel` branch of `app/api/pierrot-web/route.ts`, after replay handling and before `callDeepSeek`. Evidence would be appended to the server-side system prompt as JSON-escaped untrusted data. Existing prompts, persistence, rate limits and DeepSeek behavior remain unchanged when the flag is off.

No integration code was written because the embedding dependency is not authorized.

---

## 6. Security findings and required controls

- The current `unframed_admin` and `unframed_access` cookies are literal boolean cookies and are forgeable. They must never authorize RAG.
- The legacy `x-admin-key` path in Pierrot is a shared secret, not a user session. It must not grant owner RAG without a separate review.
- `public/unframed/Unframed.markdown` remains a static public asset; the manuscript should not be treated as private until that exposure is separately assessed.
- Public retrieval must filter access scope in SQL, not after model generation.
- Service-role credentials must remain server-only.
- Retrieved manuscript text must be treated as untrusted data, with explicit prompt-injection boundaries.
- Owner-only content must never be returned to an anonymous request.

---

## 7. Evaluation status

No new multilingual strategy could be measured.

Frozen C4 lexical results remain:

| Strategy | Test Recall@5 | Test Precision@5 | Test MRR | Pure-Russian Recall@5 |
|---|---:|---:|---:|---:|
| A — original BM25 | 13/30 = 0.433 | 14/150 = 0.093 | 0.361 | 0/10 |
| B — field-weighted BM25 | 14/30 = 0.467 | 18/150 = 0.120 | 0.337 | 0/10 |
| C — multilingual semantic | blocked | blocked | blocked | blocked |
| D — hybrid | blocked | blocked | blocked | blocked |

The frozen C4 protocol and fixture were not changed. No embedding retrieval metrics exist and no production-readiness claim is made.

---

## 8. Exact steps required for a later authorized implementation

1. **Approve the embedding decision**: provider/model ID, vector dimension, cost, data-processing terms and whether manuscript chunks may leave the infrastructure.
2. **Provide authorized server-side credentials** without exposing them in client code or logs.
3. **Inspect Supabase read-only**: confirm `vector` availability, schemas, grants, RLS and PostgREST exposure.
4. **Create, review and apply a migration on a non-production branch** only.
5. **Run a dry-run ingestion** and verify chunk counts, source hash, dimensions and idempotency without writing.
6. **Run authorized ingestion** into the approved isolated schema.
7. **Implement retrieval and tests** with the flag off.
8. **Evaluate against the frozen C4 fixture**, calibrating thresholds only on the calibration split.
9. **Run security tests**: anonymous private access, client scope spoofing, service-role exposure, prompt injection, timeouts, empty index and provider errors.
10. **Shadow test** with no effect on visitor responses before enabling the flag.
11. **Enable only after explicit approval**, with rollback by setting `PIERROT_RAG_ENABLED=false`.

---

## 9. Current final state

- No implementation performed.
- No files created or modified in Phase D.
- No dependencies installed.
- No model downloaded.
- No provider called.
- No Supabase or production data touched.
- No migration applied.
- Existing 60 knowledge tests pass.
- Manuscript hashes unchanged.
- No commit or push.

**Blocker:** a specific authorized multilingual embedding model/provider and a read-only Supabase/pgvector verification are required before a safe Phase D implementation can begin.
