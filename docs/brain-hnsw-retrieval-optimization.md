# Brain hybrid retrieval — deterministic HNSW selection

**Status:** code, migration, rollback and benchmark harness prepared. **No
production migration, configuration change or rollout has been applied.**
**Measured on this runner:** local PostgreSQL 18 + pgvector plan shape and index
usage only (synthetic vectors). No production database or embedding
credentials are available here. The tables below separate what is reproduced
from the owner's diagnostics, what is implemented, and what is still unverified.

## 1. Root cause

`public.brain_search_hybrid` already separates vector and lexical candidates.
The vector branch is a canonical pgvector shape:

```sql
order by c.embedding <=> p_query_embedding
limit v_candidate_limit
```

On the production-like corpus (2,006 chunks, `vector(1024)`,
`knowledge_chunks_embedding_hnsw_idx` present), PostgreSQL still estimated a
sequential scan + top-N sort as cheaper than the HNSW index. The owner's
controlled probe measured:

| Plan                                                             | Inner SQL latency |
| ---------------------------------------------------------------- | ----------------- |
| default planner choice                                           | ~1,812 ms         |
| transaction-local `enable_seqscan = off`, `hnsw.ef_search = 120` | ~476 ms           |

That is roughly 3.8× faster on the same data. Diagnostic queries that use a
materialized CTE are not used as a baseline.

Full retrieval for the last 30 days was 1,938 ms mean / 1,703 ms median /
3,848 ms P95, with SQL search at 1,600 / 1,529 / 2,451 ms. Generation latency
(~3.68 s) is a separate stage and is out of scope.

## 2. Options considered

| Option                                              | Result                                                                                                                                                                                                                                                                                                 | Decision   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| A. Rewrite the vector SQL only                      | The query already has the shape pgvector requires. PostgreSQL has no SQL-level index hint, and the planner still prefers a sequential scan at this corpus size. A rewrite would either stay non-deterministic or change candidate/filter semantics.                                                    | Rejected   |
| B. Planner setting scoped to the candidate function | A dedicated `brain_vector_candidates` function applies `enable_seqscan = off`, `enable_sort = off` and `hnsw.ef_search` with `set_config(..., is_local => true)` for the whole-Brain path, then restores the previous values. Document-scoped calls keep the planner's default exact scope-index path. | **Chosen** |
| C. New/partial/duplicate HNSW index                 | The required HNSW index already exists. A second index would add write and storage cost without fixing the plan choice.                                                                                                                                                                                | Rejected   |

The chosen approach changes no global planner state:

- no `ALTER DATABASE` / `ALTER ROLE`;
- no global `enable_seqscan = off`;
- `set_config(..., true)` is transaction-local and is guaranteed to revert at
  transaction end even if the function raises;
- the previous values are also restored explicitly before return, including in
  the exception handler;
- the hints are confined to the vector candidate function, so the lexical
  branch, fusion query and final ordering keep their normal plans.

`enable_sort = off` is needed for the whole-Brain path: without it the planner
can prefer `knowledge_chunks_scope_idx` plus a sort even when there is no
document filter. It is applied only inside the vector helper and only when
`p_document_ids` is null. Document-scoped requests keep the planner's default
scope-index path, which is exact and was not the measured bottleneck.

## 3. Implementation

### Migration

`migrations/2026-12-15_brain_hybrid_hnsw_planner.sql`

1. Adds `public.brain_vector_candidates(vector, text, integer, text, text[],
integer, integer)`:
   - validates model, dimensions, access class, limit (1–120) and
     `ef_search` (40–1000);
   - for the whole-Brain path (`p_document_ids is null`), sets
     `enable_seqscan = off`, `enable_sort = off` and
     `hnsw.ef_search = p_ef_search` transaction-locally;
   - for a document-scoped path, keeps the planner's default so it can choose
     the exact `knowledge_chunks_scope_idx` path;
   - selects the same bounded vector candidates as before;
   - restores every setting before returning.
2. Replaces `public.brain_search_hybrid` with the same signature, grants,
   lexical branch, RRF fusion, scopes, filters, deduplication and final
   ordering. The only change is that the vector CTE calls the helper.
3. Candidate limits are unchanged: `least(greatest(p_match_count * 2, 40),
120)`.
4. Default `ef_search` is **120**, the value used in the controlled probe.
   The harness tests 40/80/120 and selects the smallest value that passes the
   recall gates. Until that benchmark runs on 30–50 real queries, 120 is a
   provisional recall floor, not a proven minimum.
5. No index is created, dropped or rebuilt. No data is modified.

### Application path

`lib/knowledge/rag/supabaseStore.ts` and `lib/knowledge/rag/brainRetrieval.ts`
are unchanged: the RPC name, parameters, candidate count, scopes, timeouts,
retries and final TS ranking stay the same. The optimization is entirely
inside the SQL function. The embedding provider/model, query-embedding cache,
food retrieval, memory scopes, prompts and generation pipeline are untouched.

