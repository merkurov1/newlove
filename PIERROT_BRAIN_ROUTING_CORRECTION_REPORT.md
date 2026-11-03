# Pierrot — Brain Retrieval & Intent Routing Correction

**Date:** 3 November 2026  
**Repository:** `merkurov1/newlove`  
**Mode:** code + tests + prepared migration. No production migration applied; no deploy.

---

## 1. Root causes

### 1.1. Brain search timeout

The deployed `brain_search_hybrid` built one large `base` CTE containing both chunks and documents, then sorted it by the computed alias `similarity`. That shape allowed PostgreSQL to choose:

- `Seq Scan` on `knowledge_chunks`;
- `Hash Join` with `knowledge_documents`;
- `Sort` over the whole candidate set;
- `ts_rank_cd()` evaluation over far more rows than the final candidates.

The production probe confirmed it: the old candidate shape used `Seq Scan` + `Hash Join` + `Sort`, while a direct vector candidate query used `knowledge_chunks_embedding_hnsw_idx`. The lexical query was also not forced through `@@`, so the GIN index was not guaranteed to drive candidate selection.

The old single `BRAIN_RAG_TIMEOUT_MS = 2500` budget covered embedding + SQL together. A 599 ms embedding left only about 1.9 s for SQL, which was already the observed search duration.

### 1.2. Wrong intent routing

`«Последние тексты из Новой газеты»` did not match a personal/publication intent. The generic answer path ran with:

- `operation: general`;
- `tool: model`;
- `brain: not_requested`;
- `web: unavailable` / `disabled`.

So Pierrot never checked Brain and did not disclose that no archive search had happened.

---

## 2. Changes

### Unified routing

- `lib/pierrot/executionPlan.ts`
  - publication requests are routed to `brain.search`;
  - Media Archive search is separated from Media statistics;
  - `«Покажи последние материалы из Media Archive»` → `media.search`;
  - `«Статистика Media Archive»` → `media.stats`;
  - ambiguous `«Сколько у меня публикаций?»` → `clarify.publications` with an explicit scope question.

- `lib/pierrot/queryUnderstanding.ts`
  - recognises publication/archive requests without requiring the words “Brain”, “RAG” or “найди”;
  - handles `«Последние тексты из Новой газеты»`, `«Покажи последние публикации»`, `«Что нового в моём архиве?»`, `«Все материалы о Sotheby’s»` and similar;
  - keeps explicit web requests on `web.search`.

- `app/api/pierrot-web/route.ts`
  - uses `retrievalQuery` (previous user topic + current sanitized follow-up) for short follow-ups such as `«А за 2025 год?»`;
  - passes `timeoutMs` / `totalTimeoutMs` through refinement;
  - records `timeout_stage` in retrieval analytics;
  - asks for scope before counting ambiguous “публикации”.

### Brain retrieval

- `lib/knowledge/rag/brainRetrieval.ts`
  - vector candidate selection is now ordered directly by `embedding <=> query`;
  - stage budgets are separated: embedding, SQL search, ranking, total deadline;
  - `timeoutStage` identifies whether embedding or SQL hit the deadline;
  - `«последние»` results are ordered by real `published_at` where available;
  - explicit-source results still must pass a relevance threshold.

- `lib/knowledge/rag/config.ts`
  - `BRAIN_RAG_EMBEDDING_TIMEOUT_MS = 1_500`;
  - `BRAIN_RAG_SEARCH_TIMEOUT_MS = 3_500`;
  - `BRAIN_RAG_TOTAL_TIMEOUT_MS = 6_000`;
  - legacy `BRAIN_RAG_TIMEOUT_MS` remains `2_500` for older callers.

- `lib/knowledge/rag/pierrotRetrieval.ts`
  - all refinement attempts share one end-to-end deadline;
  - no new attempt starts after the deadline;
  - each attempt receives the remaining budget.

- `lib/knowledge/rag/pierrotContext.ts`
  - timeout, permission-denied and generic-unavailable prompts are distinct;
  - a timeout explicitly says the archive may contain the material and does not imply absence.

### Evidence and honesty

