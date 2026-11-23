# Pierrot Engineering Workbench

Owner-controlled engineering execution from `/admin/pierrot/dev`.

One owner, one Codespace, one OpenCode executor, one task at a time. GitHub
remains infrastructure; the owner works from Admin.

## Components

| Part                               | Location                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| Admin overview API                 | `app/api/admin/pierrot/dev/workbench/route.ts`                                             |
| Admin actions API                  | `app/api/admin/pierrot/dev/workbench/actions/route.ts`                                     |
| Setup health checks                | `app/api/admin/pierrot/dev/workbench/setup/route.ts`                                       |
| Internal worker API                | `app/api/internal/pierrot/dev/worker/route.ts`                                             |
| Queue / attempts / events          | `lib/pierrot/dev/workbench/*`                                                              |
| Codespace worker                   | `scripts/pierrot/dev-worker.mjs`                                                           |
| Worker lifecycle                   | `scripts/pierrot/dev-worker-start.sh` / `dev-worker-supervisor.sh` / `dev-worker-stop.sh`  |
| GitHub Actions executor            | `.github/workflows/pierrot-actions-executor.yml` / `scripts/pierrot/actions-preflight.mjs` |
| Actions audit/pilot/rollback       | `docs/pierrot-actions-executor.md`                                                         |
| Codespace lifecycle                | `lib/pierrot/dev/workbench/lifecycle.ts`                                                   |
| Cost ledger                        | `lib/pierrot/dev/workbench/costs.ts` / `ledger.ts`                                         |
| Cost dashboard API                 | `app/api/admin/pierrot/dev/workbench/ledger/route.ts`                                      |
| Admin UI                           | `components/pierrot/workspace/DevWorkbench.tsx`                                            |
| Migration (additive)               | `migrations/2026-11-22_pierrot_dev_workbench.sql`                                          |
| Cost estimate migration (additive) | `migrations/2026-12-10_pierrot_dev_cost_ledger.sql`                                        |
| Existing task table                | `public.pierrot_dev_prompts` (reused)                                                      |

## State machines

Task: `draft → ready → queued → in_progress → review → verified`

`verified` means "landed in main with passing real CI", not "owner accepted"
and not "deployed to production". Additional states: `failed`, `rejected`,
`cancelled`, `archived`, `blocked`. Transitions are closed in
`lib/pierrot/dev/workbench/state.ts`.

Attempt: `created → claimed → running → completed | failed | cancelled | timed_out`.

Every retry creates a new attempt row and a new branch
`pierrot/dev/<task-id>/<attempt-number>`. Previous attempts are never
overwritten.

## One-time setup

1. Apply the additive migration manually. It is never applied automatically:

   ```sql
   -- review first
   psql "$DATABASE_URL" -f migrations/2026-11-22_pierrot_dev_workbench.sql
   psql "$DATABASE_URL" -f migrations/2026-12-10_pierrot_dev_cost_ledger.sql
   ```

   The second migration is additive and stores pre-queue cost estimates. The
   workbench still enqueues tasks if it is not applied; only the estimate table
   is missing and the LEDGER dashboard says so.

2. Generate a worker token in Admin → `DEV` → `SETUP` → **Generate worker token**.
   It is shown once and never stored. Store the same value in:
   - Vercel Production env: `PIERROT_DEV_WORKER_TOKEN`
   - Codespaces secret: `PIERROT_DEV_WORKER_TOKEN`

3. Set the server env:
   - `PIERROT_DEV_CODESPACE_NAME` — the existing Codespace name
   - `GITHUB_TOKEN` — fine-grained token with repository contents/PR write,
     **Checks: read** (queue finalization reads CI) and Codespaces read/write
     (read is enough to display state; write is required to start/stop from
     Admin). The finalizer blocks with `integration.blocked` instead of merging
     if the token cannot read checks or merge a PR.
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
- The Admin overview GET is safe: it may start a genuinely stopped Codespace
  when queued work exists, but it never stops or restarts an Available one.
  GitHub machine state and worker process state are shown separately
  (`worker_missing`, `worker_offline`, `starting_worker`, `checking_provider`,
  `blocked`, ...).
- If a stop is already in flight, the backend records a durable pending start
  (attempt count and next attempt time) and returns immediately. The request
  never waits for the Codespace boot. One short `after()` retry plus the next
  Admin poll complete the start idempotently.
- Worker recovery (stop + start an Available machine) is a separate, explicit
  owner action. It requires queued work, no active attempt, no online worker
  (including a not-ready worker), no shutdown intent, a proven boot signal past
  the startup grace, a 15-minute cooldown and a circuit breaker (3 failures /
  6 hours). Every decision is recorded as `codespace.worker_recovery*`.
  A confirmed worker ready heartbeat resets the circuit.
