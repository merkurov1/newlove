# Phase D.2 — UNFRAMED RAG Implementation (Local Only)

**Status:** Local implementation complete. Migration not applied. No ingestion executed. No embedding API call. No Supabase connection. No commit, push, merge, deploy or production configuration change.

**Branch:** `phase-d2-unframed-rag` (created locally from `phase-c4-multilingual-bakeoff`; original HEAD `60205097fe790c8fadc8a6cd68608dc4044fd44a` unchanged).

**Working tree:** existing Phase B–C.4 and Phase D.1 work preserved. Nothing was reset, cleaned, stashed or deleted.

---

## 1. Verified current state

| Item             | Verified value                                                     |
| ---------------- | ------------------------------------------------------------------ |
| Canonical source | `app/unframed/Unframed.markdown`                                   |
| Source SHA-256   | `cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923` |
| Public copy      | `public/unframed/Unframed.markdown`, byte-identical                |
| Parser           | `unframed-parser-v1`                                               |
| Chunker          | `unframed-chunker-v1`                                              |
| Chunks           | 169                                                                |
| Manifest hash    | `78f704b33c900897256a7e9a3b6263c3d7114783ae184326be0301d32f0624d2` |
| C4 question hash | `d65b319474378ebc2f0f71ba946f11a4fdbf93417b1c53d05288834eb816d167` |
| C4 protocol hash | `d2dba136d553ddb959880bc315d4b886474f3559899dadfd171e60574d4541b8` |
| Knowledge tests  | 7 suites, 90 tests passed                                          |
| Type check       | `npx tsc --noEmit` — 0 errors                                      |

The existing parser, chunker, C4 fixture, C4 protocol and C4 evaluator were reused without modification.

---

## 2. Verified OpenRouter embedding contract

Verified against the live OpenRouter OpenAPI document and embeddings model catalogue on 2026-10-29.

### Endpoint

```text
POST https://openrouter.ai/api/v1/embeddings
Authorization: Bearer <OPENROUTER_API_KEY>
Content-Type: application/json
```

### Request

```json
{
  "model": "baai/bge-m3",
  "input": ["text one", "text two"],
  "encoding_format": "float"
}
```

The OpenAPI schema accepts a string or an array of strings. The implementation sends arrays in bounded batches.

### Response

```json
{
  "data": [{ "object": "embedding", "index": 0, "embedding": [0.1, 0.2] }],
  "model": "baai/bge-m3",
  "usage": { "prompt_tokens": 8, "total_tokens": 8 }
}
```

The client requires:

- `data` length equal to the input batch length;
- contiguous `index` values from `0` to `n-1`;
- a finite numeric vector of exactly **1024** dimensions;
- a response `model` equal to `baai/bge-m3` or a verified provider alias
  (`parasail-bge-m3`, `deepinfra-bge-m3`, case-insensitive); unknown models are rejected.

OpenRouter may route the same model through different providers and return a
provider-prefixed model id. The canonical `baai/bge-m3` id is persisted;
optional `UNFRAMED_EMBEDDING_PROVIDER` pins one provider with fallbacks disabled
for consistent vectors across ingestion and query time.

Any mismatch fails closed. No response body is logged.

### Selected model

| Property                             | Value                         |
| ------------------------------------ | ----------------------------- |
| OpenRouter model ID                  | `baai/bge-m3`                 |
| Dimensions                           | 1024                          |
| Context length                       | 8194 tokens                   |
| Modality                             | `text -> embeddings`          |
| Multilingual catalogue description   | Yes                           |
| Catalogue prompt price at audit time | `0.00000001` per prompt token |

`all-MiniLM-L6-v2` remains rejected as English-only.

### Operational choices

- Batch size: 32, conservative because OpenRouter does not publish a hard array limit.
- Ingestion timeout: 20 seconds per batch.
- Retrieval timeout: 1.5 seconds for the whole embed + search operation.
- Retries: none.
- Base64 embeddings are not accepted; `encoding_format: "float"` is required.
- Only one model/dimension pair may be indexed. The migration and client reject any other model or dimension.

---

## 3. Manuscript and access boundaries

### Source

- Ingestion reads only `app/unframed/Unframed.markdown`.
- Any path containing a `public/` segment is refused.
- The source hash must match the frozen SHA-256 before a plan is built.
- No manuscript text is copied into public directories, reports, fixtures or logs.

### Public exposure remains unresolved

