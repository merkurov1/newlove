# Pierrot Engineering Workbench

Owner-controlled engineering execution from `/admin/pierrot/dev`.

One owner, one Codespace, one OpenCode executor, one task at a time. GitHub
remains infrastructure; the owner works from Admin.

## Components

| Part | Location |
| --- | --- |
| Admin overview API | `app/api/admin/pierrot/dev/workbench/route.ts` |
| Admin actions API | `app/api/admin/pierrot/dev/workbench/actions/route.ts` |
| Setup health checks | `app/api/admin/pierrot/dev/workbench/setup/route.ts` |
| Internal worker API | `app/api/internal/pierrot/dev/worker/route.ts` |
| Queue / attempts / events | `lib/pierrot/dev/workbench/*` |
| Codespace worker | `scripts/pierrot/dev-worker.mjs` |
| Worker lifecycle | `scripts/pierrot/dev-worker-start.sh` / `dev-worker-supervisor.sh` / `dev-worker-stop.sh` |
| Codespace lifecycle | `lib/pierrot/dev/workbench/lifecycle.ts` |
| Cost ledger | `lib/pierrot/dev/workbench/costs.ts` |
| Admin UI | `components/pierrot/workspace/DevWorkbench.tsx` |
| Migration (additive) | `migrations/2026-11-22_pierrot_dev_workbench.sql` |
| Existing task table | `public.pierrot_dev_prompts` (reused) |

## State machines

Task: `draft → ready → queued → in_progress → review → verified`

Additional: `failed`, `rejected`, `cancelled`, `archived`, `blocked`.
Transitions are closed in `lib/pierrot/dev/workbench/state.ts`.

Attempt: `created → claimed → running → completed | failed | cancelled | timed_out`.

Every retry creates a new attempt row and a new branch
`pierrot/dev/<task-id>/<attempt-number>`. Previous attempts are never
overwritten.

## One-time setup

1. Apply the additive migration manually. It is never applied automatically:

   ```sql
   -- review first
   psql "$DATABASE_URL" -f migrations/2026-11-22_pierrot_dev_workbench.sql
   ```

2. Generate a worker token in Admin → `DEV` → `SETUP` → **Generate worker token**.
   It is shown once and never stored. Store the same value in:
   - Vercel Production env: `PIERROT_DEV_WORKER_TOKEN`
   - Codespaces secret: `PIERROT_DEV_WORKER_TOKEN`

3. Set the server env:

   - `PIERROT_DEV_CODESPACE_NAME` — the existing Codespace name
   - `GITHUB_TOKEN` — fine-grained token with repository contents/PR write and
     Codespaces read/write (read is enough to display state; write is required
     to start/stop from Admin)
   - `VERCEL_TOKEN` + optional `VERCEL_PROJECT_ID` — read-only deployment status

4. In the Codespace, set:

   - `PIERROT_DEV_API_URL` — https origin of the deployed admin app
   - `PIERROT_DEV_WORKER_TOKEN` — same token
   - optionally `PIERROT_DEV_PIERROT_DIR`, `PIERROT_DEV_WORK_ROOT`

5. Authenticate OpenCode once inside the Codespace:

   ```sh
   opencode auth login
   ```

   The worker does not forward GitHub, Supabase or worker secrets to OpenCode.
   It relies on the stored provider login, not on provider env variables.

6. Re-check `SETUP`. The report is only green when the schema, GitHub, worker,
   Codespace, OpenCode version/authentication, and worker heartbeat are all
   verified.

## Autonomous lifecycle

- Approving a standalone task also queues it, so the owner never has to trigger
  the infrastructure. Tasks attached to a batch stay ready until the batch is
  started. The Vercel backend calls the GitHub Codespaces start API when a
  queued task exists and the Codespace is stopped.
  Startup is idempotent and state-aware (`Stopped`, `Starting`, `Available`,
  `Stopping`, `ShuttingDown`, unsupported).
- If a stop is already in flight, the backend records a pending start and
  retries it after the stop settles. A new task never waits for the owner to
  click Start.
- Starting the Codespace runs `postStartCommand`; a detached supervisor starts
  the worker and restarts it with bounded exponential backoff after abnormal
  exits. Lifecycle hooks no longer use `|| true`, so configuration failures are
  visible.
- The backend does not report Ready just because GitHub says `Available`.
  Admin waits for a fresh worker heartbeat and a readiness proof: worker
  configuration, Pierrot API/Supabase reachability, OpenCode >= 2.1.4 and
  stored provider authentication. A not-ready worker never claims tasks.
