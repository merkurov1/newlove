# Resource safety and background process map

Date: 2026-10-31
Scope: Brain, Graph, Media Intelligence, Pierrot, Flow, newsletter delivery
Status: code changes implemented; **not deployed**, **no migration applied**, **no worker backlog executed**

This document separates the repository state from the observed production state.
Nothing in this change creates, enables or restores a schedule.

---

## 1. Non-negotiable rules

- No Vercel Cron is declared in `vercel.json`.
- No new Supabase `pg_cron` job is created.
- `brain_worker_tick()` is not enabled, restored or invoked by this change.
- No production migration was applied.
- No production worker was run against the backlog.
- Every worker invocation now requires:
  - the global kill switch to be off;
  - its own worker flag to be on;
  - an atomic database lease lock;
  - a finite job, time, retry and budget limit.
- If any of those checks cannot be satisfied, the worker returns `skipped` and the
  queue is preserved.

---

## 2. Production state observed during the audit

### 2.1 Supabase

| Item | Observed state |
| --- | --- |
| `pg_cron` extension | installed, version 1.6 |
| `pg_net` extension | installed, version 0.14.0 |
| Visible `cron.job` rows | **0** |
| `cron.job_run_details` | jobid 2, command `SELECT public.brain_worker_tick()`, succeeded every 5 minutes; latest observed 2026-10-31 12:50 UTC |
| Vault secrets | **no rows** |
| `brain_worker_tick()` | exists; returns `skipped / missing_vault_secrets` because both Vault values are absent |
| `brain_worker_base_url` | absent |
| `brain_worker_cron_secret` | absent |

**Important:** jobid 2 has run history every five minutes while `cron.job` has no
visible row. Do not assume the scheduler is inactive just because `cron.job` is
empty. The function is currently a no-op because Vault is empty, but the run
history must be re-checked after any scheduler change. This audit did **not**
change that state.

### 2.2 Queue snapshot at audit time

| Queue | State |
| --- | --- |
| Brain ingestion | 104 queued: 102 `media_coverage` + 2 `article` |
| Brain runs with queued work | `55d7a343…` running (49), `6436abaf…` completed_with_errors (53), plus two terminal runs with one queued job each |
| Brain failed | 1 article, 7 media_coverage |
| Brain partial | 3 article, 4 media_coverage |
| Graph | 112 queued across three running runs |
| Graph failed | 1 |
| Media analysis | 179 completed, 1 failed, 0 pending |
| Newsletter | 13 completed, 0 pending/processing |
| Recent worker telemetry | two Brain admin runs on 2026-10-31, both `completed_with_errors` |

The terminal-run-with-queued-jobs case is the orphaned-work defect addressed in
section 6.

### 2.3 Migration tracking

`supabase_migrations.schema_migrations` contains only:

- `20261012062841_add_missing_foreign_key_indexes`

The root `migrations/` directory contains many more migrations that are present
in the live schema but are not represented in that table. The table is therefore
not a reliable source of truth for this repository. The new migration is
**not applied** and must be reviewed and applied manually by the owner.

---

## 3. Process map

| Process | Trigger today | Max jobs / invocation | Max duration | Concurrency guard | Retry | External cost |
| --- | --- | ---: | ---: | --- | --- | --- |
| Brain ingestion worker | manual admin / protected cron endpoint | 5 | 240 s | DB lease `worker:brain` | 3 attempts, exponential backoff + jitter, permanent errors terminal | page fetch, embedding, optional graph queue |
| Graph worker | manual admin / protected cron endpoint | 5 | 240 s | DB lease `worker:graph` | 3 attempts, exponential backoff + jitter | DeepSeek LLM |
| Media analysis worker | manual admin / protected cron endpoint | 3 | 180 s | DB lease `worker:media` | 3 attempts, queue lease, permanent errors terminal | DeepSeek LLM |
| Newsletter worker | protected endpoint only | 1 job, 25 emails per invocation | 45 s | DB lease `worker:newsletter` | per-email logs; batch partial is returned to pending | Resend email |
| Pierrot retention | protected endpoint only | 1 purge | 55 s | DB lease `worker:retention` | one pass | database only |
| Pierrot chat | user request | 1 generation | route 60 s; SDK 25 s | per-IP/per-Telegram rate limit + LLM circuit | SDK retries disabled | DeepSeek |
| Flow AI context | **manual admin only** | 1 item | route 60 s; SDK 20 s | LLM circuit | SDK retries disabled | DeepSeek + public RAG embedding |
| Flow issue analysis | admin build | 6 items per batch, concurrency 4, 40 s analysis budget | route 60 s | existing build budget | 1 retry, 12 s timeout | DeepSeek |
| Flow crosspost | item publish | 1 formatting call | 7 s fetch timeout | none needed | fallback text | DeepSeek |
| Media coverage ingestion | media admin | 1 job | Brain worker limits | Brain worker lock | Brain retry policy | page fetch, embedding |
| Newsletter admin send | admin PATCH | all matching subscribers | route maxDuration | job claim | per-email logs | Resend |