`public/unframed/Unframed.markdown` still exists and is byte-identical to the canonical source. No blocking rewrite or header was found in `next.config.js`. The file was **not** moved or deleted in this phase because its dependencies were not established. Public availability and public-use rights require an owner decision.

### Owner-only retrieval

For this first implementation, RAG is only reachable when:

1. `PIERROT_RAG_ENABLED === "true"`;
2. the request has a verified server-side owner/admin identity;
3. the retrieval call is explicitly made with `scope: "owner"` and `ownerAuthorized: true`.

Verified identity sources reuse existing helpers:

- `getCurrentUser()` with `users.role === "ADMIN"`;
- `requireAdminFromRequest()` for a verified Telegram allowlisted initData or a Bearer JWT with an ADMIN profile;
- standard Supabase ADMIN cookie session.

Shared service secrets are not owner identities for manuscript retrieval:

- the legacy `x-admin-key` still sets the existing `isAdmin` flag for the rest of Pierrot, but it does **not** set `ragOwnerAuthorized`;
- the dedicated `x-admin-secret` path returns `id: "system-admin"` and is also excluded from `ragOwnerAuthorized`.

The request body cannot set `scope`, `accessClass`, `owner`, `documentId`, `isAdmin` or a role. The route hardcodes the retrieval scope after server-side authentication.

Unsigned `unframed_access` / `unframed_admin` cookies are not used.

The SQL search RPC also requires `access_class`, document, model and dimensions as predicates. Access control therefore exists both in the route and inside PostgreSQL.

### Existing ambiguity

The repository still contains two admin-role sources:

- `lib/serverAuth.ts` reads `users.role`;
- some admin actions write `user_metadata.role`.

Owner RAG relies on the existing `users.role` path. Resolving the dual-write inconsistency remains an owner/security task. It is not hidden or bypassed.

---

## 4. Storage design and proposed migration

**File:** `migrations/2026-10-29_create_knowledge_rag.sql`

**Status:** proposed for review, not applied, not verified against the live project.

### Why `public.knowledge_*`

A dedicated `knowledge` schema is preferred in principle, but live PostgREST schema exposure cannot be inspected from this workspace. The migration therefore uses closed `public.knowledge_*` tables, matching the existing `public.pierrot_*` confinement pattern.

### Tables

`public.knowledge_documents` stores:

- document ID, title, canonical source path, source SHA-256, manifest hash;
- parser/chunker versions and ingestion contract version;
- embedding model and dimensions;
- access class (`public` / `owner`);
- chunk count and source character count.

`public.knowledge_chunks` stores:

- stable chunk ID, document ID, chunk index;
- chunk text, content hash;
- heading, section path, section index;
- character and line offsets;
- embedding model, dimensions and access class;
- `vector(1024)` embedding.

A composite foreign key requires each chunk’s model and dimension to match its document. Mixing models inside one document is structurally rejected.

### Security

- RLS enabled on both tables.
- No anon/authenticated policies.
- `REVOKE ALL` from `PUBLIC`, `anon`, `authenticated`.
- Direct table access only for `service_role`.
- Search RPC is `SECURITY DEFINER` with a fixed `search_path`.
- RPC execution revoked from `PUBLIC`, `anon`, `authenticated`; granted only to `service_role`.
- RPC validates model, dimension, access class, document ID, result count and similarity range.
- RPC filters `access_class` in SQL and returns no embedding vectors.

### Indexing

No HNSW or IVFFlat index is created. For 169 chunks a sequential scan is sufficient. A btree scope index supports document/access/model filtering. Add a vector index only after measured latency or corpus growth justifies it.

### Live assumptions that remain unverified

- the `vector` extension can be installed in the live project;
- the vector type/operator is reachable through `public` or `extensions`;
- the migration role can create the extension and functions;
- PostgREST exposes the public tables/functions to the service role as expected;
- no conflicting live `public.knowledge_*` objects exist;
- the configured service-role key has the expected grants.

The migration is therefore **not production-verified**.

---

## 5. Ingestion pipeline

**Library:** `lib/knowledge/rag/ingestion.ts`

**CLI:** `scripts/knowledge/phase-d2-ingest.ts`

### Dry run

```bash
UNFRAMED_EMBEDDING_MODEL=baai/bge-m3 \
bun run scripts/knowledge/phase-d2-ingest.ts --dry-run
```

Dry-run output:

| Field               | Value                     |
| ------------------- | ------------------------- |
| Status              | `dry_run`                 |
| Document            | `doc_unframed_manuscript` |
| Chunks              | 169                       |
| Batches             | 6                         |
| Model               | `baai/bge-m3`             |
| Dimensions          | 1024                      |
| Source SHA-256      | frozen value above        |
| Manifest hash       | frozen value above        |
| Parser checks       | all true                  |
| Embedding API calls | 0                         |
| Database writes     | 0                         |