- When the queue is empty and no attempt/task is active, the worker reports its
  idle time. The backend waits the idle grace period (default 120 seconds),
  takes a lifecycle lock, rechecks the queue and active attempts, records the
  intent, rechecks again, and only then asks GitHub to stop the Codespace.
- A task submitted between the two checks cancels the stop. A task submitted
  after the stop request causes a pending start, which is retried by the
  backend and by the next Admin overview poll.
- Shutdown is safe to repeat. Stop failures are recorded with a bounded retry
  delay; the worker keeps heartbeating instead of exiting.
- The Codespace `GITHUB_TOKEN` in this environment only has
  `codespaces=read`. It is never used to stop the Codespace. The server
  `GITHUB_TOKEN` must have Codespaces read/write.

## Worker behaviour

- Started by `postStartCommand`/`postAttachCommand`, never by a blocking
  `postCreateCommand`.
- Polls every ~20 seconds with capped exponential backoff.
- Claims atomically through `pierrot_dev_claim_next_task`, which uses an
  advisory lock, `FOR UPDATE SKIP LOCKED`, and a partial unique index that
  allows at most one active attempt in the database.
- Heartbeats every ~25 seconds and renews a 30-minute lease.
- Runs `opencode run --standalone --format json` in a clean environment inside
  a per-attempt git worktree.
- Commits and pushes only to the generated attempt branch; PR creation happens
  on the server after the result is recorded.
- Keeps failed completion payloads in a local outbox and retries delivery.
- Parses OpenCode `step_finish` events for actual token usage and model cost.
  Missing cost data is stored as unknown, never zero.
- On SIGTERM releases the lease and requeues the task.

## Review and merge

- A commit or PR is never treated as completion.
- CI check runs and local, executor-reported commands are shown separately.
- Executor-reported commands are self-reported unless
  `PIERROT_DEV_TRUST_SELF_REPORTED_CHECKS=true`.
- A changed filename is never acceptance evidence.
- Accept requires every criterion to have CI evidence or explicit manual
  confirmation.
- Merge is only available for a `verified` task, with an explicit confirmation,
  and only for the exact reviewed head SHA. After merge the task is archived
  (history preserved) and Vercel deployment status is shown when configured.

## Dev Cost Ledger

- Model token usage and cost come from OpenCode `step_finish` events. When the
  CLI does not report them they are stored as `null` with a provenance of
  `unavailable`, never as zero.
- Codespaces cost is estimated from the machine type and measured wall-clock
  runtime. GitHub does not expose billed Codespaces minutes to this token, so
  the value is always labelled as an estimate. Set
  `PIERROT_DEV_CODESPACE_HOURLY_USD` to override the list price.
- A total is only produced when both the model and Codespaces components are
  known. Partial totals are reported as unavailable.
- Startup, ready, idle, stop-request and measured-runtime timestamps are stored
  in server-only lifecycle settings and appear in the EXECUTION panel.

## Security boundaries

- New tables have RLS enabled, no PUBLIC/anon/authenticated grants, and no
  `SECURITY DEFINER` functions.
- Internal RPCs are executable only by `service_role`.
- Worker endpoints use a dedicated 32+ character secret, compared in constant
  time. The Supabase service-role key is never a worker credential.
- OpenCode receives a scrubbed environment: no GitHub token, no Supabase keys,
  no worker token. `.env`, credential and key files are denied by OpenCode
  permissions; external directories are denied.
- The executor cannot push, force-push, merge, deploy, use `gh`, `vercel`,
  `supabase`, or publish packages.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `schema missing` | Apply the migration manually, then Re-check. |
| `worker offline` | Queueing a task should start the Codespace automatically. If it does not, check the lifecycle detail in EXECUTION, then `$HOME/.pierrot-dev-work/logs/worker.log` and `worker-boot.log`. |
| `OpenCode CLI missing` | Install/verify `opencode --version` in the Codespace. |
| `Stored provider authentication: missing` | Run `opencode auth login` in the Codespace. |
| Codespace start returns 403 | Grant the fine-grained token **Codespaces: write**. |
| No CI checks | Add/verify the repository CI workflow; acceptance then requires manual confirmation. |
| Vercel `unavailable` | Set `VERCEL_TOKEN` (and `VERCEL_PROJECT_ID` if auto-detection fails). |