### 3.1 Scheduler/trigger inventory

| Mechanism | Repository | Production |
| --- | --- | --- |
| Vercel Cron | **removed from `vercel.json`** | existing deployment may still have the old four cron entries until redeploy; no deploy performed |
| Supabase `pg_cron` | no new schedule; existing migration 2026-11-06 contains optional deployment SQL | jobid 2 run history every 5 min; `cron.job` empty; no-op due missing Vault |
| `pg_net` | used only by `brain_worker_tick()` | present; no request because Vault empty |
| Manual admin worker | `/api/admin/brain/worker`, `/api/admin/media/analysis/worker`, `/api/admin/operations` | protected by admin auth |
| Protected cron endpoints | `/api/cron/brain-worker`, `/api/cron/graph-worker`, `/api/cron/media-analysis-worker`, `/api/cron/pierrot-retention`, `/api/cron/newsletter-worker` | require `CRON_SECRET`; no scheduler in repo |
| Public Flow page | no longer generates AI context | AI context is read-only on the public page |
| In-memory rate limit cleanup | `setInterval` in `lib/rateLimit.ts` and `lib/middleware/rateLimit.ts` | not a queue; no external calls |

No recursive scheduling loop remains. The Brain worker queues graph work only
after a run is drained, and graph queue creation is bounded by queue and request
limits. Graph work never re-queues Brain ingestion.

---

## 4. Hard limits

All values are environment-configurable. `OPS_*` takes precedence over legacy
`BRAIN_*` values.

### Global

| Variable | Default | Meaning |
| --- | ---: | --- |
| `OPS_WORKERS_ENABLED` | `true` | environment fallback when DB settings are unavailable |
| `OPS_KILL_SWITCH` | `false` | environment kill switch |
| `OPS_WORKER_LOCK_TTL_SECONDS` | `900` | lease TTL |
| `OPS_WORKER_LOCK_HEARTBEAT_MS` | `60000` | heartbeat interval |
| `OPS_MAX_ENQUEUE_PER_REQUEST` | `50` | max jobs created by one admin request |
| `OPS_CIRCUIT_FAILURE_THRESHOLD` | `3` | consecutive failures before opening |
| `OPS_CIRCUIT_COOLDOWN_SECONDS` | `300` | base cooldown |
| `OPS_CIRCUIT_MAX_COOLDOWN_SECONDS` | `3600` | cooldown cap |
| `OPS_PIERROT_LLM_TIMEOUT_MS` | `25000` | Pierrot SDK timeout |
| `OPS_PIERROT_LLM_MAX_TOKENS` | `700` | Pierrot output cap |
| `OPS_FLOW_LLM_TIMEOUT_MS` | `20000` | Flow SDK timeout |
| `OPS_FLOW_LLM_MAX_TOKENS` | `600` | Flow output cap |

### Per worker

| Scope | Max jobs | Max duration | Max queue | Max queue age | Hour/day budget | Max retries |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| brain | 5 | 240 s | 500 | 168 h | 60 / 300 | 3 |
| graph | 5 | 240 s | 500 | 168 h | 60 / 300 | 3 |
| media | 3 | 180 s | 100 | 168 h | 30 / 120 | 3 |
| newsletter | 1 | 45 s | 20 | 24 h | 10 / 1000 emails | 1 |
| retention | 1 | 55 s | n/a | n/a | 4 / 24 | 1 |