- Starting the Codespace runs `postStartCommand`; a detached supervisor starts
  the worker. `postStart` and `postAttach` are serialized with `flock`, PID
  files are validated against the expected command line, and an orphaned
  worker is adopted instead of duplicated. Lifecycle hooks no longer use
  `|| true`, so configuration failures are visible.
- The supervisor retries transient crashes indefinitely with capped
  exponential backoff (15s → 120s) and resets the budget after a stable run.
  Exit code 2 means a permanent configuration failure and is not restarted.
  `PIERROT_DEV_SUPERVISOR_MAX_RESTARTS` and
  `PIERROT_DEV_SUPERVISOR_INITIAL_BACKOFF_SECONDS` exist for bounded tests/ops;
  the default is unlimited transient recovery.
- The backend does not report Ready just because GitHub says `Available`.
  Admin waits for a fresh worker heartbeat and a readiness proof: worker
  configuration, Pierrot API/Supabase reachability, OpenCode >= 2.1.4 and
  stored provider authentication. A not-ready worker never claims tasks.
- Boot telemetry (`starting`, `checking_config`, `checking_opencode`,
  `checking_auth`, `connecting_api`, `registering`, `ready`, `failed`,
  `stopping`) is written to the local boot log first and then to the worker
  API. Admin shows the last phase, last failure, heartbeat age, versions, API
  readiness and provider auth separately from the Codespace state.
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

## Queue finalization

Automatic landing is the normal end of every task. The owner does not approve
individual tasks. The backend runs a separate, idempotent finalization pass
whenever execution is idle: no `in_progress` task and no `claimed`/`running`
attempt, and the queue is not paused. A non-empty queue is **not** a blocker,
because batch dependents intentionally stay `queued` until their prerequisite
lands. It is triggered by the worker idle request and by the Admin overview
poll; only one instance can advance it per 30-second window.

Stages:

1. **Collect** — every `review`/`verified` task with a pull request is read from
   GitHub. CI checks, mergeability, head SHA, conflicts and the real PR file
   list are recorded.
2. **Safety gate** — a PR that changes secret/credential files, contains private
   key material or destructive SQL, or modifies the CI workflow itself is
   stopped before any merge. The task keeps its PR link, attempts, reports and
   notes; nothing is marked complete. Non-blocking security-sensitive paths
   (auth, RLS, migrations) are recorded as warnings.
3. **Integrate** — one PR per pass is merged (never force-pushed) only when the
   PR is open, its exact head SHA is unchanged, CI is green and GitHub reports
   it mergeable. A conflict, branch-protection rejection, failed CI, missing CI
   evidence, stale head or security finding stops integration with a precise
   diagnostic; nothing is discarded.
4. **Verify** — CI is checked again on the integrated `main` commit.
5. **Complete** — tasks become `verified` with `verification_status: passed`
   from **real CI for the exact head**, not from executor self-report, and the
   batch is settled, cost and duration are recorded, and the owner is notified.
   Only then are dependent batch tasks claimable. `verified` means landed in
   `main`; it never means deployed to production.

The report is stored in `pierrot_dev_settings` (`finalization:state`), so a
retry is idempotent: already integrated PRs are skipped, merge SHAs are
remembered and main is never rewritten. Evidence includes the PR number/URL,
head SHA, merge commit SHA, check runs, attempt id and append-only events.
Admin → `EXECUTION` → `FINALIZATION` shows the stage, PR list, CI, commit link,
cost and a manual **Retry finalization** action. When a conflict or a security
finding needs a product/architecture decision, landing is blocked with the
exact reason; the Codespace may stop to avoid idle cost. If an executor starts
new work during finalization, the pass is superseded (`queue.refilled`) and
normal execution resumes.

### Legacy review reconciliation

Review rows created before automatic landing are reconciled against the real
GitHub PR and `main` state. The automatic finalization already does this for
rows with a PR. The protected Admin action
`reconcile_legacy` (dry-run by default; `confirm: true` applies it) also
reports rows without a PR. It never deletes a row, attempt, report, note or PR
reference:

- merged PR + passing real CI → `verified` with the merge SHA and CI evidence;
- open/closed-unmerged PR → stays `review` with an explicit reason;
- merged PR with missing/failed CI evidence → stays `review`;
- no cached PR → reported and left unchanged, never marked complete.

This is how the legacy Brain triage PR #84, AI telemetry, Markdown-first and
the obsolete production-release task are checked: a task is complete only if
its own PR is actually merged and CI passed. A production release task is not
"done" merely because code landed in `main`; deployment remains a separate,
explicitly reported state.

