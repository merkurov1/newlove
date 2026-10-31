# Production operations and deployment checklist

**Last audit:** 2026-10-31  
**Scope:** Brain ingestion, Media Intelligence, Pierrot, Flow RAG, Telegram
crossposting, RSS feeds, admin Overview.

This document is the operational companion to the feature documents. It lists
the environment, migrations, queue recovery procedure, deployment checks and
the limitations that remain after the audit.

---

## 1. Environment variables

### Required in production

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Canonical URL used in links, feeds, checkout redirects and Telegram messages |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase key; RLS still applies |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged access. Never expose to the browser |
| `SUPABASE_URL` | Server-side Supabase URL |
| `CRON_SECRET` | Bearer secret for every `/api/cron/*` endpoint |
| `DEEPSEEK_API_KEY` | Pierrot chat, Brain graph extraction and Media Intelligence |
| `OPENROUTER_API_KEY` | `baai/bge-m3` embeddings (1024 dimensions) |
| `TELEGRAM_BOT_TOKEN` / `PIERROT_BOT_TOKEN` | Telegram webhook / Pierrot adapter |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram webhook validation |
| `PIERROT_OWNER_TELEGRAM_ID` | The only Telegram account allowed to accept human handover |

### Brain / RAG

| Variable | Default | Purpose |
|---|---|---|
| `PIERROT_RAG_ENABLED` | `false` | Owner Brain retrieval. Must be `true` in production for owner mode |
| `PIERROT_PUBLIC_RAG_ENABLED` | `false` | Public Pierrot retrieval. Leave off until public documents are explicitly approved |
| `PIERROT_BRAIN_RETRIEVAL_V2` | `true` | Source-aware retrieval |
| `BRAIN_RAG_MIN_SIMILARITY` | `0.32` | Retrieval floor |
| `UNFRAMED_RAG_MIN_SIMILARITY` | `0.45` | Manuscript/unframed retrieval floor |
| `UNFRAMED_EMBEDDING_MODEL` | `baai/bge-m3` | Embedding model id; must stay 1024-dimensional |
| `BRAIN_AUTO_GRAPH` | `true` | Queue graph extraction after a completed ingestion run |
| `BRAIN_GRAPH_MODEL` | DeepSeek chat model | Graph extraction model override |
| `MEDIA_ANALYSIS_MODEL` | DeepSeek chat model | Media Intelligence model override |

### Flow public RAG

| Variable | Default | Purpose |
|---|---|---|
| `FLOW_AI_RAG_ENABLED` | `true` | Global switch for public Flow context generation |
| `FLOW_AI_RAG_MIN_SIMILARITY` | `0.34` | Public retrieval floor |

### Workers and throttles

| Variable | Default | Purpose |
|---|---|---|
| `BRAIN_WORKER_MAX_JOBS` | `5` | Ingestion jobs per invocation |
| `BRAIN_WORKER_MAX_DURATION_MS` | `240000` | Ingestion time budget |
| `BRAIN_WORKER_LEASE_SECONDS` | `900` | Ingestion lease |
| `BRAIN_GRAPH_WORKER_MAX_JOBS` | `5` | Graph jobs per invocation |
| `BRAIN_GRAPH_WORKER_MAX_DURATION_MS` | `240000` | Graph time budget |
| `BRAIN_GRAPH_WORKER_LEASE_SECONDS` | `900` | Graph lease |
| `OPS_KILL_SWITCH` | `false` | Stops every worker when `true` |
| `OPS_WORKERS_ENABLED` | `true` | Global worker switch |
| `OPS_BRAIN_ENABLED`, `OPS_GRAPH_ENABLED`, `OPS_MEDIA_ENABLED` | `true` | Per-scope switches |
| `OPS_MEDIA_MAX_JOBS` | `3` | Media jobs per invocation |
| `OPS_MEDIA_MAX_DURATION_MS` | `180000` | Media time budget |
| `OPS_WORKER_LOCK_TTL_SECONDS` | `900` | Cross-instance worker lock |
| `OPS_MAX_ENQUEUE_PER_REQUEST` | `50` | Maximum enqueue batch |
| `OPS_BRAIN_MAX_QUEUE`, `OPS_GRAPH_MAX_QUEUE`, `OPS_MEDIA_MAX_QUEUE` | `500/500/100` | Backlog ceilings |
| `OPS_BRAIN_MAX_QUEUE_AGE_HOURS` etc. | `168` | Oldest allowed queue age |