Additional per-scope variables:

- `OPS_BRAIN_MAX_EMBEDDINGS` default 30
- `OPS_BRAIN_MAX_EXTERNAL_HTTP` default 60
- `OPS_GRAPH_MAX_LLM_CALLS` default 10
- `OPS_MEDIA_MAX_LLM_CALLS` default 6
- `OPS_NEWSLETTER_MAX_EMAILS` default 25

These are deliberately conservative. They are lower than the old implicit
unbounded behavior and leave room inside the 300 s route limit for one job to
finish and release its lease.

---

## 5. Locks, queues and budgets

### 5.1 Global lock

- Table: `worker_locks`
- Functions: `claim_worker_lock`, `release_worker_lock`, `heartbeat_worker_lock`
- Key: `worker:<scope>`
- Atomic insert with `ON CONFLICT DO NOTHING`; expired rows are deleted first.
- TTL 900 s; heartbeat every 60 s.
- A second manual invocation receives `lock_conflict` and does nothing.
- If the database function is unavailable, the worker fails **closed**
  (`lock_unavailable`) rather than running without protection.
- Stale locks are recoverable after expiry; the lock event is recorded.

### 5.2 Queue protections

- Admin Brain bulk URL import: max 50 URLs per request; queue cap 500.
- Admin Media bulk import: max 50 URLs per request; Brain queue cap 500.
- Graph run creation: max 50 selected documents per request; Graph queue cap 500.
- Media analysis enqueue: max 50 per request (default path lower), media queue cap 100.
- Newsletter worker: one job, 25 emails, 45 s per invocation; partial work is
  returned to `pending` and already-processed subscriber IDs are filtered from
  `newsletter_logs` on the next invocation.
- Queue age is checked before enqueue. A stale queue blocks new enqueue with
  `queue_limit_reached`.
- No job rows are deleted by any limit path. Failed history is preserved.

### 5.3 Budgets

- Brain/Graph: sum of `brain_worker_runs.processed` for the last hour/day.
- Media: completed `media_analysis_runs` in the last hour/day.
- Newsletter: `newsletter_logs.status='sent'` in the last hour/day.
- On exhaustion: the worker returns `skipped` / `budget_exhausted`, records
  `worker_budget_exhausted`, releases the lock and leaves jobs queued.
- Budget counters are aggregate; they do not store user content.

---

## 6. Retry policy and circuit breakers

### Retry

- Finite `max_attempts` on every queue (default 3; newsletter one pass).
- Exponential backoff: 15 s, 30 s, 60 s … capped at 900 s.
- Jitter: ±15 % around the base delay.
- `Retry-After` is honored for page fetches and embedding HTTP responses.
- Permanent errors are terminal:
  - 401/403 embedding auth/permission;
  - 402 payment;
  - paywall;
  - invalid input;
  - malformed response;
  - document has no chunks;
  - missing document.
- A permanent error never re-enters the queue automatically.
- Dead-letter state is the existing `failed` status with `error_code` and
  `error_detail`; history is preserved.
- Manual recovery is available in `/admin/operations` (single job only).

### Circuit breakers

- Table: `ops_circuit_breakers`
- Dependencies: `embedding`, `llm`, `extraction`, `email`, `external`
- Opens after 3 consecutive failures or immediately on a permanent error.
- Cooldown starts at 300 s and doubles up to 3600 s.
- Half-open state allows one retry after cooldown.
- Success closes the circuit and resets the failure count.
- Integrated in:
  - Brain worker embedding success/failure;
  - Graph LLM calls;
  - Media analysis LLM calls;
  - Pierrot generation;
  - Flow AI generation.

---

## 7. Orphaned Brain and Graph work

The old worker selected only runs with `status='running'`. That left queued jobs
inside `completed_with_errors` runs permanently invisible.

Fix:

- `brain_list_recoverable_runs()` and `graph_list_recoverable_runs()` return any
  run that is not explicitly `paused`/`cancelled` and still has
  `queued`/`processing` jobs.