### Rollback

`migrations/rollback/2026-12-15_brain_hybrid_hnsw_planner_rollback.sql`

- restores the previous RRF `brain_search_hybrid` definition from
  `migrations/2026-11-03_brain_hybrid_hnsw_fix.sql`;
- drops only `public.brain_vector_candidates`;
- does **not** drop `knowledge_chunks_embedding_hnsw_idx`;
- does not touch data.

## 4. Verification harness

`scripts/knowledge/brain-hnsw-benchmark.ts` has four modes:

```bash
# Plan evidence: default vs HNSW at ef_search 40/80/120, plus index-usage delta.
ENV_FILE=.env.preview.local npx tsx scripts/knowledge/brain-hnsw-benchmark.ts plan

# Recall/latency on real query embeddings.
BRAIN_BENCH_QUERIES_FILE=/secure/brain-queries.json \
  ENV_FILE=.env.preview.local npx tsx scripts/knowledge/brain-hnsw-benchmark.ts recall

# Final ranked result dump before and after the migration.
# Add BRAIN_BENCH_WITH_REFINEMENT=true to mirror the production refinement path
# and record attempts/refined counts for the retry-rate gate.
BRAIN_BENCH_QUERIES_FILE=/secure/brain-queries.json \
  BRAIN_BENCH_DUMP_FILE=/tmp/baseline.json \
  ENV_FILE=.env.preview.local npx tsx scripts/knowledge/brain-hnsw-benchmark.ts dump

# Optional: measure the real PostgREST RPC path instead of a direct pg call.
BRAIN_BENCH_USE_SUPABASE=true \
  BRAIN_BENCH_QUERIES_FILE=/secure/brain-queries.json \
  BRAIN_BENCH_DUMP_FILE=/tmp/baseline.json \
  ENV_FILE=.env.preview.local npx tsx scripts/knowledge/brain-hnsw-benchmark.ts dump

npx tsx scripts/knowledge/brain-hnsw-benchmark.ts compare \
  /tmp/baseline.json /tmp/candidate.json
```

The harness never prints or writes query text. It outputs a SHA-256 query hash
and a sanitized category, then chunk/document ids and timings. It also captures
`pg_stat_user_indexes.idx_scan` for `knowledge_chunks_embedding_hnsw_idx`
before and after calls to the helper; a positive delta proves the target path
executed the index, not only a manual `EXPLAIN`. For a local non-SSL cluster,
set `BRAIN_BENCH_NO_SSL=true`; preview/production connections keep TLS.

### Real-query limitation

`brain_retrieval` telemetry stores **no query text** (only a hash, intent,
language, selected ids and timings). Real query embeddings therefore cannot be
reconstructed from telemetry. The harness deliberately refuses to substitute
chunk embeddings for quality metrics and exits with a clear message unless a
local, non-committed manifest of 30–50 real queries is supplied. Chunk
embeddings are used only in `plan` mode as a plan probe and are labelled
`chunk_embedding_plan_only`; they are never reported as recall evidence.

## 5. Quality gates

| Gate                                                                    | Status                                   | Evidence                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HNSW used on the target path (`EXPLAIN ANALYZE`)                        | **Verified locally; production pending** | PG18 + pgvector 0.8.1, 2,006 chunks: whole-Brain default plan was `Seq Scan` + `Sort`; candidate plan was `Index Scan using knowledge_chunks_embedding_hnsw_idx` at ef 40/80/120. The helper path increased `idx_scan` by 3 for 3 calls. Document-scoped requests keep the exact scope-index path. |
| Recall@20 ≥ 0.95 on 30–50 real queries                                  | **Not verified**                         | Harness mode `recall`; gate-checked by `chooseEfSearch`. Requires a real manifest, DB and embedding key. Telemetry stores no query text.                                                                                                                                                           |
| Recall@40 ≥ 0.97                                                        | **Not verified**                         | Same.                                                                                                                                                                                                                                                                                              |
| ≥95% of queries preserve expected top-10                                | **Not verified**                         | `top10PreservedRate` gate (`overlap@10 ≥ 0.9` per query).                                                                                                                                                                                                                                          |
| SQL median ≤700 ms, P95 ≤1,200 ms                                       | **Not verified on production**           | Owner's controlled probe: ~1,812 ms default vs ~476 ms HNSW. Local synthetic plan runs are not latency evidence.                                                                                                                                                                                   |
| Full retrieval latency, retries, empty-result rate not worse            | **Not verified**                         | TS path untouched; harness `dump`/`compare` reports latency, empty rate and outcome changes.                                                                                                                                                                                                       |
| Candidate limits, lexical, scopes, dedup and ranking preserved          | **Satisfied**                            | Migration test asserts the exact limit expression, `@@ v_tsquery`, full outer join, access/scope filters and service-role contract. Local integration test confirms bounded hybrid results.                                                                                                        |
| CI, lint, typecheck, build, migration checks green                      | **Verified locally; CI pending**         | `pnpm typecheck`, `pnpm lint`, `pnpm test --runInBand` and `pnpm build` passed. Migration and rollback executed against a local PostgreSQL + pgvector schema.                                                                                                                                      |
| PR includes before/after plan, methodology, latency/recall and rollback | **Prepared**                             | This document + harness output are the PR evidence.                                                                                                                                                                                                                                                |
| No production migration/config/rollout without approval                 | **Satisfied**                            | No production access was used; migration is marked manual-review-only.                                                                                                                                                                                                                             |