Baseline inspected in the repository history (database rows must still be
checked against live GitHub before any status is written):

| Legacy item                                                             | Pull request | Merge commit in `main` | Reconciliation rule                                                                 |
| ----------------------------------------------------------------------- | ------------ | ---------------------- | ----------------------------------------------------------------------------------- |
| Brain ingestion triage                                                  | #84          | `2b63771a`             | Mark landed only if GitHub says #84 is merged and its head CI passed.               |
| AI telemetry reliability                                                | #85          | `7995299b`             | Same evidence rule; do not infer completion from the report file.                   |
| Markdown-first response rendering                                       | #86          | `13216472`             | Same evidence rule.                                                                 |
| Obsolete production release task `d0e3b355-8038-4992-a8a4-9041069fffff` | none proven  | none                   | Never mark complete without a merged PR. Code in `main` is not a production deploy. |

If a legacy row has no PR or its PR is open/closed-unmerged, reconciliation
keeps it in `review` with the reason and leaves every report, attempt, note and
PR reference untouched.

### GitHub token and failure recovery

The finalizer uses the single server-side `GITHUB_TOKEN` (a fine-grained PAT or
GitHub App installation token). It does not read a separate worker or browser
token, and it never logs the token value. The minimum repository permissions
needed by the finalizer are:

| Operation                                               | Endpoint                                              | Fine-grained permission |
| ------------------------------------------------------- | ----------------------------------------------------- | ----------------------- |
| Read PR state, mergeability, head SHA                   | `GET /repos/{owner}/{repo}/pulls/{pull_number}`       | Pull requests: read     |
| Read check runs                                         | `GET /repos/{owner}/{repo}/commits/{ref}/check-runs`  | Checks: read            |
| Read legacy commit statuses                             | `GET /repos/{owner}/{repo}/commits/{ref}/status`      | Commit statuses: read   |
| Read the default branch head                            | `GET /repos/{owner}/{repo}/branches/{branch}`         | Contents: read          |
| Merge an approved PR (only when integration is allowed) | `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` | Contents: write         |

`Metadata: read` is implicit for every repository endpoint. Creating pull
requests additionally needs Pull requests write, and Codespace start/stop needs
Codespaces write; grant those only when those features are used. If GitHub
returns `x-accepted-github-permissions`, that header is the authoritative
required permission and is shown in the block reason. No force push, branch
protection bypass or repository-permission widening is performed.

Failure handling is deliberately different by cause:

- **Permission denied (401/403 without rate-limit evidence)** — finalization
  blocks with the exact endpoint and required permission and does **not** retry
  automatically. Update `GITHUB_TOKEN`, restart/redeploy the server so the new
  value is loaded, then use **Retry finalization**.
- **Rate limit (403 secondary limit or 429)** — `Retry-After` and
  `X-RateLimit-Reset` are honoured. Retries use bounded exponential backoff
  with jitter, capped by `PIERROT_DEV_GITHUB_MAX_ATTEMPTS`,
  `PIERROT_DEV_GITHUB_RETRY_BASE_MS`,
  `PIERROT_DEV_GITHUB_RETRY_MAX_DELAY_MS` and
  `PIERROT_DEV_GITHUB_RETRY_MAX_TOTAL_MS`. If the reset is farther away than
  the cap, the pass blocks with the reset time instead of holding the request
  open; it resumes automatically after that time.
- **Already merged PR** — the PR is recorded as integrated from its actual
  merged state. A repeated pass does not merge it again, even if the previous
  state write was lost.
- **Temporary API failure** — the pass blocks with the error and the PR/commit
  state that was read. Use **Retry finalization**; the pass re-reads PR,
  checks, merge state and commit SHA before acting.

Idle promotion is safe for explicit owner intent: `dequeue` writes a durable
`queue:optout:<task>` marker, so a task the owner removed is never silently
re-enqueued. Approving, enqueuing, retrying or starting a batch clears the
marker.

Events: `queue.drained`, `batch.finalization.started`,
`batch.finalization.completed`, `batch.finalization.failed`,
`integration.completed`, `integration.blocked`, `push.completed`.
Worker recovery adds `worker.recovery.started`, `worker.recovery.completed`,
`worker.registration.timeout` and `worker.auth.failed`. Notifications are sent
for worker recovery, a drained queue, each integrated commit, finalization
completion, blocked/failed finalization and Codespace stop — never for
heartbeats.

## Worker behaviour

- Started by `postStartCommand`/`postAttachCommand`, never by a blocking
  `postCreateCommand`.
