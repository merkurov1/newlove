# Brain hybrid retrieval — deterministic HNSW selection

**Status as of 2026-11-22:** code, migration, rollback and benchmark harness are
prepared and locally verified. **Final decision: NO-GO for production rollout**
until the real-query quality gates run on a preview/staging database with the
production embedding path. **No production migration, configuration change,
rollout or data mutation has been performed.** The base migration landed through
merged PR #71; this follow-up (PR #72) corrects the `ef_search` restore bug, the
integration-test scoping/transaction issues and the scoped benchmark
aggregation, and adds a CI apply/rollback job. PR #72 remains unmerged and must
not be merged under a "verified/passed" status while NO-GO stands.

This document is the single final report for the follow-up task. It replaces
the earlier "prepared / CI pending" status with the current evidence and a
conservative GO/NO-GO decision.

## 1. Current PR and CI snapshot

The reference snapshot below is the PR #71 head that was merged into `main`.
PR #72 was then rebased/merged onto current `main`; its refreshed checks belong
to the new head and are reported by CI after the runner pushes it.

| Item | Value |
| --- | --- |
| PR under review | [#72](https://github.com/merkurov1/newlove/pull/72), state `open` |
| Base | current `main` at `14d9c02d` |
| Prior reference head | `6da32f6a748c3de42622f1b2ff8cd8166bacb5c1` (PR #71, merged) |
| Changed files vs current main | 9 (11 in the original branch; 2 files were already identical on main) |
| Human review | none yet; owner review is still required |
| Review threads | 0 review comments; 2 issue comments from Vercel and Supabase bots |

Check runs at the merged PR #71 reference head:

| Check | Result | Explanation |
| --- | --- | --- |
| Typecheck, lint, tests | **success** | 10 pre-existing lint warnings (unrelated files), no failing tests |
| Production build | **success** | CI uses placeholder Supabase values; route handlers are dynamic |
| Actions executor checks | **success** | executor syntax + unit tests |
| Vercel Preview Comments | **success** | 0 unresolved feedback |
| Vercel deployment status | **success** | preview Ready |
| Supabase Preview | **skipped** | bot reports no changes in the `supabase/` directory; this is expected, not a failure |

There were no unexplained failing or pending checks at that head. The
synchronized PR #72 head adds the migration apply/rollback job, so a fresh CI
run is required before claiming the branch is green.

## 2. Migration date and ordering

The migration file is `migrations/2026-12-15_brain_hybrid_hnsw_planner.sql`.
The suspected "future date" is **not an ordering error in this repository**:

- `2026-12-15` is the highest migration date; after PR #71 merged, the same
  migration is already present on `main`;
- when the migration was prepared, the highest existing date was
  `2026-12-14_pierrot_personal_assistant.sql`, so `2026-12-15` was the next
  lexicographic date;
- the repository already uses a logical future-dated sequence: the `2026-12-14`
  migrations were committed on 2026-11-19;
- renaming this migration to the actual commit date (2026-11-21) would insert it
  before migrations `2026-11-22` … `2026-12-14`, which can make a filename-cursor
  migration runner skip it or apply it out of order.

**Action:** keep `2026-12-15`. The date is consistent with the accepted
migration sequence. No rename was made.

Forward migration, rollback and the previous RRF function were reviewed and
executed locally against PostgreSQL 18 + pgvector 0.8.7. The rollback restores
the exact `2026-11-03_brain_hybrid_hnsw_fix.sql` function and drops only
`public.brain_vector_candidates`; it does not drop or rebuild
`knowledge_chunks_embedding_hnsw_idx` and does not touch data.

## 3. Implementation and independent review

The migration adds `public.brain_vector_candidates(...)` and replaces
`public.brain_search_hybrid(...)` with the same signature and grants. The only
functional change in the hybrid function is that the vector CTE calls the
helper:

```sql
from public.brain_vector_candidates(
  p_query_embedding, p_model_id, p_dimensions, p_access_class,
  p_document_ids, v_candidate_limit, 120
) as v
```

A line-by-line diff against the previous `2026-11-03` function shows only:

1. the vector CTE;
2. a comment about candidate limits;
3. the function comment mentioning transaction-local planner hints;
4. the enclosing `commit`.

The lexical GIN branch, `@@ v_tsquery`, full outer join, RRF weights
(`1 / (60 + rank)`), access/scope/date/source filters, deduplication, final
ordering and candidate limit expression
`least(greatest(p_match_count * 2, 40), 120)` are unchanged.

### Review findings resolved in this follow-up

| Finding | Resolution |
| --- | --- |
| `hnsw.ef_search` was restored with `coalesce(v_prior_ef_search, '40')`. When the GUC was unset before the call, this left `ef_search=40` inside the transaction until commit. | Restore the prior value exactly, including `NULL` (which resets the GUC). The migration test now rejects the old `coalesce` form. |
| The integration test hard-coded `access_class='owner'` while it selected the first chunk without filtering by access class. This failed when the first chunk was `public`. | The test selects the probe chunk and its `access_class` together and uses that class for all helper calls. It now passes against a mixed-corpus local database. |
| The settings-restoration test ran the helper in an implicit transaction, so PostgreSQL's transaction-local reset could hide a leak. | The test now does `begin` → helper → read settings → `rollback` in one explicit transaction. This is the test that reproduces the `ef_search` leak above. |
| Recall gates aggregated document-scoped queries with whole-Brain HNSW queries. Scoped queries keep the previous planner-default path, so mixing them could inflate HNSW recall. | `recall` mode now reports `summaries` for the whole-Brain path and separate `scopedSummaries`; `chooseEfSearch` gates only on the whole-Brain set. |

### Planner-setting lifecycle

- `enable_seqscan=off`, `enable_sort=off` and `hnsw.ef_search` are applied with
  `set_config(..., is_local => true)` only inside the whole-Brain branch.
- The previous values are restored explicitly before `RETURN QUERY` completes.
- The exception handler restores them before re-raising.
- PostgreSQL also reverts transaction-local settings at commit/rollback, so a
  pooled connection cannot inherit them.
- The helper is `SECURITY DEFINER` with `set search_path = public, pg_temp`,
  revoked from `public`, `anon` and `authenticated`, and granted only to
  `service_role`, matching the existing hybrid function contract.
- No `ALTER DATABASE`, `ALTER ROLE`, `SET SESSION`, global planner setting,
  index creation/drop/rebuild or data mutation exists in the migration.

### Document-scoped path — precise wording

The document-scoped branch keeps the **previous** filtered
`ORDER BY embedding <=> query LIMIT n` shape and does **not** force HNSW. It is
therefore behaviour-preserving, not "exact by construction": if the planner
chooses the scope index + sort (as it does locally), the result is exact; if it
chooses HNSW, the result is approximate. The migration intentionally does not
change that planner choice. The local plan used
`knowledge_chunks_scope_idx` + `Sort`, and the integration test confirms bounded
scoped results. This nuance is recorded so the PR does not claim a hard
exactness guarantee that SQL cannot provide.

## 4. Local verification

Environment: PostgreSQL 18.7 with pgvector 0.8.7 in a local Docker container,
2,006 synthetic chunks / 41 documents, 1,024-dimensional vectors, the existing
HNSW cosine index shape (`m=16`, `ef_construction=64`) and a scope index. No
production data, credentials or services were used.

Verification evidence recorded for this branch. The synchronization pass re-ran
install, typecheck, lint, the full Jest suite, the production build and the
disposable-database migration script. Rows explicitly marked "earlier run" are
preserved from the original follow-up run and were not re-run during the
synchronization because they need the prepared preview/benchmark setup.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | passed |
| `pnpm typecheck` | passed (exit 0) |
| `pnpm lint` | passed (exit 0; 1393 existing warnings, 0 errors) |
| `pnpm test --runInBand` | passed: 489 suites, 3529 tests, 6 skipped |
| `BRAIN_HNSW_TEST_DATABASE_URL=… pnpm test --runInBand lib/knowledge/rag/__tests__/brainHnswSql.integration.test.ts` | passed: 6/6 (earlier run) |
| `NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… pnpm build` | passed (CI-equivalent placeholder values) |
| Apply migration to local PG 18 + pgvector | passed (covered by the verify script below) |
| Apply rollback, verify helper dropped and hybrid present | passed (covered by the verify script below) |
| Re-apply migration | passed (covered by the verify script below) |
| `node scripts/knowledge/verify-brain-hnsw-migration.mjs` | passed: apply → helper → scoped → plan → rollback → re-apply |
| `brain-hnsw-benchmark.ts plan` against local DB | passed (earlier run) |

This follow-up also adds a `Migration apply and rollback` job to
`.github/workflows/ci.yml`. It starts `pgvector/pgvector:pg18` as a service and
runs the same script, so forward migration, helper behavior, scoped path, HNSW
plan and rollback are checked on every CI run instead of only by a static test.
The job will first appear on the follow-up task branch head.

`pnpm build` without Supabase environment values fails while collecting
`/api/cast` (`supabaseUrl is required`). This is a pre-existing build-time
requirement, not caused by this change; the repository CI supplies placeholder
values and the CI-equivalent build passed.

### EXPLAIN / plan evidence

Local `plan` mode, synthetic random vectors (plan shape only; wall-clock numbers
are not production latency claims):

| Case | Plan | Local execution |
| --- | --- | --- |
| Whole-Brain default | `Limit` → `Sort` → `Seq Scan` | ~12.7 ms |
| Whole-Brain, ef 40 | `Limit` → `Index Scan using knowledge_chunks_embedding_hnsw_idx` | ~1.45 ms |
| Whole-Brain, ef 80 | same HNSW index scan | ~1.61 ms |
| Whole-Brain, ef 120 | same HNSW index scan | ~1.85 ms |
| Document-scoped default | `Limit` → `Sort` → `Bitmap Heap Scan` → `Bitmap Index Scan on knowledge_chunks_scope_idx` | ~0.04 ms |

The helper path increased `pg_stat_user_indexes.idx_scan` for
`knowledge_chunks_embedding_hnsw_idx` by **3 for 3 calls**, which confirms the
target function path executes the index rather than only a manual `EXPLAIN`.
This reproduces the production root cause (default `Seq Scan` + `Sort`) and the
intended fix (deterministic HNSW index scan).

Exception-path check: a wrapper set `hnsw.ef_search=77`, called the helper with
a deliberately dimension-mismatched vector, caught the helper's exception, and
read the GUC again; it was still `77`. This confirms the exception handler
restores the prior value before re-raising, in addition to PostgreSQL's
transaction-local reset.

### Synthetic exact-vs-HNSW smoke benchmark

Because no production/preview database and no embedding API key are available
in this runner, real query text cannot be embedded. To exercise the metric
logic and the HNSW path, 40 **synthetic** query vectors were used: 20 random
1,024-dimensional vectors and 20 vectors taken from corpus chunks. Exact search
was forced to a sequential scan; approximate search called the new helper.

**This is not a representative real-user benchmark and is not evidence for the
real-query recall gates.** It is labelled `synthetic_local_only_not_real_user`.

| ef_search | Recall@10 | Recall@20 | Recall@40 | Overlap@10 | Top-10 preserved | Median / P95 latency |
| --- | --- | --- | --- | --- | --- | --- |
| 40 | 0.795 | 0.794 | 0.751 | 0.795 | 0.475 | 1.36 / 1.77 ms |
| 80 | 0.880 | 0.886 | 0.879 | 0.880 | 0.625 | 1.63 / 1.90 ms |
| 120 | 0.955 | 0.951 | 0.946 | 0.955 | 0.925 | 1.88 / 2.10 ms |

Exact-search latency for the same synthetic workload was ~10.6 ms median /
11.0 ms P95. The synthetic numbers are internally consistent with the expected
ANN trade-off, but **no tested ef passes all declared gates**:

- Recall@20 ≥ 0.95: only ef 120 reaches 0.951, marginally;
- Recall@40 ≥ 0.97: best is 0.946;
- top-10 preserved rate ≥ 0.95: best is 0.925.

That is a reason not to overstate the result and not to call the PR
production-ready. It does not prove that ef 120 will fail on real BGE-M3
embeddings; real embeddings are much more structured than random vectors. It
does show that "ef 120" must not be presented as a proven recall floor without
the real-query run.

## 5. Real-query benchmark: blocked, not faked

`brain_retrieval` telemetry stores no query text (only hash/intent/language/
selected ids/timings), so real query embeddings cannot be reconstructed from
telemetry. This runner has no `DATABASE_URL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` or `OPENROUTER_API_KEY`/`GEMINI_API_KEY`, and no
preview database with the migration applied. No balance was topped up and no
provider/model was changed.

The following are the exact missing conditions for the real benchmark:

1. A preview/staging database (not production) where the migration has been
   applied, reachable by `DATABASE_URL`/`BRAIN_HNSW_TEST_DATABASE_URL`.
2. A 30–50 query manifest of anonymised real user queries, or owner-approved
   representative queries, with explicit consent and no personal text committed
   to the repository.
3. `OPENROUTER_API_KEY` (or the configured production embedding provider) with
   sufficient balance to embed those queries through the same
   `baai/bge-m3` path used by production; do not substitute a different model.
4. For document-scoped rows, actual preview document ids. Without them only
   whole-Brain and public/owner scope can be measured.
5. Service-role access only if the optional PostgREST `dump` path is used;
   direct `pg` is sufficient for the SQL/recall path.

Until those exist, the doc must not claim Recall@20/@40, top-10 preservation or
production latency for real users. The harness is ready to run them:

```bash
ENV_FILE=.env.preview.local npx tsx scripts/knowledge/brain-hnsw-benchmark.ts plan
BRAIN_BENCH_QUERIES_FILE=/secure/brain-queries.json \
  ENV_FILE=.env.preview.local npx tsx scripts/knowledge/brain-hnsw-benchmark.ts recall
BRAIN_BENCH_QUERIES_FILE=/secure/brain-queries.json \
  BRAIN_BENCH_DUMP_FILE=/tmp/baseline.json \
  ENV_FILE=.env.preview.local npx tsx scripts/knowledge/brain-hnsw-benchmark.ts dump
# apply migration on preview, then the candidate dump and compare
npx tsx scripts/knowledge/brain-hnsw-benchmark.ts compare /tmp/baseline.json /tmp/candidate.json
```

The harness never prints or writes query text; it emits a SHA-256 query hash,
a sanitized category, ids and timings. It refuses to substitute chunk
embeddings for quality metrics. `recall` mode gates the whole-Brain path only
and reports document-scoped results separately.

## 6. Representative query corpus (prepared, not real-user, not yet run)

The following 40 queries are generic representative inputs prepared from
confirmed Brain usage categories (memory/thematic recall, exact lexical recall,
short and long questions, Russian/English/German/French/Spanish/Italian, owner
and public scope, vector-leaning and hybrid). They are **not** real user
queries and contain no personal text. They are listed here, not in a committed
harness manifest, so they cannot be mistaken for real-user evidence. To run
them, convert each row to
`{ "id": "...", "category": "...", "text": "...", "accessClass": "owner|public" }`
in a local, non-committed file and add document-scoped rows using preview ids.

| # | Lang | Scope | Type | Query |
| --- | --- | --- | --- | --- |
| 1 | ru | owner | thematic | Что я писал о страхе перемен и новых началах? |
| 2 | ru | owner | thematic | Какие рецепты выпечки я сохранял в прошлом году? |
| 3 | ru | owner | thematic | Мои заметки о поездке в Лиссабон и любимых местах |
| 4 | ru | owner | health | Что я думал о сне, усталости и восстановлении? |
| 5 | ru | owner | tech | Заметки о Postgres, pgvector и поиске по смыслу |
| 6 | ru | owner | finance | Мои мысли о деньгах, накоплениях и финансовой независимости |
| 7 | ru | owner | relationships | Что я писал о близости, доверии и границах? |
| 8 | ru | owner | work | Идеи о фокусе, выгорании и планировании недели |
| 9 | ru | owner | art | Размышления об искусстве, цвете и тишине |
| 10 | ru | owner | philosophy | Смысл, память и время в моих записях |
| 11 | en | owner | thematic | What have I written about starting over after failure? |
| 12 | en | owner | thematic | Saved recipes for sourdough and slow cooking |
| 13 | en | owner | travel | Notes from the trip to Japan and quiet places in Kyoto |
| 14 | en | owner | health | Sleep, recovery and energy routines |
| 15 | en | owner | tech | Vector search, HNSW and Postgres query plans |
| 16 | en | owner | finance | Long-term savings and financial independence |
| 17 | en | owner | relationships | Trust, boundaries and difficult conversations |
| 18 | en | owner | work | Deep work, focus and weekly planning |
| 19 | en | owner | art | Color, silence and the practice of making art |
| 20 | en | owner | philosophy | Memory, time and personal meaning |
| 21 | ru | owner | lexical | Лиссабон |
| 22 | en | owner | lexical | pgvector |
| 23 | ru | owner | lexical | бессонница |
| 24 | en | owner | lexical | sourdough |
| 25 | ru | owner | lexical | доверие |
| 26 | en | owner | lexical | HNSW |
| 27 | ru | owner | lexical | выгорание |
| 28 | en | owner | lexical | Kyoto |
| 29 | ru | owner | lexical | финансовая независимость |
| 30 | en | owner | lexical | boundaries |
| 31 | de | owner | thematic | Was habe ich über langsames Reisen und Aufmerksamkeit geschrieben? |
| 32 | fr | owner | thematic | Mes notes sur la mémoire, le temps et la solitude |
| 33 | es | owner | thematic | Notas sobre el sueño, la energía y el descanso |
| 34 | it | owner | thematic | Appunti su arte, colore e silenzio |
| 35 | ru | owner | long | Сравни мои заметки о страхе перемен, финансовой независимости и восстановлении после выгорания |
| 36 | en | owner | long | Find everything I wrote about trust, boundaries, difficult conversations and long-term relationships |
| 37 | ru | public | thematic | Публичные материалы о рецептах и повседневной практике |
| 38 | en | public | thematic | Public notes about art, color and silence |
| 39 | ru | owner | vector-leaning | то, что я не могу назвать словами, но узнаю по ощущению |
| 40 | en | owner | vector-leaning | the feeling of a place I have not visited yet |

Coverage gaps that require preview data: document-scoped rows (real document ids),
hybrid vs vector-only toggling in the RPC (the harness always supplies text),
and actual real-user language/intent distribution.

## 7. Acceptance criteria

| Criterion | Status | Evidence |
| --- | --- | --- |
| Current PR checks fully complete; no unexplained failing/pending checks | **Pending fresh CI** | The merged PR #71 reference head `6da32f6a` was fully green. The synchronized PR #72 head adds the migration job and must pass its own CI run before this row can be marked Pass |
| Migration date/order corrected if needed; forward and rollback reviewed | **Pass** | `2026-12-15` is the highest date and keeps the lexicographic sequence; no rename. Migration and rollback executed locally; rollback restores `2026-11-03` function and drops only the helper |
| Transaction-local planner settings restored on success and exception; no global/session leakage | **Pass** | `set_config(..., true)`, explicit restore in normal and exception paths, exact `NULL` restore, explicit-transaction integration test; no global `ALTER`/`SET` |
| HNSW usage confirmed on target path; document-scoped and hybrid lexical/RRF behavior preserved | **Pass with caveat** | HNSW `Index Scan` at ef 40/80/120 and `idx_scan` +3; scoped local plan uses scope index + sort; function diff shows only vector CTE changed. Scoped "exactness" is planner-default behavior, not a hard guarantee |
| Exact-vs-HNSW benchmark includes 30–50 queries if safely available; otherwise clearly labelled representative corpus with limitation | **Partial / labelled synthetic** | 40 synthetic query vectors run locally and labelled not-real-user; 40 representative text queries prepared in §6. Real-user corpus/embedding path unavailable |
| Recall@10/20/40, overlap@10, latency median/P95 and ef comparison reported without overstating | **Pass** | §4 table, explicitly synthetic; no tested ef passes all gates, so no production-quality claim |
| Independent review findings resolved or documented | **Pass** | Four findings in §3 fixed; document-scoped exactness nuance documented |
| Final GO/NO-GO recorded in PR, report and Dev Queue consistently | **Partial** | This report records NO-GO. PR comment/Dev Queue update requires runner/owner access not available in this environment |
| No production migration, configuration change, rollout or data mutation | **Pass** | Only local Docker PostgreSQL and local files; no production credentials or services |

## 8. Final decision and owner next steps

**Final decision: NO-GO for production rollout.** The implementation is
low-risk and locally verified, but the quality gates that justify production
HNSW are not met with available evidence:

- real-user recall/latency was not measured;
- the labelled synthetic smoke benchmark fails Recall@40 and top-10
  preservation at every tested ef_search, including 120 (ef 120 only narrowly
  passes Recall@20);
- document-scoped "exactness" is preserved planner behavior, not a hard
  guarantee;
- no preview/staging database or embedding credentials are available here.

The PR may stay open as a reviewed, non-production candidate. It must not be
merged under a "verified/passed" status. The owner has two reasonable choices:

1. **Keep it open and run the preview benchmark** after supplying the missing
   conditions in §5, then revisit GO/NO-GO with real numbers.
2. **Close it with the technical record** if the owner does not want to spend
   preview database/embedding budget now. The report, rollback, tests and
   harness remain useful and reproducible.

What is now closed:

- migration date/order question (no rename needed);
- global planner leakage and `ef_search` reset bug;
- integration test scoping/transaction weaknesses;
- scoped-vs-whole-Brain benchmark aggregation;
- CI, lint, typecheck, unit/integration tests and build status;
- local forward/rollback execution and EXPLAIN/index-usage evidence.

What still requires an owner decision or future task:

- real-query benchmark on preview with the production embedding provider;
- decision on `ef_search=120` versus a lower value after that benchmark;
- any production migration/rollout;
- updating the Dev Queue/PR status through the owner-controlled system.

## 9. Synchronization with current main (2026-11-22)

The original branch was based on `4eccacc1`. Main advanced to `14d9c02d`,
which already contains the base HNSW migration from merged PR #71 plus
unrelated YouTube, media and telemetry work. The follow-up was replayed onto
current main; only HNSW files were touched.

| Path | Resolution |
| --- | --- |
| `lib/knowledge/rag/hnswBenchmark.ts` | Already identical on both sides; no change. |
| `lib/knowledge/rag/__tests__/hnswBenchmark.test.ts` | Already identical on both sides; no change. |
| `migrations/rollback/2026-12-15_brain_hybrid_hnsw_planner_rollback.sql` | Restored the one missing comment from the previous function so the rollback definition matches `2026-11-03_brain_hybrid_hnsw_fix.sql` exactly; no logic change. |
| `.github/workflows/ci.yml` | Kept all existing jobs and added only the pgvector migration apply/rollback job. |
| `docs/brain-hnsw-retrieval-optimization.md` | Took the follow-up report, corrected the PR snapshot for merged PR #71/current main, and kept NO-GO. |
| `docs/pierrot-production.md` | Took the explicit NO-GO sentence; no other text changed. |
| `lib/knowledge/rag/__tests__/brainHnswMigration.test.ts` | Took the corrected `NULL` restore assertion and rejection of the old `coalesce(..., '40')` form. |
| `lib/knowledge/rag/__tests__/brainHnswSql.integration.test.ts` | Took the access-class probe fix and the explicit-transaction settings test. |
| `migrations/2026-12-15_brain_hybrid_hnsw_planner.sql` | Took the exact `NULL` restore and precise document-scoped wording; date and order unchanged. |
| `scripts/knowledge/brain-hnsw-benchmark.ts` | Took separate whole-Brain/scoped recall accounting; gates apply only to whole-Brain. |
| `scripts/knowledge/verify-brain-hnsw-migration.mjs` | Added the disposable-database apply/helper/scoped/plan/rollback/re-apply check used by CI. |

No unrelated main changes were reverted, and the migration remains the highest
dated file (`2026-12-15`).
