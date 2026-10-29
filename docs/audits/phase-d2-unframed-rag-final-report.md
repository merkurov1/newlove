# Phase D.2 — UNFRAMED RAG: Final Report

**Status:** Local implementation complete. Migration not applied. No ingestion executed. No embedding API call. No Supabase connection. No commit, push, merge, deploy or production configuration change.

**Branch:** `phase-d2-unframed-rag`  
**HEAD:** `60205097fe790c8fadc8a6cd68608dc4044fd44a` (unchanged)

**Detailed report:** `docs/audits/phase-d2-unframed-rag-implementation.md`

---

## 1. Result

A source-grounded, multilingual RAG layer for UNFRAMED is implemented locally and integrated into Pierrot behind a default-off feature flag.

The existing DeepSeek generation path, replay handling, rate limiting, authentication, consent and conversation persistence are preserved.

The new layer is not production-enabled and has not been exercised against live Supabase or OpenRouter.

---

## 2. Implemented components

### Embedding provider

- OpenRouter endpoint: `POST https://openrouter.ai/api/v1/embeddings`
- Verified model: `baai/bge-m3`
- Dimensions: 1024
- Context: 8194 tokens
- Batch size: 32
- Ingestion timeout: 20 seconds per batch
- Retrieval timeout: 1.5 seconds total
- Retries: none
- Authentication: server-side `OPENROUTER_API_KEY` only

The contract was verified against the OpenRouter OpenAPI document and public model catalogue on 2026-10-29.

### Knowledge layer

Created under `lib/knowledge/rag/`:

| File                | Purpose                                                 |
| ------------------- | ------------------------------------------------------- |
| `config.ts`         | Model, dimensions, flags, limits, provisional threshold |
| `authorization.ts`  | Owner-only retrieval identity checks                    |
| `embeddings.ts`     | OpenRouter client, batching, validation, timeout        |
| `ingestion.ts`      | Deterministic plan, stale guard, batched writes         |
| `supabaseStore.ts`  | Service-role repository and search RPC adapter          |
| `retrieval.ts`      | Owner-scoped retrieval and fallback outcomes            |
| `pierrotContext.ts` | Untrusted evidence serialization and context budget     |
| `evaluation.ts`     | Semantic Recall@5, Precision@5, MRR metrics             |
| `types.ts`          | RAG contracts                                           |
| `errors.ts`         | Safe error codes                                        |

### Database migration

**File:** `migrations/2026-10-29_create_knowledge_rag.sql`

**Status:** proposed for review, not applied.

Design:

- closed `public.knowledge_documents` and `public.knowledge_chunks`;
- `vector(1024)` embeddings;
- model and dimension consistency enforced by a composite foreign key;
- RLS enabled, no anon/authenticated policies;
- table access revoked from `PUBLIC`, `anon`, `authenticated`;
- service-role-only search RPC with SQL-level access filtering;
- no HNSW/IVFFlat index for the current 169-chunk corpus;
- parser, chunker, ingestion, model and dimension metadata persisted with the index.

### Ingestion CLI

**File:** `scripts/knowledge/phase-d2-ingest.ts`

Dry run:

```bash
UNFRAMED_EMBEDDING_MODEL=baai/bge-m3 \
bun run scripts/knowledge/phase-d2-ingest.ts --dry-run
```

Verified dry-run result:

| Field                 | Value                                                              |
| --------------------- | ------------------------------------------------------------------ |
| Status                | `dry_run`                                                          |
| Chunks                | 169                                                                |
| Embedding batches     | 6                                                                  |
| Source SHA-256        | `cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923` |
| Manifest hash         | `78f704b33c900897256a7e9a3b6263c3d7114783ae184326be0301d32f0624d2` |
| Parser/chunker checks | all true                                                           |
| Embedding API calls   | 0                                                                  |
| Database writes       | 0                                                                  |

Apply mode requires explicit `--confirm-paid-embedding`. Stale chunks require explicit `--allow-stale-delete`; otherwise ingestion fails before writing.

### Evaluation harness

**File:** `scripts/knowledge/phase-d2-evaluate.ts`

No-cost mode verifies frozen hashes and emits a blocked report:

```bash
bun run scripts/knowledge/phase-d2-evaluate.ts --local-evaluation
```

Paid mode is explicit:

```bash
bun run scripts/knowledge/phase-d2-evaluate.ts \
  --local-evaluation \
  --authorized-paid-evaluation
```

Only development and calibration questions are embedded. The held-out test split remains untouched until the configuration is frozen.

### Pierrot integration

**File:** `app/api/pierrot-web/route.ts`

Retrieval runs only inside the existing model-generation branch, immediately before `callDeepSeek`.

Security behavior:

- only a verified owner identity can trigger owner-scoped retrieval;
- `x-admin-key` does not authorize manuscript retrieval;
- `x-admin-secret` / `system-admin` does not authorize manuscript retrieval;
- request-body scope or role claims are ignored;
- the SQL query also enforces access class, document, model and dimensions;
- anonymous and authenticated non-owner users cannot reach the owner index.

Fallback behavior:

| Condition                         | Behavior                                   |
| --------------------------------- | ------------------------------------------ |
| Flag absent                       | Exact existing Pierrot path                |
| Flag false                        | Exact existing Pierrot path                |
| Verified owner, relevant evidence | Bounded evidence appended to system prompt |
| Weak/no match                     | Existing prompt path                       |
| Embedding provider unavailable    | Existing prompt path                       |
| Supabase unavailable              | Existing prompt path                       |
| Timeout                           | Existing prompt path                       |
| Non-owner request                 | Owner retrieval not attempted              |

The route logs only outcome, scope, chunk count, latency and error code. It does not log queries, passages, vectors or credentials.

---

## 3. Configuration names

Added to `.env.example` with placeholders only:

```text
OPENROUTER_API_KEY=your-openrouter-key
UNFRAMED_EMBEDDING_MODEL=baai/bge-m3
PIERROT_RAG_ENABLED=false
UNFRAMED_RAG_MIN_SIMILARITY=0.45
```

`0.45` is provisional and uncalibrated. It must be selected on the C4 calibration split before production use.

---

## 4. Verification

| Check                     | Result                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| RAG tests                 | 25 passed                                                                                          |
| All knowledge tests       | 7 suites, 85 tests passed                                                                          |
| Repository-wide Jest      | 70 suites, 469 tests passed (`--forceExit`; Jest reported open handles and did not exit by itself) |
| TypeScript                | `npx tsc --noEmit` — 0 errors                                                                      |
| C4 baseline re-run        | A: 13/30, B: 14/30, pure-Russian: 0/10                                                             |
| Ingestion dry run         | 169 chunks, 6 batches, hashes match                                                                |
| Evaluation blocked report | Frozen hashes verified; no paid call                                                               |
| Secrets in new files      | none found                                                                                         |

Coverage includes:

- default-off flag;
- owner authorization and shared-secret exclusion;
- model/dimension mismatch;
- OpenRouter batching, response validation, HTTP failures and timeout;
- deterministic chunk IDs and hashes;
- idempotent re-application;
- stale-chunk review guard;
- database write failure;
- owner-scope refusal;
- relevant/weak/no-match outcomes;
- provider, database and timeout fallbacks;
- evidence JSON encoding and context budget;
- semantic ranking and metric counts.

---

## 5. External calls and side effects

### Performed

- read-only `GET` requests to OpenRouter documentation, OpenAPI specification and public model catalogue;
- local tests, type check, C4 baseline evaluation, ingestion dry run and blocked evaluation report.

### Not performed

- no OpenRouter embedding request;
- no DeepSeek request;
- no Supabase connection or query;
- no migration application;
- no real ingestion;
- no package installation or dependency change;
- no manuscript text sent to any provider;
- no commit, push, merge, deploy or Vercel change;
- no production environment change.

---

## 6. Remaining blockers

1. Migration is not applied or live-verified.
2. pgvector availability and PostgREST exposure are unverified.
3. Live RLS, grants and RPC behavior are unverified.
4. No owner approval for paid OpenRouter embeddings or third-party manuscript processing.
5. No Supabase credentials available in this workspace.
6. Similarity threshold is provisional.
7. Public manuscript copy remains at `public/unframed/Unframed.markdown`; public-use rights are unresolved.
8. Admin role dual-write inconsistency between `users.role` and `user_metadata.role` remains unverified.
9. Ingestion writes are not one PostgreSQL transaction; a late database failure can leave a partial index.
10. No live end-to-end route test with real OpenRouter/Supabase.

---

## 7. Required next steps

1. Owner approves:
   - `baai/bge-m3`;
   - 1024 dimensions;
   - paid OpenRouter usage;
   - sending manuscript chunks to OpenRouter.
2. Owner supplies `OPENROUTER_API_KEY` and Supabase server credentials through the approved environment mechanism.
3. Run the read-only SQL audit from the Phase D.1 report.
4. Review and apply the migration in a non-production project first.
5. Run ingestion dry-run, then controlled apply.
6. Verify document/chunk counts, model, dimensions and stale count.
7. Run the evaluation harness on development/calibration only.
8. Freeze threshold and model configuration.
9. Run the held-out test split once.
10. Enable `PIERROT_RAG_ENABLED=true` only after access-control, retrieval and fallback checks pass.
11. Keep the flag disabled in Vercel until then.

**Stopped after local implementation. Awaiting owner approval and live-environment verification.**
