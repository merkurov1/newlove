# Pierrot Reliability Recovery — Report

**Date:** 3 November 2026  
**Repository:** `merkurov1/newlove`  
**Mode:** code + tests + prepared migrations. Production Supabase untouched; no deploy.

---

## A. Changed files

| File                                                                    | Why                                                                                                                                                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/pierrot/executionPlan.ts`                                          | New thin resolver that turns the existing query plan + owner-tool detection into one execution plan (`brain.search`, `brain.stats`, `commercial.report`, `media.search`, etc.) |
| `app/api/pierrot-web/route.ts`                                          | Uses the execution plan for owner-tool selection; records `operation`, `tool`, `fallback_policy`, `requires_web` in `assistant_replied`                                        |
| `lib/pierrot/queryUnderstanding.ts`                                     | Search-intent recognition for “найди/поищи … Brain/RAG/статьи/документ”; fixed continuation detection (`А теперь`, `А за`, `А есть`, `Только`)                                 |
| `lib/pierrot/commercialQuestion.ts`                                     | Recognises “Много продал?”, “Сколько купили…”, “продали/приобрели” as Commercial                                                                                               |
| `lib/pierrot/ownerTools.ts`                                             | Explicit system-health phrases (`состояние системы`, `system status`)                                                                                                          |
| `lib/knowledge/rag/brainRetrieval.ts`                                   | Removed the unconditional `explicitSourceLookup` bypass; explicit source scope no longer makes weak chunks relevant                                                            |
| `lib/pierrot/evidence.ts`                                               | Added `permission_denied` and `partial` source states and honest disclosure text                                                                                               |
| `lib/knowledge/evaluation/brain/reliabilityBenchmark.ts`                | 60-query benchmark manifest: 22 existing verified questions + 38 pending-ground-truth queries                                                                                  |
| `lib/pierrot/__tests__/executionPlan.test.ts`                           | Routing + continuity tests                                                                                                                                                     |
| `lib/pierrot/__tests__/commercialQuestion.test.ts`                      | Sales-phrasing regressions                                                                                                                                                     |
| `lib/knowledge/rag/__tests__/brainRetrieval.test.ts`                    | Explicit-source weak-match regression                                                                                                                                          |
| `lib/pierrot/__tests__/evidence.test.ts`                                | Permission-denied evidence state                                                                                                                                               |
| `lib/knowledge/evaluation/brain/__tests__/reliabilityBenchmark.test.ts` | Benchmark manifest integrity                                                                                                                                                   |
| `app/api/pierrot-web/__tests__/route.test.ts`                           | Route-level “Найди в RAG рецепты еды” regression                                                                                                                               |
| `migrations/2026-11-03_brain_retrieval_performance.sql`                 | HNSW index + bounded candidate-fusion RPC (manual only)                                                                                                                        |

No design, public UI, AI provider, Art Engine, Flow, Telegram, auth or database schema changes.

---

## B. Fixed problems

### Routing

- `RAG`, `Brain` and `Media` are now source names, not automatic statistics commands.
- “Найди в RAG рецепты еды” → `brain.search`, not RAG statistics.
- “Поищи в Brain рецепты еды” → `brain.search`.
- “Статистика RAG” → `brain.stats`.
- “Сколько документов в Brain?” → `brain.stats`.
- “Много продал?”, “Сколько продаж UNFRAMED?”, “Сколько купили открыток?” → `commercial.report`.
- “Покажи публикации обо мне” → `media.search`.
- “Покажи состояние системы” → `system.health`.
- One execution operation is selected per turn; the route does not run overlapping owner tools from competing classifiers.

### Conversation continuity

- Follow-ups starting with “А теперь…”, “А за…”, “А есть…”, “Только…” inherit the previous search source when the current message does not establish a new topic.
- “Найди рецепты в Brain” → “А теперь все рецепты недели” stays on Brain search.
- “Найди статьи о Sotheby’s” → “А за 2025 год?” keeps Brain search and lets the existing year parser add the date filter.
- A clear topic change still starts a new intent.

### Brain retrieval

- Removed `explicitSourceLookup || …`, which previously accepted every chunk from a requested source regardless of similarity/lexical relevance.
- Explicit source scope now narrows the corpus only; candidates still must pass `similarity >= explicitThreshold` or `lexical_score >= 0.15`.
- Existing document diversity rules remain (max chunks per document/class).
- Existing title lookup and Brain document path remain unchanged.

### Vector index / SQL

- Verified production state read-only: pgvector `0.8.0`, `vector` column, 2,736 chunks, 2,736 embeddings, no vector index, GIN FTS index present.
- Prepared HNSW cosine index and a bounded candidate-fusion replacement for `brain_search_hybrid`.
- **Not applied.** No re-indexing, no migration execution.

### Threshold

- One unconditional bypass removed.
- Explicit-source threshold remains `0.8 × base threshold`, but relevance is still required.
- No claim of calibrated quality: thresholds still require benchmark calibration.

### Multilingual

- No embedding model change.
- Existing BGE-M3 multilingual embeddings and `simple` FTS remain.
- Benchmark manifest includes RU→RU, RU→EN, EN→RU, transliteration and thematic cases, but they are pending ground truth and were not run against production in this task.

### Evidence

Added source states:
`success`, `empty`, `unavailable`, `timeout`, `error`, `permission_denied`, `partial`, `not_requested`.

- `permission_denied` is distinct from `empty`.
- `timeout` remains distinct from “no information”.
- The evidence guard discloses the correct limitation and does not convert permission/timeout into “nothing exists”.

### Commercial / Media

- Commercial routing now recognises “продал/продали/купили/приобрели”.
- Media routing is resolved through the execution plan; existing Media retrieval/privacy code was not rewritten.
- If Media returns an error, the answer is not allowed to claim “no access to the archive exists”; the existing source-status guard handles unavailable/empty.

### Permissions

- Owner-only tools remain behind the existing verified owner branch.
- Visitor/public Brain isolation was not changed.
- No owner tool was exposed to visitors.
- No private Brain content was added to public prompts, logs or events.

---

## C. Testing — actual results

Command:

```bash
npx jest lib/pierrot lib/knowledge/rag \
  lib/knowledge/evaluation/brain app/api/pierrot-web \
  --runInBand --forceExit