- Polls every ~20 seconds with capped exponential backoff.
- Renews the attempt lease from an independent 20-second timer for the whole
  attempt, not from executor output. A silent model request cannot lose the
  lease, and every failed renewal is logged with a bounded retry counter. The
  timer also enforces an absolute attempt deadline, so a hung subprocess cannot
  keep an attempt alive indefinitely.
- Cleans up orphaned OpenCode/test process groups left inside attempt worktrees
  by a previous worker before claiming new work. The cleanup is recorded as a
  `worker.note` event. `PIERROT_DEV_SKIP_ORPHAN_CLEANUP=true` disables it.
- Caps the executor's Node heap (`PIERROT_DEV_OPENCODE_NODE_OPTIONS`, default
  `--max-old-space-size=2560`) so one `tsc`/`next build` cannot exhaust the
  Codespace container and trigger an environment restart.
- On timeout or executor failure, commits and pushes the partial changes to the
  per-attempt branch before the worktree is removed. The attempt still fails;
  the preserved SHA becomes the task's base commit so a retry resumes from it.
  Cancelled, sensitive-file and over-limit failures are never pushed.
- Claims atomically through `pierrot_dev_claim_next_task`, which uses an
  advisory lock, `FOR UPDATE SKIP LOCKED`, and a partial unique index that
  allows at most one active attempt in the database.
- Heartbeats every ~25 seconds and renews a 30-minute lease.
- Runs `opencode run --standalone --format json` in a clean environment inside
  a per-attempt git worktree.
- Commits and pushes only to the generated attempt branch; PR creation happens
  on the server after the result is recorded. Automatic commits use the
  Codespace's configured GitHub identity (falling back to the repository
  owner's verified GitHub noreply address), never an invented author.
  Every worker commit is signed with the Codespace `gh-gpgsign` helper, and the
  worker verifies the effective author/committer and the `gpgsig` header before
  pushing. An unsigned commit is never pushed. Pushes to `main`/`master` or any
  non-`pierrot/dev/<task>/<attempt>` branch are refused.
- If commit or push fails, the branch, local commit SHA and exact reason are
  kept in `$PIERROT_DEV_WORK_ROOT/push-failures/<attempt>.json`, sent with the
  failed attempt and retried through the durable outbox if the API is down.
- Keeps failed completion payloads in a local outbox and retries delivery.
  Duplicate delivery is idempotent on the server; an attempt's cost and
  completion are never recorded twice.
- Parses OpenCode `step_finish` events for actual token usage and model cost.
  Missing cost data is stored as unknown, never zero.
- On SIGTERM releases the lease and requeues the task.

## Review, landing and merge

- Owner acceptance is not part of the normal lifecycle. Running OpenCode,
  opening a PR and proving real CI on the exact head is the automatic path.
  Admin review is read-only evidence for audit and troubleshooting.
- Review is advisory and read-only for every task. Opening a verified/landed,
  rejected, archived or cancelled task in Admin never changes its state.
- For a merged pull request the review reads the PR head SHA and the PR's own
  file list. It never compares `main...merge_commit`, which is empty and used
  to produce a false "no changed files" verdict.
- A commit or PR is never treated as completion. Completion requires the PR to
  be merged and real CI to have passed for its exact head SHA.
- CI check runs and local, executor-reported commands are shown separately.
  Executor self-report is evidence only; it is never the merge gate.
- A changed filename is never acceptance evidence.
- Automatic landing merges only an open, conflict-free PR whose exact head SHA
  is unchanged and whose required checks are green. A failed check, missing
  evidence, stale head, conflict or destructive/security-sensitive finding
  stops that task with a precise reason.
- `verified` / "landed in main" is distinct from "released to production".
  Production deployment status is read separately from Vercel; landing never
  implies a deploy and this process never deploys.

## Production release

- `vercel.json` disables automatic deployments for `main` and keeps preview
  deployments for other branches. A merge to `main` never reaches Vercel
  Production by itself.
- The owner-triggered release reads `main` on the server, pins the full SHA and
  refuses to continue if `main` moved after the panel rendered. The client only
  sends the displayed SHA as a concurrency check; it can never name a branch or
  choose a different deployment target.
- Before confirmation Admin shows the pinned SHA, last production SHA, commits
  and files since production, real CI for the exact head, migration counts and
  every blocker.
- Migration reconciliation compares each repository file with
  `supabase_migrations.schema_migrations` (when present) and live
  `information_schema` objects. Applied, pending, unsafe and unknown are
  reported separately. Only ordered, provably-pending, statically-safe files
  are applied in one transaction. Destructive, security, downtime, diagnostic
  and unclassifiable files block the release; migration history is never
  written or faked.