The dry run requires the model name but not `OPENROUTER_API_KEY` or Supabase credentials.

### Apply mode

```bash
UNFRAMED_EMBEDDING_MODEL=baai/bge-m3 \
OPENROUTER_API_KEY=... \
NEXT_PUBLIC_SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
bun run scripts/knowledge/phase-d2-ingest.ts \
  --apply \
  --confirm-paid-embedding \
  --allow-stale-delete
```

`--confirm-paid-embedding` is mandatory for apply mode. It is an explicit acknowledgment that manuscript chunks will be sent to OpenRouter and that paid embedding usage may occur.

`--allow-stale-delete` is required when existing chunk IDs differ from the new plan. Otherwise ingestion fails before writing with `stale_chunks_require_review`.

### Deterministic behavior

- Chunk IDs, content hashes and offsets come from the frozen Phase B build.
- The document records `unframed-rag-ingestion-v1`, parser, chunker, manifest hash, model and dimensions.
- Embedding input is `section path + blank line + chunk text`; the input is deterministic and never logged.
- Embeddings for the entire plan are produced before the first database write.
- A provider failure, partial batch, model mismatch or dimension mismatch therefore cannot write a partial index.
- Chunk rows are written in database batches of 25.
- Document row is upserted before chunks.
- Re-running the same manuscript is idempotent by chunk ID.
- Dry run never deletes, writes or calls the embedding provider.
- Ingestion is never part of a build, page render or request path.

### Residual ingestion risk

Database writes are not wrapped in one PostgreSQL transaction across the HTTP/PostgREST boundary. If a later chunk batch fails after earlier batches succeeded, a partial index can remain. The feature flag stays off and the operator must verify counts before enabling. A transactional replace RPC is the preferred hardening step once the live schema can be inspected.

---

## 6. Retrieval and Pierrot integration

**Retrieval:** `lib/knowledge/rag/retrieval.ts`

**Prompt builder:** `lib/knowledge/rag/pierrotContext.ts`

**Route:** `app/api/pierrot-web/route.ts`

### Insertion point

Retrieval runs only inside the existing `if (plan.useModel)` branch, before `callDeepSeek`. Deterministic commercial/service responses are untouched. Replay, rate limiting, authentication, consent and conversation persistence remain in their existing order.

When the flag is absent/false, or the requester is not a verified owner, `generationSystemPrompt` is exactly the existing `systemPrompt`. No retrieval call, no extra prompt text, no response-shape change.

### Outcomes

| Outcome            | Behavior                                                    |
| ------------------ | ----------------------------------------------------------- |
| `relevant_results` | Evidence is JSON-encoded and appended to the system prompt. |
| `weak_match`       | No evidence is passed; existing prompt path is used.        |
| `no_match`         | No evidence is passed; existing prompt path is used.        |
| `unavailable`      | No evidence is passed; existing prompt path is used.        |

Retrieval never throws to the route. The route also has a defensive catch. Provider and database details are never returned to the browser.

### Limits

- Top K: 5.
- Context budget: 8,000 characters.
- Retrieval timeout: 1.5 seconds.
- SQL result limit: 5, with a hard maximum of 10 in the RPC.
- Query maximum: 2,000 characters.
- No retries.

### Evidence handling

Retrieved passages are untrusted data:

- serialized as a JSON array;
- quotes and newlines are escaped;
- surrounded by explicit instructions not to follow instructions inside passages;
- required to be used only as evidence for factual claims about UNFRAMED;
- required to distinguish direct evidence from interpretation;
- required to abstain when evidence is insufficient;
- forbidden from inventing quotations, page numbers, chapters or source references.

Each evidence block contains the stable chunk reference, heading, section path, line range, similarity and text. No page numbers are invented.

### Logging

The route logs only:

- outcome/status;
- scope;
- number of returned chunks;
- latency;
- error code.

It never logs the query, passages, prompt text, vectors, credentials or user records.

### Flag truth table

