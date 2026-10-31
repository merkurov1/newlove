# Autonomous Brain and Graph workers

**Goal:** ingestion and graph extraction continue after the admin browser tab is closed, a deployment restarts, or a serverless function times out.

No permanently running server is used. The same Supabase queue and `FOR UPDATE SKIP LOCKED` RPCs are reused.

## 1. Worker model

Both workers are short, bounded HTTP invocations:

- `/api/cron/brain-worker`
- `/api/cron/graph-worker`
- `/api/admin/brain/worker` (manual, admin-authenticated)
- `POST /api/admin/operations` with `action: "run_batch"` (unified manual controls)

Every production invocation also passes through the resource-safety guard in
`lib/operations/guard.ts`: kill switch, per-scope enable flag, global worker
lock, queue/budget checks and circuit breaker. If the ops migration is missing,
the guard returns a skipped result rather than running unbounded work.

Each invocation:

1. recovers expired leases (`processing` rows older than the lease);
2. lists running runs in creation order;
3. claims one job at a time with the existing RPC;
4. processes until the job budget or time budget is exhausted;
5. finalizes completed runs and queues graph extraction once.

Default limits:

| Setting | Default |
|---|---:|
| `BRAIN_WORKER_MAX_JOBS` | 5 |
| `BRAIN_WORKER_MAX_DURATION_MS` | 240000 |
| `BRAIN_WORKER_LEASE_SECONDS` | 900 |
| `BRAIN_GRAPH_WORKER_MAX_JOBS` | 5 |
| `BRAIN_GRAPH_WORKER_MAX_DURATION_MS` | 240000 |
| `BRAIN_GRAPH_WORKER_LEASE_SECONDS` | 900 |

The HTTP routes use `maxDuration = 300`.

## 2. Authentication

Cron routes require:

```text
Authorization: Bearer <CRON_SECRET>
```

This is exactly what Vercel Cron sends when `CRON_SECRET` is configured. The manual admin route uses the normal `authorizeKnowledgeAdmin` gate.

## 3. Vercel plan constraint

The current Vercel team is on **Hobby**.

Verified limits:

- Hobby cron runs **at most once per day** per job.
- Timing precision is within the scheduled hour (±59 min).
- More frequent expressions are rejected at deploy time.
- Vercel Cron does not retry a failed invocation.

**Current state:** `vercel.json` has no `crons` entries. The resource-safety
change deliberately removed automatic scheduling so that AI spend and queue
draining stay under operator control. The endpoints remain available and
protected.

For production, use one of:

- an external scheduler every 5–15 minutes calling both worker endpoints;
- the optional Supabase `pg_cron + pg_net` tick below;
- manual operations through `/admin/brain` or `/api/admin/operations`;
- Vercel Pro with `*/5 * * * *` schedules.

Vercel Hobby allows at most two daily cron jobs. Do not configure four entries
on Hobby; the deployment will be rejected. See
`docs/production-operations.md` for the current runbook.

## 4. Optional Supabase pg_cron tick

Migration `2026-11-06_autonomous_brain_worker.sql`:

- enables `pg_cron` when the project permits it;
- creates `public.brain_worker_tick()`;
- schedules it every 5 minutes when `pg_cron` is available.

The function reads two **Vault** secrets and does nothing if either is absent:

```sql
select vault.create_secret(
  'https://www.merkurov.love',
  'brain_worker_base_url',
  'Brain worker public base URL'
);

select vault.create_secret(
  '<same value as CRON_SECRET>',
  'brain_worker_cron_secret',
  'Brain worker cron bearer secret'
);
```

The SQL file never contains the secret. The scheduled job calls both protected Vercel endpoints through `net.http_post`.

If `pg_cron` cannot be enabled on the project, the function remains available but no schedule is created; Vercel daily cron and the manual admin button still work.

## 5. Leases, heartbeat and recovery

- Every claimed job receives `worker_id` and `locked_at`.
- The worker refreshes `locked_at` at each processing stage and before/after graph LLM extraction.
- A job whose lease exceeds `BRAIN_*_WORKER_LEASE_SECONDS` is recovered:
  - `attempts < max_attempts` → `queued`, retry later;
  - attempts exhausted → `failed` with `stale_worker`.