- Release then creates or reuses an immutable preview deployment for the pinned
  SHA, promotes that exact deployment with Vercel's promote endpoint, waits for
  the deployment and production alias to report the same SHA with `READY`, and
  runs unauthenticated live smoke tests (`/api/health` must be healthy).
- Every transition (requested/running/succeeded/failed/blocked) is appended to
  the existing server-only event journal with actor, pinned SHA, previous
  production deployment, migration versions, deployment ids/URLs, smoke results
  and timestamps. Retries reuse an active release, reuse a ready preview and
  re-audit migrations, so repeated clicks are safe.
- Failure after promotion attempts a rollback to the recorded previous
  production deployment. If the previous deployment id is unknown, the exact
  rollback limitation is recorded instead of pretending the old production is
  still active.
- If `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, a read-only production database URL or
  the GitHub token is unavailable, the release is blocked with that exact
  blocker. There is no ad-hoc shell fallback and no `vercel --prod` from Admin.

## Dev Cost Ledger

- Before a task enters the queue a deterministic min/expected/max estimate is
  written to the additive `pierrot_dev_cost_estimates` table. Drafts show the
  same calculation as a preview; only the queued value is persisted. Assumptions
  and confidence are stored with the estimate. If the table is not applied the
  enqueue still succeeds and the immutable event journal keeps the payload.
- The estimate separates DeepSeek model cost from Codespaces compute and keeps
  the tariff version, effective date, currency and source URL. Model token
  ranges are inferred from the task text and acceptance criteria; Codespaces
  runtime includes startup and an idle buffer, and excludes queue wait, storage
  and shared account charges.
- Model token usage and reported cost come from OpenCode `step_finish` events.
  When the CLI reports tokens but omits a price, the server computes a fallback
  from the versioned DeepSeek tariff and marks it `estimated`. Without tokens or
  a matching tariff the value is `null` with a reason, never zero.
- Failed attempts keep cost too: when OpenCode already ran, its usage and
  measured runtime are sent with the failure. A failure before the model
  started is labelled `unavailable:model-not-started`. Commit/push failures
  still keep the measured Codespaces runtime.
- Each attempt records the Codespace machine, start/finish timestamps, measured
  billable duration and compute cost. GitHub billing API access is best-effort:
  when the token can read account totals they are shown separately as confirmed
  data and are never allocated to a task. Otherwise per-attempt Codespaces
  values remain estimates from the public SKU rate. Set
  `PIERROT_DEV_CODESPACE_HOURLY_USD` to override the list price.
- A total is only produced when both the model and Codespaces components are
  known. Partial totals are reported as unavailable, with an explicit
  incomplete-data note.
- The LEDGER dashboard shows estimate/actual/variance for tasks, batches and a
  selectable period (7/30/90/365 days), split by DeepSeek and Codespaces, plus
  run/retry counts and the average cost of successful tasks. Codespace session
  and idle values are shown separately and are never added to task actuals,
  because attempt runtime is already counted there.
- Startup, ready, idle, stop-request and measured-runtime timestamps are stored
  in server-only lifecycle settings and appear in the EXECUTION panel. A bounded
  session history is kept for the LEDGER dashboard.

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

| Symptom                                   | Action                                                                                                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema missing`                          | Apply the migration manually, then Re-check.                                                                                                                                                              |
| `worker offline`                          | Queueing a task should start the Codespace automatically. If it does not, check the lifecycle detail in EXECUTION, then `$HOME/.pierrot-dev-work/logs/worker.log` and `worker-boot.log`.                  |
| `OpenCode CLI missing`                    | Install/verify `opencode --version` in the Codespace.                                                                                                                                                     |
| `Stored provider authentication: missing` | Run `opencode auth login` in the Codespace.                                                                                                                                                               |
| Codespace start returns 403               | Grant the fine-grained token **Codespaces: write**.                                                                                                                                                       |
| Finalization blocked on 403               | Read the block reason: it names the endpoint and required permission. Fix the fine-grained token, redeploy, then **Retry finalization**. Automatic retry is intentionally disabled for permission errors. |
| Finalization blocked on rate limit        | The block reason contains the reset time. Wait for it (the pass resumes automatically) or use **Retry finalization** after the reset. Check `GET /rate_limit` and reduce concurrent GitHub calls.         |
| No CI checks                              | Add/verify the repository CI workflow; acceptance then requires manual confirmation.                                                                                                                      |
| Vercel `unavailable`                      | Set `VERCEL_TOKEN` (and `VERCEL_PROJECT_ID` if auto-detection fails).                                                                                                                                     |