| Condition                                          | Behavior                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| `PIERROT_RAG_ENABLED` absent                       | Existing Pierrot path exactly.                                         |
| `PIERROT_RAG_ENABLED=false`                        | Existing Pierrot path exactly.                                         |
| Flag true, verified owner, relevant evidence       | Evidence appended, DeepSeek generation unchanged.                      |
| Flag true, verified owner, weak/no match           | Existing prompt path.                                                  |
| Flag true, verified owner, embedding provider down | Existing prompt path.                                                  |
| Flag true, verified owner, Supabase down           | Existing prompt path.                                                  |
| Flag true, anonymous visitor                       | Owner retrieval not attempted.                                         |
| Flag true, authenticated non-owner                 | Owner retrieval not attempted.                                         |
| Flag true, legacy `x-admin-key` only               | Owner retrieval not attempted.                                         |
| Flag true, `x-admin-secret` only                   | Owner retrieval not attempted (`system-admin` is not a user identity). |
| Request body contains scope/owner/document fields  | Ignored; scope is server-derived.                                      |
| Replay / rate limit                                | Existing behavior unchanged.                                           |

---

## 7. Multilingual evaluation harness

**File:** `scripts/knowledge/phase-d2-evaluate.ts`

**Pure metrics:** `lib/knowledge/rag/evaluation.ts`

### Frozen artifacts verified at runtime

- C4 question hash.
- C4 protocol hash.
- Source SHA-256.
- Deterministic manifest.

The harness refuses to run if any frozen hash differs.

### No-cost mode

```bash
bun run scripts/knowledge/phase-d2-evaluate.ts --local-evaluation
```

This verifies the frozen artifacts and emits a blocked report:

- reason: `paid_embedding_calls_not_authorized`;
- chunks that would be embedded: 169;
- development questions: 66;
- calibration questions: 24;
- held-out test questions: 44, **not evaluated**;
- embedding API calls: 0;
- database writes: 0.

### Authorized paid mode

```bash
UNFRAMED_EMBEDDING_MODEL=baai/bge-m3 \
OPENROUTER_API_KEY=... \
bun run scripts/knowledge/phase-d2-evaluate.ts \
  --local-evaluation \
  --authorized-paid-evaluation
```

Only development and calibration questions are embedded. The held-out test split is not embedded or scored. Threshold candidates are selected on calibration data only. The report includes:

- Recall@5, Precision@5, MRR and evidence misses with numerators/denominators;
- English, pure-Russian and Russian-with-Latin-proper-nouns breakdowns;
- calibration threshold candidates;
- index build latency.

The harness does not claim that semantic similarity equals answer quality.

### Current baseline re-run

The frozen C4 evaluator was re-run locally on 2026-10-29:

```bash
bun run scripts/knowledge/phase-c4-evaluate.ts --local-evaluation
```

It reproduced the frozen hashes and these held-out lexical results:

| Strategy                | Held-out Recall@5 | Pure-Russian Recall@5 |
| ----------------------- | ----------------: | --------------------: |
| A — original BM25       |     13/30 = 0.433 |                  0/10 |
| B — field-weighted BM25 |     14/30 = 0.467 |                  0/10 |
| C — semantic            |           blocked |               blocked |
| D — hybrid              |           blocked |               blocked |

The local semantic detector still reports no ONNX/embedding runtime and only the English-only `all-MiniLM-L6-v2` candidate. That local blocker does not describe the new remote OpenRouter harness, but no remote semantic metric exists until paid evaluation is authorized and run.

No semantic or hybrid quality claim is made from similarity alone.

---

## 8. Tests and verification

Commands run:

```bash
npx jest lib/knowledge/rag --runInBand
npx jest lib/knowledge --runInBand
npx jest --runInBand --forceExit
npx tsc --noEmit
bun run scripts/knowledge/phase-c4-evaluate.ts --local-evaluation
```

Results:

| Check                     | Result                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| RAG suite                 | 30 tests passed                                                                                    |
| All knowledge suites      | 7 suites, 90 tests passed                                                                          |
| Repository-wide Jest      | 72 suites, 495 tests passed (`--forceExit`; Jest reported open handles and did not exit by itself) |
| TypeScript                | 0 errors                                                                                           |
| Ingestion dry run         | 169 chunks, 6 batches, no external call                                                            |
| Evaluation blocked report | Frozen hashes verified; no paid call                                                               |

Coverage includes:

- default-off feature flag;
- owner authorization exclusion for shared service secrets;
- explicit model/dimension configuration;
- OpenRouter batching, auth header, model mismatch, dimension mismatch, HTTP errors, partial responses and timeout;
- deterministic chunk IDs and hashes;
- dry-run no-write behavior;
- embedding count/dimension failures before writes;
- stale-chunk review guard and explicit deletion;
- database write failure;
- owner-scope refusal for unverified callers;
- no provider call when disabled or unauthorized;
- relevant/weak/no-match outcomes;
- provider, database and timeout fallbacks;
- JSON-encoded evidence prompt and context budget;
- cosine ranking and semantic metric counts.