- `listRecoverableRuns()` has a safe fallback for installations where the new
  RPC is not yet applied.
- When a recoverable terminal run is picked, its status is reset to `running`
  and `completed_at` is cleared before processing.
- Completed jobs are never reprocessed.
- Permanent failures are not requeued.
- Run history and diagnostics are preserved.
- Regression tests cover the terminal-run-with-queued-jobs case.

The audit did **not** execute the production recovery. The 53 jobs in
`6436abaf…` remain queued until the owner runs a bounded batch after applying
the migration.

---

## 8. Kill switch and manual controls

Admin page: `/admin/operations`

Controls:

- global kill switch;
- per-worker enable/disable;
- manual bounded batch for Brain, Graph and Media;
- single job retry/recovery for Brain, Graph and Media.

Safety rules in the UI/API:

- batch run requires `confirm=true` and shows the queue volume first;
- no mass-run button without confirmation;
- no schedule toggle;
- no secret display;
- all actions require the existing knowledge-admin authorization.

The kill switch blocks new worker invocations, not the public site, public
search, Pierrot chat, or already-running requests. Running requests finish
inside their own timeout.

Database setting: `ops_runtime_settings` key `workers_enabled`; per-worker map
`worker_scopes`. Environment fallback: `OPS_KILL_SWITCH` / `OPS_WORKERS_ENABLED`.

---

## 9. Observability and alerts

Event table: `ops_events`

Events emitted:

`worker_started`, `worker_completed`, `worker_timeout`, `worker_skipped`,
`worker_budget_exhausted`, `lock_acquired`, `lock_conflict`,
`stale_lock_recovered`, `job_retry`, `job_dead_lettered`, `circuit_opened`,
`circuit_closed`, `queue_limit_reached`, `global_kill_switch_enabled`.

No event stores full user content, query text, passages or secrets. Details are
compact scalars and short error codes.

Dashboard alerts:

- queue over limit or too old;
- budget exhausted;
- stale lock;
- open circuit;
- last worker failure;
- global kill switch / disabled worker.

No external pager was added. Alerts are visible in `/admin/operations` and are
emitted as `ops_events` for future alert shipping.

---

## 10. Media Analysis

- Daily Vercel cron removed from the repository.
- No Supabase schedule added.
- Manual runs use the shared media lock and budget.
- Max 3 publications per invocation, 180 s, 6 LLM calls.
- Queue claim is atomic with a 900 s lease.
- One active run per publication is enforced by `media_analysis_runs_active_uidx`.
- Quote/current-row duplicates are prevented by `media_quotes_current_uidx`.
- Partial extraction is never treated as full text.
- Paywall content is not bypassed.

Current production media analysis state: 179 completed, 1 failed
(`deepseek_invalid_json`, attempt 3/3), 0 pending. No mass re-index was run.

The 8–9 failed media coverage indexing records remain as they were:
full text preserved where extraction succeeded, zero chunks where embedding
failed, and blocked/paywall records marked as such. They are not shown as
successfully indexed.

---

## 11. Pierrot and Flow

### Pierrot

- one LLM call per request;
- per-IP/per-Telegram rate limit unchanged;
- SDK retries disabled (`maxRetries: 0`);
- 25 s SDK timeout, 700 output tokens;
- retrieval candidates and context budget remain bounded by existing RAG
  configuration;
- on RAG failure, the existing safe fallback prompt is used;
- public mode cannot retrieve owner-only documents; owner mode requires a
  verified owner identity;
- LLM circuit breaker opens on repeated/permanent failures.

### Flow

- the public Flow item page no longer generates AI context on first view;
- AI context is generated only through the existing admin action;
- public RAG uses only `public_retrieval_allowed=true` documents and excludes
  `manuscript` / `personal_writing`;
- Flow AI SDK retries disabled, 20 s timeout, 600 output tokens;
- existing 45 Flow contexts are not regenerated by this change;
- Flow crosspost formatting has a 7 s fetch timeout and text fallback.

---

## 12. Migration and deployment

New migration: `migrations/2026-11-11_resource_safety.sql`

Objects:

- `ops_runtime_settings`
- `worker_locks`
- `ops_events`
- `ops_circuit_breakers`
- `claim_worker_lock`, `release_worker_lock`, `heartbeat_worker_lock`
- `brain_list_recoverable_runs`, `graph_list_recoverable_runs`
- `ops_scheduler_status`

Safety:

- no table, row, job, document or embedding is deleted;
- no existing column is dropped or rewritten;
- no schedule is created or enabled;
- all tables are service-role only;
- the migration is backward compatible but must be applied before workers can
  acquire a lock.

**The migration has not been applied.** Until it is applied, workers fail closed
with `lock_unavailable` and the queue remains intact.

Safe apply order (manual, after review):

1. Take a database snapshot.
2. Apply `2026-11-11_resource_safety.sql`.
3. Verify the four tables and five functions exist.
4. Verify `select * from ops_runtime_settings`.
5. Open `/admin/operations`; confirm kill switch state and zero locks.
6. Run one bounded Brain batch with 1 job.
7. Inspect `ops_events`, lock release and `brain_worker_runs`.
8. Only then consider a larger bounded batch.

Rollback: drop the new functions/tables only if no event/lock history is needed.
No existing data is touched by the migration.

---

## 13. Manual secret configuration (future only)

Do not generate or publish secrets automatically. If the owner later decides to
enable `brain_worker_tick()` or a protected endpoint:

1. Generate a random secret outside the repository.
2. Set Vercel `CRON_SECRET` to that value.
3. Store the same value in Supabase Vault as `brain_worker_cron_secret`.
4. Store the public base URL in Vault as `brain_worker_base_url`.
5. Keep `pg_cron` disabled until a separate owner decision.
6. Test with a single authenticated `POST /api/cron/brain-worker` and a
   one-job limit.
7. Verify the request returns 200 and `ops_events` records the run.

This change does none of the above.

---

## 14. Remaining risks and owner decisions

1. **Production scheduler history is contradictory.** `cron.job` is empty while
   jobid 2 has five-minute run history. The owner should inspect the Supabase
   scheduler directly before assuming it is off.
2. **Existing deployment may still have Vercel Cron** until the repository is
   redeployed. This change removed the declarations but did not deploy.
3. **The migration is not applied.** Workers fail closed until it is.
4. **Newsletter admin send is synchronous.** It can send to all matching
   subscribers inside one admin request. The background worker is bounded; the
   admin PATCH path still needs an owner decision about whether to switch it to
   queued-only processing.
5. **Flow issue analysis** is bounded by its own 40 s/6-item budget but is not
   routed through the global worker lock. It is admin-triggered and does not
   schedule another run.
6. **Embedding circuit breaker** is recorded at the Brain worker boundary; a
   standalone retrieval request can still call the provider directly. Retrieval
   already has its own timeout and safe fallback.
7. **Dead-letter recovery** is single-job only in the dashboard. Bulk retry
   routes still exist with queue-capacity checks; they should be used with
   explicit confirmation.
8. **No external alert shipping.** Events and dashboard alerts exist, but no
   pager/email alert channel was added because that would add a new paid service.

---

## 15. Tests and verification commands

```bash
npx tsc --noEmit
npx jest --runInBand
npm run build
```

Results on 2026-10-31:

- `npx tsc --noEmit` → exit 0.
- Full Jest suite → **133 suites / 880 tests passed**.
- Production build → `next build` exit 0.
- Focused resource-safety/worker/media/Flow/Pierrot suite → **7 suites / 69 tests passed**.

Jest reports open `MESSAGEPORT` handles from React Testing Library after the
suite completes. This is a pre-existing test-runtime artifact; it is not a
worker or production interval. The suite completes with `--forceExit` and the
server-side cleanup intervals were changed to `.unref()`.

The resource-safety regression tests cover:

- database/env kill switch;
- per-worker disable;
- lock acquire/release/conflict;
- expired lock recovery;
- circuit open/close;
- enqueue limit;
- queue age/capacity;
- worker time budget;
- orphaned terminal-run recovery (Brain and Graph);
- no Vercel cron and no new pg_cron schedule.

Full-suite and production-build results are recorded in the final task report.