The complete, canonical list is `lib/operations/config.ts`. The legacy
`BRAIN_*` names remain supported; `OPS_*` takes precedence when both are set.

### Pierrot commercial / handover

| Variable | Purpose |
|---|---|
| `PIERO_API_SECRET` | Server-to-server Telegram adapter secret |
| `PIERROT_OFFER_POLICY_JSON` | Optional fallback offer policy |
| `PIERROT_HUMAN_REQUEST_TTL_MINUTES` | Pending handover TTL (default 20, max 60) |
| `MY_TELEGRAM_ID` | Fallback owner id if `PIERROT_OWNER_TELEGRAM_ID` is absent |

---

## 2. Migrations and schema parity

The production schema was verified against every migration in `migrations/`
(2026-10-29 through 2026-11-10) on 2026-10-31:

- all migrated tables exist;
- all migrated `ADD COLUMN` fields exist;
- all expected partial unique indexes exist;
- no duplicate current chunks, documents or active media jobs were found.

Recent migrations relevant to this audit:

| Migration | Result |
|---|---|
| `2026-11-05_unified_brain_source_ingestion.sql` | applied |
| `2026-11-06_autonomous_brain_worker.sql` | applied |
| `2026-11-07_media_source_ingestion.sql` | **applied during this audit**; it had been missing and caused 53 `brain_media_record_query_failed` failures |
| `2026-11-08_media_analysis_queue.sql` | applied |
| `2026-11-09_flow_ai_public_rag.sql` | applied |
| `2026-11-10_pierrot_rate_limit.sql` | applied |
| `2026-11-11_resource_safety.sql` | applied during this audit; adds ops tables, worker locks, circuit breakers and recovery RPCs |

There is no `schema_migrations` table in this project. Parity checks therefore
compare `information_schema` / `pg_indexes` against the migration files. Run the
same check after every migration:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by 1;
```

Fixes applied during the audit:

- `2026-11-07` was missing and caused 53 Brain jobs to fail; it is now applied.
- `2026-11-11_resource_safety.sql` is applied; without it the new worker
  guard would skip every production worker invocation.
- `/api/health` probed `users` with the anon key, which RLS correctly denies, so
  production returned `503` even though the database was healthy. The probe now
  reads one published row from the anon-readable `letters` table.

Security posture:

- RLS is enabled on every Brain, Media, Pierrot and Flow context table.
- `anon` / `authenticated` have **no** table or function grants on those
  tables and RPCs, with the deliberate exception of published
  `media_archive_records` (SELECT, `status = 'published'`).
- All SECURITY DEFINER functions set an explicit `search_path`.
- `brain_search_hybrid`, `media_search`, `brain_claim_next_job` and the graph
  claim RPC are service-role only.

One hygiene issue remains: the production policy
`service role all access flow ai context` is attached to `PUBLIC` instead of
`service_role`. It is harmless today because `flow_ai_context` has no
`anon`/`authenticated` grants, but the policy should be scoped to
`service_role` in a future hardening migration.

---

## 3. Queue recovery runbook

Queues are durable tables, not in-process jobs. A closed browser, a redeploy or
a function timeout cannot lose a claimed job.

The **Operations** page at `/admin/operations` shows worker scopes, queues,
budgets, locks, circuit breakers, recent runs, scheduler status and alerts. It
uses the same guarded worker functions; it is not a second queue.

### Diagnose

```sql
-- Ingestion queue
select status, error_code, count(*), min(created_at), max(updated_at)
from brain_ingestion_jobs
group by 1, 2
order by 3 desc;

-- Graph queue
select status, error_code, count(*)
from brain_graph_jobs
group by 1, 2;

-- Media analysis queue
select status, count(*)
from media_analysis_runs
group by 1;
```

Expired leases are recovered automatically on the next worker invocation
(`locked_at` older than the lease, or `lease_expires_at` in the past). A job
with exhausted attempts becomes `failed` with `stale_worker`; it is not deleted.

### Recover

1. Check `OPS_KILL_SWITCH` / `OPS_*_ENABLED`.
2. Open `/admin/brain` and press **Run ingestion** / **Run graph**; or call the
   protected route with an admin session.
3. For a daily cron deployment, call the same worker repeatedly until drained:

   ```bash
   curl -X POST https://<host>/api/cron/brain-worker \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