- Recovery never deletes a job.
- Runs with no remaining queued/processing jobs are finalized as `completed` or `completed_with_errors`.

This also repairs existing stuck runs: the next worker invocation picks them up in creation order.

## 6. Retries and permanent errors

### Ingestion

Exponential backoff:

```text
15s, 30s, 60s, 120s, 240s, 480s, 900s (cap)
```

Bounded by the job's `max_attempts`. Permanent errors are not retried:

- `embedding_auth_failed` (HTTP 401)
- `embedding_payment_required` (HTTP 402)
- most embedding HTTP 4xx
- `pdf_ocr_required`, damaged/password-protected PDFs
- invalid UTF-8 / binary TXT
- invalid storage hash
- `http_status_402`
- paywall/truncated article extraction becomes `partial` / `needs_review`, not an infinite queued retry

### Graph

Graph jobs now have `retry_after` and use the same exponential backoff.

Permanent graph errors:

- `document_not_found`
- `document_has_no_chunks`
- `deepseek_not_configured`
- HTTP 400/401/402/403/404 from the model provider

Transient graph errors (429, 5xx, invalid/empty JSON, network) are retried with backoff.

## 7. Idempotency and concurrency

- Claiming remains atomic through `brain_claim_next_job` / `brain_claim_next_graph_job` (`FOR UPDATE SKIP LOCKED`).
- Only one worker can claim a job.
- Document IDs are deterministic (URL or source SHA).
- Chunk IDs are deterministic.
- Documents and chunks use upsert + stale-chunk deletion.
- Graph replacement is atomic in `brain_replace_document_graph`.
- Duplicate active media jobs remain protected by the existing partial unique index.
- Active source URLs and active graph documents are protected by partial unique indexes. The migration keeps duplicate historical rows but marks later duplicates `cancelled` with a clear reason, so no row is deleted and only one worker can process a document at a time.
- Two overlapping cron invocations are safe: the second finds no claimable job.

## 8. Admin visibility

`GET /api/admin/brain/worker/status` returns:

- active workers and their processing count / oldest lease;
- queued / processing / completed / failed / partial counts for ingestion;
- queued / processing / completed / failed / skipped counts for graph;
- oldest queued age;
- last successful worker run;
- last error (worker or job);
- active run counts;
- recent worker runs.

The Brain admin page shows this panel and buttons:

- **Run ingestion** — manual brain worker batch;
- **Run graph** — manual graph worker batch;
- **Run both** — both, with split time budgets;
- existing pause / resume / retry / cancel controls remain.

## 9. Migrations

Apply, in order:

```text
migrations/2026-11-06_autonomous_brain_worker.sql
migrations/2026-11-11_resource_safety.sql
```

`2026-11-11_resource_safety.sql` adds `worker_locks`, `ops_runtime_settings`,
`ops_events`, `ops_circuit_breakers`, `claim_worker_lock`,
`brain_list_recoverable_runs`, `graph_list_recoverable_runs` and
`ops_scheduler_status`. It does not schedule anything.

The first migration adds:

- `brain_graph_jobs.retry_after`;
- graph claim index and recovery lease indexes;
- updated `brain_claim_next_graph_job` with backoff gating;
- `brain_worker_runs` telemetry table (owner-only RLS);
- optional `pg_cron` schedule and `brain_worker_tick()`.

It does not delete or recreate any existing job, run, document or chunk.

## 10. Tests

```bash
npx tsc --noEmit
npx jest lib/knowledge/brain lib/knowledge/graph app/api/admin/brain app/api/cron --runInBand
```

Coverage includes:

- bounded batch execution (`maxJobs`);
- lease recovery invocation;
- graph queue-once behaviour;
- failed job accounting;
- race between two workers producing one document;
- permanent embedding auth/payment failures without retry;
- exponential backoff caps;
- permanent graph error classification;
- migration static safety checks.