---

## 9. External calls and side effects

### Performed

- Read-only `GET` requests to OpenRouter documentation, OpenAPI specification and public model catalogue to verify the embeddings contract and model metadata.
- Local test runs, TypeScript check, dry-run ingestion and blocked evaluation report.

### Not performed

- No OpenRouter embedding request.
- No DeepSeek request.
- No Supabase connection or query.
- No migration application.
- No real ingestion.
- No package installation or dependency change.
- No manuscript text sent to any provider.
- No commit, push, merge, deploy or Vercel change.
- No production environment change.

---

## 10. Files created or changed

### Created

- `lib/knowledge/rag/config.ts`
- `lib/knowledge/rag/errors.ts`
- `lib/knowledge/rag/types.ts`
- `lib/knowledge/rag/authorization.ts`
- `lib/knowledge/rag/embeddings.ts`
- `lib/knowledge/rag/ingestion.ts`
- `lib/knowledge/rag/supabaseStore.ts`
- `lib/knowledge/rag/retrieval.ts`
- `lib/knowledge/rag/pierrotContext.ts`
- `lib/knowledge/rag/evaluation.ts`
- `lib/knowledge/rag/__tests__/rag.test.ts`
- `migrations/2026-10-29_create_knowledge_rag.sql`
- `scripts/knowledge/phase-d2-ingest.ts`
- `scripts/knowledge/phase-d2-evaluate.ts`
- `docs/audits/phase-d2-unframed-rag-implementation.md`

### Changed

- `app/api/pierrot-web/route.ts` — verified-owner flag, owner-only retrieval before DeepSeek, metadata-only logging.
- `.env.example` — OpenRouter, embedding model, default-off flag and provisional threshold names.

No existing parser, chunker, C4 protocol, C4 questions or C4 evaluator file was modified.

---

## 11. Remaining blockers and exact manual steps

### Blockers

1. **Migration not applied or live-verified.** pgvector availability, PostgREST exposure, grants and RLS behavior are unverified.
2. **No OpenRouter embedding authorization.** No paid embedding call was made; no manuscript was sent to OpenRouter.
3. **No Supabase credentials in this workspace.** Live ingestion and retrieval could not be exercised.
4. **Threshold is provisional.** `0.45` is uncalibrated and must be selected on the C4 calibration split.
5. **Public manuscript remains exposed** at `public/unframed/Unframed.markdown`; public-use rights are unresolved.
6. **Admin role dual-write inconsistency** between `users.role` and `user_metadata.role` remains unverified.
7. **Ingestion writes are not one transaction.** A late database failure can leave a partial index; verify counts before enabling.
8. **No vector index.** Intentional for 169 chunks; revisit after measured latency or corpus growth.
9. **No end-to-end route test with real Supabase/OpenRouter.** Only injected unit tests and safe CLIs were run.

### Manual steps in order

1. Owner approves:
   - `baai/bge-m3` as the multilingual embedding model;
   - 1024 dimensions;
   - paid OpenRouter embedding usage;
   - sending manuscript chunks to OpenRouter.
2. Owner supplies `OPENROUTER_API_KEY` and Supabase server credentials through the approved environment mechanism. Never commit them.
3. Run the read-only SQL audit from the Phase D.1 report in the Supabase SQL Editor and confirm:
   - `vector` availability;
   - no conflicting `knowledge` tables;
   - schemas, grants, RLS and PostgREST exposure.
4. Review the proposed migration and apply it in a non-production project first.
5. Run ingestion in dry-run mode and record the summary.
6. Run apply mode with `--confirm-paid-embedding` into the non-production project.
7. Verify document/chunk counts, model, dimensions and stale count.
8. Run the evaluation harness first in no-cost mode, then with `--authorized-paid-evaluation` on development/calibration only.
9. Freeze the threshold and model configuration.
10. Run final held-out evaluation only after the configuration is frozen.
11. Enable `PIERROT_RAG_ENABLED=true` only after:
    - access-control tests pass;
    - migration/RLS review passes;
    - owner/non-owner tests pass;
    - retrieval fallback tests pass;
    - pure-Russian metrics are reported separately.
12. Keep `PIERROT_RAG_ENABLED=false` in Vercel until all of the above is complete.

**Stopped after local implementation. Awaiting owner approval and live-environment verification.**