4. If a job failed for a permanent reason, fix the source first, then use the
   admin **Retry** action. Do not bulk-reset failed rows: the active-job unique
   indexes reject duplicate active rows for the same media record or URL.

Safe single-row retry:

```sql
update brain_ingestion_jobs
set status = 'queued', attempts = 0, retry_after = null,
    error_code = null, error_detail = null,
    worker_id = null, locked_at = null, updated_at = now()
where id = '<job-id>'
  and status = 'failed'
  and not exists (
    select 1 from brain_ingestion_jobs active
    where active.id <> brain_ingestion_jobs.id
      and active.status in ('queued', 'processing')
      and (
        (brain_ingestion_jobs.media_record_id is not null
          and active.media_record_id = brain_ingestion_jobs.media_record_id)
        or (brain_ingestion_jobs.normalized_url is not null
          and active.normalized_url = brain_ingestion_jobs.normalized_url)
      )
  );
```

5. Cancel a stuck run only through `/api/admin/brain/runs/<id>/cancel` or the
   admin UI. Cancellation sets remaining jobs to `cancelled`; it never deletes
   completed documents.

### Permanent errors that should not be retried blindly

- `embedding_auth_failed`, `embedding_payment_required`
- `http_status_402`
- `pdf_ocr_required`, damaged/password-protected PDF
- invalid UTF-8 / binary TXT
- `extraction_failed`
- graph `document_not_found`, `document_has_no_chunks`,
  `deepseek_not_configured`

### Scheduling note

`vercel.json` currently contains **no cron entries** after the resource-safety
change. The worker endpoints still exist and are protected by `CRON_SECRET`, but
nothing calls them automatically. Until an external scheduler is configured,
use `/admin/operations` (Operations dashboard), `/admin/brain`,
`/admin/media/intelligence`, or `POST /api/admin/operations` with
`action: "run_batch"` and `confirm: true`.

Recommended production setup:

- external scheduler every 5–15 minutes:
  `/api/cron/brain-worker`, `/api/cron/graph-worker`,
  `/api/cron/media-analysis-worker`;
- once per day: `/api/cron/pierrot-retention`;
- bearer header: `Authorization: Bearer $CRON_SECRET`.

Vercel Hobby allows at most two daily cron jobs and is not a reliable
high-frequency queue runner. Do not add four `crons` entries to `vercel.json` on
Hobby: the deployment will be rejected.

### Backlog note

At audit time the queues contained 104 queued ingestion jobs and 112 queued
graph jobs. Most are Media Archive publications queued during the backfill.
With 5 jobs per manual invocation, this backlog takes many invocations to
drain. Use the Operations API / admin buttons in a loop, or an external
scheduler, until both queues are empty.

---

## 4. Deployment checklist

### Before deploy

- [ ] `npx tsc --noEmit` passes.
- [ ] `npx jest --runInBand --forceExit` passes.
- [ ] `npx next build` passes locally or in CI.
- [ ] Every new migration is applied in order and verified with the parity
      queries above.