### What the local verification did and did not prove

This runner has no production `DATABASE_URL`, no Supabase service key and no
`OPENROUTER_API_KEY`. Real query embeddings also cannot be reconstructed from
telemetry because query text is intentionally not stored.

To verify the mechanism rather than only its syntax, a local PostgreSQL 18
instance was built with pgvector 0.8.1 and the same `knowledge_chunks` schema
(2,006 chunks, 1,024-dimensional vectors, HNSW cosine index). pgvector 0.8.1
was used because 0.8.0 does not build against PostgreSQL 18; the HNSW operator
and `hnsw.ef_search` GUC are unchanged between the two patch versions. The
migration and rollback were executed there, and the integration test passed.
That proves:

- the whole-Brain planner choice changes from `Seq Scan` + `Sort` to
  `Index Scan using knowledge_chunks_embedding_hnsw_idx`;
- the `brain_vector_candidates` helper really executes the HNSW index
  (`idx_scan` delta) and restores every transaction-local setting;
- document-scoped requests keep the exact scope-index path
  (`Bitmap Index Scan on knowledge_chunks_scope_idx` + `Sort` locally);
- the hybrid function still returns bounded results for null/non-null lexical
  queries and for scoped access.

Local plan snapshot (synthetic random vectors; wall-clock milliseconds are
illustrative only, **not** a production latency claim):

| Case                    | Plan                                                                                      | Local execution |
| ----------------------- | ----------------------------------------------------------------------------------------- | --------------- |
| Whole-Brain default     | `Limit` → `Sort` → `Seq Scan`                                                             | ~19.5 ms        |
| Whole-Brain, ef 40      | `Limit` → `Index Scan using knowledge_chunks_embedding_hnsw_idx`                          | ~1.10 ms        |
| Whole-Brain, ef 80      | same HNSW index scan                                                                      | ~1.08 ms        |
| Whole-Brain, ef 120     | same HNSW index scan                                                                      | ~1.13 ms        |
| Document-scoped default | `Limit` → `Sort` → `Bitmap Heap Scan` → `Bitmap Index Scan on knowledge_chunks_scope_idx` | ~0.10 ms        |

The helper call itself increased `idx_scan` by 3 for 3 calls, confirming that
the target function path executes the HNSW index.

It does **not** prove recall or production latency: the local vectors are
synthetic and random, not real user queries. The recall and latency gates still
need the preview database and a 30–50 real-query manifest.

## 6. Rollout checklist (requires owner approval)

1. Apply the migration to a **preview/staging** database only.
2. Run `plan`, then `recall` with 30–50 real queries. Confirm HNSW in the plan
   and the recall gates. If 120 fails, try 80/40 and update the default only
   after the gates pass.
3. Capture `dump` on the preview database before and after the migration;
   run `compare`. Confirm final top-10 overlap and no empty-result/outcome
   regressions.
4. Run `pnpm typecheck`, `pnpm lint`, `pnpm test --runInBand` and the
   production build.
5. Obtain owner approval before applying to production. Keep the rollback file
   ready. The rollback does not remove the existing HNSW index.

## 7. What is proven vs not proven

**Proven by the owner's diagnostics:** the default plan was ~1,812 ms; the
session-local `enable_seqscan=off` + `ef_search=120` plan was ~476 ms on the
same corpus. The 13/13 preliminary top-40 match is only a smoke test.

**Implemented:** the scoped helper, the migration, the rollback, the benchmark
harness and unit tests.

**Verified on this runner:** the migration and rollback execute against a local
PostgreSQL 18 + pgvector 0.8.1 schema; the whole-Brain default plan is
`Seq Scan` + `Sort` and the candidate plan is
`Index Scan using knowledge_chunks_embedding_hnsw_idx` at ef 40/80/120; the
helper path increments `idx_scan` and restores all transaction-local settings;
document-scoped requests keep the exact scope-index path; the integration test
passes; pure recall/latency metric logic is unit tested; and the migration
invariants hold (no global planner settings, no index or data changes,
candidate limits/lexical/scopes preserved).

**Not verified:** production/preview EXPLAIN, recall on real queries, latency
targets, full-retrieval comparison, retries and empty-result rates. These
require the preview database and embedding credentials described above.