- `lib/pierrot/evidence.ts`
  - source states now include `permission_denied` and `partial`;
  - timeout says the search did not finish and does not imply absence;
  - empty says the search completed with no relevant material;
  - technical error is not converted into “nothing exists”;
  - Media Archive timeout/error also avoids absence claims.

### Food / recipe fallback

The working tree already contained a deterministic owner-only food fallback. It was integrated so it also runs when normal hybrid retrieval returns no usable candidates, not only when it returns weak hits. `lib/knowledge/rag/__tests__/brainFoodFallback.test.ts` verifies:

- normal empty retrieval + food hit → `relevant_results`;
- public scope never invokes the owner food fallback.

### Note on the food fallback

The fallback reads only `access_class='owner'` chunks and is never used for public scope. It does not change `public_retrieval_allowed`.

---

## 3. SQL migration

### `migrations/2026-11-03_brain_hybrid_hnsw_fix.sql`

**Not applied.**

It replaces `public.brain_search_hybrid` with a version that:

1. selects vector candidates in a separate bounded CTE ordered directly by `c.embedding <=> p_query_embedding`;
2. selects lexical candidates with `to_tsvector(...) @@ plainto_tsquery(...)`, then applies `ts_rank_cd()`;
3. deduplicates by `chunk_id`;
4. fuses candidates with Reciprocal Rank Fusion (RRF, k = 60);
5. preserves `access_class`, model, dimensions, document ids, source types, domains, authors, languages and date filters;
6. keeps the function `SECURITY DEFINER` and `service_role`-only.

Candidate limit is bounded to `least(greatest(p_match_count * 2, 40), 120)`. At the current corpus size, 120 is the largest limit that still lets the planner choose HNSW instead of a sequential scan + sort.

### Query plans observed on the production corpus (read-only)

Probe: one real chunk embedding from a real Novaya Gazeta article; query text `Новая газета`; source type `article`; `p_match_count = 40`.

| Shape               | Plan                                                                 | Execution p50 | Execution p95 |
| ------------------- | -------------------------------------------------------------------- | ------------: | ------------: |
| Deployed RPC        | `Function Scan`                                                      |      127.6 ms |      139.2 ms |
| Old candidate shape | `Seq Scan` + `Hash Join` + `Sort`                                    |       17.9 ms |       18.3 ms |
| New candidate query | `HNSW Index Scan` + `GIN Bitmap Index Scan` + `Nested Loop` + `Sort` |  86.7 ms warm |  86.7 ms warm |

Cold first run of the new query was 681.7 ms; later runs were 86.5–86.8 ms. The old candidate shape is cheaper on the current 2,736-chunk table because a sequential scan is small, but it does not scale and it evaluates lexical ranking over too many rows. The deployed full RPC is slower than the new candidate query in the warm runs.

These numbers are SQL/candidate-selection measurements, not semantic retrieval-quality metrics.

### Manual apply order

1. Review the migration on staging.
2. Apply `2026-11-03_brain_hybrid_hnsw_fix.sql` manually in Supabase.
3. Verify:

```sql
select proname, prosrc
from pg_proc
where proname = 'brain_search_hybrid';

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('knowledge_chunks', 'knowledge_documents');
```

4. Run a service-role RPC smoke test with `p_match_count <= 60`.
5. Run the reliability benchmark against the production-like corpus.

### Rollback

The migration does not delete data. To roll back, restore the previous `brain_search_hybrid` definition from:

`migrations/2026-11-03_brain_retrieval_performance.sql`

No index or data rewrite is required for this specific migration.

---

## 4. Tests

Command:

```bash
npx jest lib/knowledge/rag lib/pierrot \
  lib/knowledge/evaluation/brain app/api/pierrot-web \
  --runInBand --forceExit
```

Actual result:

- **51 suites passed**
- **490 tests passed**
- **0 failed**

Typecheck:

```bash
npx tsc --noEmit
```

- **passes cleanly**

Build:

- not completed in this session; the long `next build` was stopped by the operator.
- no build error had been observed before interruption.

Coverage added/verified:

- `«Найди в RAG рецепты еды»` → `brain.search`, not RAG statistics;
- `«Последние тексты из Новой газеты»` → Brain v2, source status `success` with real evidence in the route test;
- `«Найди все рецепты»` → Brain path; timeout is disclosed and does not claim recipes are absent;
- `«Покажи последние материалы из Media Archive»` → `media.search`;
- `«Статистика Media Archive»` → `media.stats`;
- `«Сколько у меня публикаций?»` → `clarify.publications`;
- follow-up `«А за 2025 год?»` keeps the previous Sotheby’s topic in the retrieval query;
- Brain stage timeout attribution (`embedding` / `search`);
- shared end-to-end refinement budget;
- permission-denied evidence state;
- explicit-source weak matches are not accepted automatically;
- owner food fallback runs when normal retrieval is empty, never for public scope.

---

## 5. Benchmark status

A reproducible benchmark script is included:

`scripts/knowledge/pierrot-reliability-benchmark.ts`

It contains **31 verified queries** (22 existing + 9 new real-document queries) and runs:

- deployed `brain_search_hybrid`;
- candidate HNSW/GIN/RRF query;
- Recall@5, Precision@5, MRR, NDCG@5, source accuracy, false-positive rate;
- p50/p95 latency and timeout rate.

**It was not executed end-to-end** because the local environment does not contain a usable `OPENROUTER_API_KEY` (the value is a `[SENSITIVE]` placeholder). No quality metrics are claimed.

A separate reproducible SQL plan/latency probe was executed:

`scripts/knowledge/brain-sql-plan-check.ts`

It does not need an embedding key and produced the query-plan table above.

---

## 6. Manual checks after deployment

Send these to Pierrot as owner:

1. `Последние тексты из Новой газеты`  
   Expected: `brain.search`; real articles with dates or an honest empty result.
2. `Что я писал про ИИ?`  
   Expected: `brain.search`; evidence from real articles/posts.
3. `Найди все рецепты`  
   Expected: owner food fallback; real recipe chunks from 2018/2019, not one-line markers.
4. `Покажи публикации за последнюю неделю`  
   Expected: `brain.search`; date-ordered results or an explicit no-result answer.
5. `Сколько документов в Brain?`  
   Expected: `brain.stats`.
6. `Найди последние новости о Sotheby’s в интернете`  
   Expected: `web.search`, not Brain.
7. `Покажи последние материалы из Media Archive`  
   Expected: `media.search`.
8. `А за 2025 год?` after a Sotheby’s search  
   Expected: same source/topic, year filter applied.

Check `pierrot_events` for:

- `operation`;
- `tool`;
- `source_status`;
- `brain_timings`;
- `timeout_stage`;
- `fallback_policy`.

---

## 7. Known limitations

1. The new SQL function is prepared but **not applied** in production. Until then, the deployed RPC keeps the old candidate shape.
2. Semantic retrieval quality was **not benchmarked** in this session because no usable OpenRouter key was available.
3. The query-plan probe uses a real chunk vector, not a real query embedding. It proves plan selection and SQL latency, not relevance.
4. HNSW with selective document/source filters can under-return if the candidate limit is exhausted; the bounded 120-candidate design is a deliberate trade-off for the current 2,736-chunk corpus.
5. The food fallback has no independent abort signal; it is guarded by the overall retrieval deadline but its Supabase call is not individually cancellable in the current implementation.
6. `tsc` passes now, but the full `next build` was not completed.
7. No production migration or deployment was performed.

---

## 8. Conclusion

- Routing and evidence corrections are ready to run.
- `«Последние тексты из Новой газеты»` now reaches Brain v2 and is covered by a route-level test with a real evidence payload.
- `«Найди все рецепты»` now uses the owner food fallback; if the fallback finds nothing, the answer must be an honest no-result/timeout, not a silent general answer.
- The SQL performance fix requires manual application of `2026-11-03_brain_hybrid_hnsw_fix.sql`.
- No VPS decision is justified by these changes yet. Apply the migration, run the benchmark with a real embedding key, then measure p95 and timeout rate.
- Deferred: full 31-query quality run, multilingual benchmark expansion, and Media/Commercial quality benchmarking.