- [ ] Required Vercel Production variables are present, especially
      `CRON_SECRET`, `PIERROT_RAG_ENABLED`, `OPENROUTER_API_KEY` and
      `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] `PIERROT_PUBLIC_RAG_ENABLED` is still `false` unless public documents were
      explicitly approved.
- [ ] No `.env*` file, key, token or private manuscript is staged.

### After deploy

- [ ] `GET /api/health` returns OK.
- [ ] `/feed.xml`, `/rss.xml`, `/flow/rss` and `/flow/rss.xml` return the
      expected feed type.
- [ ] Admin Overview shows the **RAG / Brain** panel with non-zero documents,
      chunks and embedded chunks.
- [ ] `/admin/brain/research` answers an inventory question with a count and
      document list.
- [ ] A normal Pierrot public question answers without owner knowledge.
- [ ] Owner Pierrot (verified session) answers with Brain citations.
- [ ] Telegram Flow crosspost still contains the `>>>` link.
- [ ] `/api/cron/brain-worker`, `/graph-worker`,
      `/media-analysis-worker`, `/pierrot-retention` return 200 with the cron
      bearer or 401 without it.
- [ ] An external scheduler is configured, or the operator explicitly accepts
      manual queue processing.
- [ ] `GET /api/admin/operations` returns worker scopes and queue snapshots.
- [ ] Vercel function logs contain no new `embedding_auth_failed`,
      `brain_database_unavailable` or `Owner mode is not available` spikes.

### Rollback

- Application rollback: redeploy the previous Vercel deployment.
- Data rollback: never delete Brain/Media rows to “undo” a deploy. Disable the
  worker (`OPS_KILL_SWITCH=true`), keep the queue, and revert code.
- Migration rollback: use the matching file in `migrations/rollback/` only
  after taking a database backup. Several recent migrations are additive and
  do not need a rollback.

---

## 5. Expected AI / API cost drivers

This audit does not assume a provider price list. Use the provider dashboards
for current tariffs. The measurable volume drivers are:

| Workload | Current volume (2026-10-31) | Cost driver |
|---|---:|---|
| Brain corpus | 137 documents / 758 chunks, all indexed chunks embedded | One embedding per new chunk |
| Brain graph | 117 completed documents | One DeepSeek JSON extraction per document |
| Media Intelligence | 179 completed runs / 115 publications | One DeepSeek JSON extraction per publication, plus quote relation rebuilds with no model call |
| Flow AI context | 45 ready rows | One generation on the first public view of an item with no context, then cached in `flow_ai_context`; admin regeneration only on request |
| Pierrot chat | Per visitor message | One DeepSeek completion; owner RAG adds one embedding per retrieval attempt (up to 3 refinements) |
| Public Flow/Pierrot RAG | 0 approved public documents | Zero retrieval cost until documents are approved |

Practical controls already in place: owner RAG flag, public RAG flag, retrieval
top-K limits, media worker batch size, worker job/time budgets, circuit breaker,
and per-scope daily limits in `lib/operations/config.ts`. No cron job performs a
mass regeneration.

---

## 6. Remaining limitations

- **No automatic schedule:** the Vercel cron entries were removed with the
  resource-safety change. Queues only move when an external scheduler or an
  administrator invokes a worker.
- **Vercel Hobby:** even if cron entries are restored, Hobby allows only two
  daily jobs with up to ±59 minutes of drift. It cannot run a fast queue.
- **Embedding credentials:** the sandbox `.env.production.local` contains
  placeholders, so worker smoke tests must run in an environment with the real
  `OPENROUTER_API_KEY`. Production jobs completed earlier, which confirms the
  production key was valid at that time.
- **Build parity:** sandbox `next build` is memory-constrained and cannot be
  treated as proof of a Vercel build. Confirm in CI or Vercel.
- **Public corpus:** `public_retrieval_allowed` count is 0. Public Flow/Pierrot
  RAG is intentionally inert until an administrator approves documents.
- **Admin RAG panel sampling:** counts are read through PostgREST with a 5000-row
  cap. Above that corpus size, switch the panel to `count: 'exact'` aggregates.
- **Legacy client secret:** `components/PasswordGuard.tsx` uses
  `NEXT_PUBLIC_TALKS_PASSWORD`, which is visible in the client bundle. It is not
  part of the Brain/Pierrot path, but it is not a real server-side access
  control. Replace it with a server check if that page protects sensitive
  material.
- **Dead component:** `components/pierrot/PierrotComposer.tsx` is no longer
  mounted after the single-trigger cleanup. Its styling is retained for a future
  deliberate re-introduction; tests assert the current single header P control.

---

## 7. Verification commands

```bash
npx tsc --noEmit
npx jest --runInBand --forceExit
npx jest lib/knowledge/brain lib/knowledge/graph lib/knowledge/media \
  lib/knowledge/rag lib/pierrot lib/analytics app/api/cron \
  --runInBand --forceExit
npx next build
```

Useful read-only production checks:

```sql
-- documents, chunks, embeddings
select source_type, count(*), sum(chunk_count)
from knowledge_documents
group by 1;

select count(*) as chunks,
       count(*) filter (where embedding_model = 'baai/bge-m3'
                         and embedding_dimensions = 1024) as embedded
from knowledge_chunks;

-- queue health
select status, count(*) from brain_ingestion_jobs group by 1;
select status, count(*) from brain_graph_jobs group by 1;
select status, count(*) from media_analysis_runs group by 1;

-- public retrieval boundary
select count(*) from knowledge_documents where public_retrieval_allowed;
```

The admin **RAG / Brain** panel on `/admin` repeats these figures without
exposing query text, passages or owner documents.