```

Result:

- **49 suites passed**
- **463 tests passed**
- **0 failed**

Coverage added/verified:

- routing: RAG search vs stats, Brain search, Commercial sales, Media, system health;
- conversation continuity: Brain follow-up, source + year follow-up;
- explicit-source weak-match rejection;
- permission-denied vs empty evidence;
- benchmark manifest has 60 queries, 22 verified, 38 pending.

TypeScript:

- `npx tsc --noEmit` passes for all changed Pierrot files.
- One unrelated existing error remains in `lib/flow/publish.ts` from other worktree changes.

Not executed / not claimed:

- production benchmark run;
- Recall@5/Precision@5/MRR/NDCG measurements;
- real p50/p95 SQL/embedding/ranking latencies;
- timeout-rate improvement;
- production build after these changes;
- production deployment.

These require the migration + production-like corpus run and must not be claimed from mocks.

---

## D. Migrations prepared (manual only)

### `migrations/2026-11-03_brain_retrieval_performance.sql`

Contents:

1. HNSW index:
   `knowledge_chunks_embedding_hnsw_idx`
   `using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64)`.
2. Replacement `brain_search_hybrid`:
   - bounded vector candidates;
   - bounded lexical candidates;
   - `UNION` deduplication by chunk;
   - final fusion ranking;
   - same filters/access contract;
   - service-role-only execute.

Manual order:

1. Review on staging.
2. Run the index statement. For a much larger table, use `CREATE INDEX CONCURRENTLY` outside a transaction.
3. Replace the function.
4. `ANALYZE public.knowledge_chunks`.
5. Run the existing benchmark script / reliability manifest.

Verification:

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'knowledge_chunks'
  and indexname = 'knowledge_chunks_embedding_hnsw_idx';

select count(*) as chunks, count(embedding) as embedded
from public.knowledge_chunks;

-- RPC smoke test should return <= p_match_count rows and no error.
```

Rollback:

- Drop `knowledge_chunks_embedding_hnsw_idx`.
- Restore the previous `brain_search_hybrid` definition from
  `migrations/2026-10-30_brain_hybrid_retrieval.sql`.
- No data is deleted by the migration.

No migration was applied.

---

## E. Known limitations / not proven

1. **Benchmark not run against production.** The 60-query manifest exists; only 22 have verified ground truth. 38 are explicitly `pending_ground_truth`; they must not be reported as quality metrics.
2. **No measured latency improvement.** p95 target <1,500 ms is not proven until HNSW + RPC migration is applied and the benchmark is run.
3. **Timeout rate remains unknown** after the change.
4. **Candidate-fusion SQL is prepared but not executed.** Production still runs the old RPC until manual migration.
5. **Multilingual quality is not measured.** Existing BGE-M3 is preserved; no model change.
6. **Media/Commercial retrieval quality is not re-benchmarked.** Only routing and honesty states changed.
7. **No production build/deploy** after these changes.
8. **Two Wallet/SIWE flows from the auth task remain** (unrelated to this Pierrot task).
9. Some legacy evaluation scripts still use the 22-question set; the new manifest is the 60-query source of truth for future runs.

---

## F. Manual checks after deployment

Send these to Pierrot as owner:

1. `Найди в RAG рецепты еды` → Brain search, not RAG statistics.
2. `Поищи в Brain рецепты еды` → Brain search.
3. `Статистика RAG` → RAG stats.
4. `Сколько документов в Brain?` → Brain stats.
5. `Много продал?` → Commercial report.
6. `Сколько продаж UNFRAMED?` → Commercial report.
7. `Найди статьи о Sotheby’s` → Brain/article search.
8. `А за 2025 год?` → continues the same search with year filter.
9. `Покажи публикации обо мне` → Media search.
10. `Покажи состояние системы` → system health.
11. `Найди документ «Anton Merkurov — Weekly Review»` → exact document.
12. `Найди документ, которого нет в Brain` → honest not-found, no substitution.
13. Stop Brain / simulate timeout → answer must say timeout, not “no information”.
14. As a visitor, repeat owner queries → no Brain documents, no Commercial data, no owner stats.

Check `pierrot_events` for `operation`, `tool`, `source_status`, `brain_timings`, `fallback_policy`.

---

## G. Conclusion

- **Can the system run without constant intervention?**  
  The routing and evidence changes are safe to run. Brain performance is **not yet proven** until the HNSW/RPC migration is applied and benchmarked.

- **What requires manual action?**  
  Review/apply `2026-11-03_brain_retrieval_performance.sql`, run the reliability benchmark against a production-like corpus, then verify p95 latency and timeout rate. Do not claim improvement before that.

- **Is a VPS needed now?**  
  Not for these code changes. First apply the vector index and measure p95 on the current corpus. A VPS only makes sense if SQL/embedding latency remains above target after indexing and query fusion.

- **What can be deferred?**  
  Full 60-query ground truth completion, multilingual benchmark expansion, Media/Commercial quality benchmarks, and consolidation of the two wallet/SIWE flows. These are observation-period tasks, not blockers for routing safety.

No production Supabase changes, data changes, re-indexing or deployments were performed.
