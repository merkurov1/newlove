# Pierrot Actions Executor — audit, design, pilot and rollback

Status: implemented, pilot not yet executed against production data.
Date: 2026-11-19.
Scope: migrate Pierrot Dev execution from the long-lived GitHub Codespace to
ephemeral GitHub Actions runners **without** changing the product, the queue or
the review/merge rules. Codespaces stay available as the manual reserve.

---

## 1. Audit (before executor changes)

### 1.1 Existing execution path

| Concern              | Current implementation                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Queue and task state | `public.pierrot_dev_prompts` (Task Studio table), statuses `draft → ready → queued → in_progress → review → verified`, plus `failed`, `rejected`, `cancelled`, `archived`, `blocked` |
| Attempts / history   | `public.pierrot_dev_attempts`, one row per retry, unique `(task_id, attempt_number)`, immutable                                                                                      |
| Events               | `public.pierrot_dev_events`, append-only, dedupe key                                                                                                                                 |
| Workers              | `public.pierrot_dev_workers`, heartbeat, `current_attempt_id`, `stop_requested`                                                                                                      |
| Atomic claim         | `public.pierrot_dev_claim_next_task(TEXT, INTEGER)` — advisory lock `7340219`, `FOR UPDATE SKIP LOCKED`, partial unique index allowing at most **one active attempt system-wide**    |
| Lease recovery       | `public.pierrot_dev_reap_expired_attempts(INTEGER)` — first expiry requeues once, later expiry fails the task, idempotent per attempt                                                |
| Settings             | `public.pierrot_dev_settings` (`queue_paused`, lifecycle/finalization state)                                                                                                         |
| Worker API           | `POST /api/internal/pierrot/dev/worker` with `PIERROT_DEV_WORKER_TOKEN` (32+ chars, constant-time check)                                                                             |
| Codespace worker     | `scripts/pierrot/dev-worker.mjs` + supervisor/lifecycle shell scripts                                                                                                                |
| Commit/PR            | Worker commits only to `pierrot/dev/<task>/<attempt>`, pushes it; the server creates the PR after completion; merge/finalization stay in Admin with owner approval                   |
| CI                   | `.github/workflows/ci.yml` — typecheck, lint, Jest, production build on push/PR/dispatch                                                                                             |

Supabase is already the only source of truth for queue, statuses, locks,
attempts, events, results and PR links. The Codespace worker never receives the
Supabase service-role key; it talks only to the worker API.

### 1.2 Live-Codespace dependencies found

| Dependency            | Where                                           | Impact if runner disappears                                                                    |
| --------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Filesystem worktrees  | `$HOME/.pierrot-dev-work/work/<task>/<attempt>` | Ephemeral on Actions; safe because the committed branch and Supabase attempt are durable       |
| Local outbox          | `$HOME/.pierrot-dev-work/outbox`                | Lost on runner destruction; completion is idempotent and the lease reaper recovers the attempt |
| Push-failure records  | `$HOME/.pierrot-dev-work/push-failures`         | Diagnostic only; the failure is also sent to Supabase                                          |
| Local logs            | `$HOME/.pierrot-dev-work/logs`                  | Not needed for recovery; CI workflow logs and Supabase `log_excerpt` remain                    |
| Supervisor/PID files  | `dev-worker-start/supervisor/stop.sh`           | Codespace-only; Actions uses a single bounded process                                          |
| OpenCode stored login | `$HOME/.local/share/opencode`                   | Actions uses the `DEEPSEEK_API_KEY` repository secret instead                                  |
| `gh-gpgsign`          | Codespace helper                                | Not present on Actions; pilot uses an explicit unsigned-commit override, documented as a risk  |
| Lifecycle hooks       | `.devcontainer/devcontainer.json`               | Not used by Actions                                                                            |
| Agent scratch state   | OpenCode session DB, temporary files            | Discarded after the run by design                                                              |

### 1.3 Existing workflows reused

- `.github/workflows/ci.yml` remains the verification authority on every PR
  (typecheck, lint, Jest, production build). The executor creates a PR, so CI
  runs on the exact head commit without duplicating CI logic.
- A new `executor` job in the same CI file runs syntax checks and unit tests
  for the Actions runner scripts.
- No second queue, dispatcher daemon or polling loop was introduced.

### 1.4 Plan and required secrets/permissions (no values requested)

| Item                       | Type                           | Purpose                                                                                                                                                                                             |
| -------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEEPSEEK_API_KEY`         | GitHub repository secret       | Forwarded only to the executor/OpenCode process as `DEEPSEEK_API_KEY`                                                                                                                               |
| `PIERROT_DEV_WORKER_TOKEN` | GitHub repository secret       | Existing internal worker API credential (32+ chars)                                                                                                                                                 |
| `GITHUB_TOKEN`             | Automatic job token            | Push the per-attempt branch; `contents: write` only                                                                                                                                                 |
| `PIERROT_DEV_API_URL`      | Repository variable (optional) | Production admin origin; defaults to `https://merkurov.love`                                                                                                                                        |
| Additive SQL               | Manual owner action            | `migrations/2026-12-12_pierrot_actions_executor.sql` for targeted claim + `actions` worker kind; `migrations/2026-12-13_pierrot_actions_routing.sql` for durable routing + duplicate-dispatch guard |

No Supabase service-role key, Vercel token or production credential is given to
the Actions runner. The workflow is not triggered by `pull_request`, so fork or
untrusted PR code cannot obtain secrets.

---

## 2. Architecture

```
GitHub workflow_dispatch / repository_dispatch
        │  (task_id optional)
        ▼
Ephemeral ubuntu-latest runner
  preflight: secrets presence, OpenCode version, model, live DeepSeek call, API health
  register worker  actions:<run_id>:<run_attempt>   (kind=actions)
  claim             pierrot_dev_claim_task(task_id)  ← advisory lock + one-active guard
  start attempt     executionId=gha:<run_id>:<run_attempt>
  worktree          pierrot/dev/<task>/<attempt>
  OpenCode          deepseek/deepseek-flash, scrubbed env, existing permissions
  commit + push     attempt branch only; no PR, merge or deploy
  complete          Supabase attempt + task → review, PR created by the server
  exit              runner destroyed
```

- **One run = one task = one attempt.** No loop, no idle polling, no daemon.
- **Execution id**: the attempt UUID is the durable unique execution id and the
  lease/lock identifier. The GitHub run id (`gha:<run_id>:<run_attempt>`) is
  stored as `verification.executionId` on the attempt and in the append-only
  `attempt.running` event, so it is queryable in Supabase without a schema
  change.
- **Atomic claim**: the new `pierrot_dev_claim_task` narrows the existing claim
  to one task id and keeps the same advisory lock, worker-liveness check,
  single-active-attempt guard and `FOR UPDATE SKIP LOCKED`. Two simultaneous
  triggers can produce at most one runner with work; the other exits with code
  3 and creates no attempt, commit or PR.
- **State survives the runner**: attempts, events, statuses, summaries,
  commands, warnings and PR links are in Supabase. The committed branch
  preserves partial work. On runner loss the lease expires and the existing
  reaper performs at most one automatic requeue.
- **Idempotent completion**: `completeAttempt` returns the existing attempt when
  already completed and repairs a missing PR without creating a second one.
  Repeating `complete`/`fail` cannot duplicate commits, PRs or status changes.
- **Retries**: completion delivery is bounded to 6 attempts with backoff.
  Exit codes distinguish permanent setup errors (2), no claim (3) and
  execution failure (4). The workflow does **not** auto-retry itself. A retry is
  an owner action or the single lease-recovery retry.
- **Cancellation/timeout**: the job has a 75-minute ceiling, the executor step
  60 minutes, OpenCode 45 minutes, and the lease is renewed every 20 seconds.
  An `always()` cleanup step releases an interrupted attempt and requeues the
  task idempotently.
- **Commit/PR/review**: unchanged. The runner pushes only an attempt branch. The
  server creates a PR. Merge and production deploy still require explicit owner
  approval; no automatic merge or deploy exists in this path.

### 2.1 DeepSeek / OpenCode configuration

- Provider: `deepseek`
- Exact model id: `deepseek/deepseek-flash`
- CLI flag used by the runner: `--model deepseek/deepseek-flash`
- Repository config: `opencode.json` pins `"model": "deepseek/deepseek-flash"`
- Credential convention: OpenCode reads `DEEPSEEK_API_KEY` from the process
  environment (verified against the installed CLI). The workflow maps
  `secrets.DEEPSEEK_API_KEY` to that variable only for the preflight and
  executor steps.
- The runner forwards the key to the OpenCode child only when
  `PIERROT_DEV_ALLOW_PROVIDER_ENV=true`; Codespaces keep using their stored
  `opencode auth login` and do not need the environment key.
- Non-secret checks: `scripts/pierrot/actions-preflight.mjs` verifies the CLI
  version, that `opencode models` lists the exact model, and (by default) makes a
  tiny live call that must return `DEEPSEEK_PREFLIGHT_OK`. It prints only
  presence booleans and the model id, never the key.
- If `DEEPSEEK_API_KEY` is absent the workflow stops with setup instructions.
  There is no fallback provider or model.

---

## 3. Setup

1. **Rotate the exposed key first.** The DeepSeek key that was shared in chat
   must be treated as compromised. Revoke it in the DeepSeek dashboard and
   create a replacement. Do not paste it into this repository, Supabase, a
   workflow file, logs, artifacts, commits or PRs.
2. Add the replacement as a GitHub **repository secret** named
   `DEEPSEEK_API_KEY`:
   `Settings → Secrets and variables → Actions → New repository secret`.
3. Confirm `PIERROT_DEV_WORKER_TOKEN` exists there (same value as the deployed
   server). Optionally set repository variable `PIERROT_DEV_API_URL`.
4. Apply the additive migrations manually after review, in a maintenance window,
   in this order:
   `migrations/2026-12-12_pierrot_actions_executor.sql`, then
   `migrations/2026-12-13_pierrot_actions_routing.sql`.
   They add two RPCs/columns and widen the worker-kind check; they do not delete
   or rewrite queue rows, statuses, attempts or RLS policies. Until the 12-13
   migration is applied, dispatch fails explicitly with
   `ACTIONS_ROUTING_MIGRATION_REQUIRED`; it never falls back to Codespaces.
5. Ensure the GitHub token used by the server can create PRs (existing setup).
6. Keep the Codespace worker and its secrets untouched. Do not stop or delete
   the Codespace until the owner approves the completed pilot.

### 3.1 Dispatch

Manual pilot:

```
Actions → Pierrot Actions Executor → Run workflow
  task_id: <uuid of a queued task>   (leave empty to claim the next queued task)
  dry_run: false
  model_smoke_test: true
```

Event dispatch from a trusted dispatcher:

```json
{
  "event_type": "pierrot-dev-task",
  "client_payload": { "task_id": "<uuid>" }
}
```

Use `POST /repos/merkurov1/newlove/dispatches` with a token that has
`contents: write`. Do not dispatch from fork or untrusted PR context.

Automatic dispatch from the queue is now the standard path:

- approving/enqueuing/retrying a standalone task calls
  `POST /repos/{owner}/{repo}/dispatches` with `event_type =
pierrot-dev-task` and `client_payload.task_id` set to that exact task;
- resuming the queue or starting a batch dispatches at most one eligible task;
- Admin overview runs a bounded recovery pump (it never starts a Codespace);
- a worker completion/failure/release dispatches the next eligible task, so a
  one-run-per-task workflow can progress through the queue.

The dispatcher is server-side and request-driven; it is not a daemon inside
Actions. Before the GitHub call it atomically reserves the task
(`assigned_executor = 'actions'`, `actions_dispatch_requested_at = now`). The
database claim RPC refuses an Actions-assigned task to a Codespace worker and
requires `assigned_executor = 'codespace'` for the manual reserve. A failed
dispatch records `task.actions_dispatch_failed` plus `last_error_code` on the
task and throws; it does not emit `task.actions_dispatched` and does not start
Codespaces.

Required server permission for dispatch: the repository token must have
**Contents: write** (classic: `repo`) so `repository_dispatch` is accepted. The
workflow job itself still needs only `contents: write`.

---

## 4. Pilot plan and evidence

Pilot is **not yet executed** in this implementation environment: no production
Supabase service, worker API credential or DeepSeek secret is available here.
The runner, checks and rollback are implemented; the owner must run the pilot.

Minimum matrix (5–10 real tasks):

| #   | Task type                              | Purpose                    | Expected evidence                      |
| --- | -------------------------------------- | -------------------------- | -------------------------------------- |
| 1   | Documentation-only                     | Happy path, PR creation    | attempt `completed`, branch, PR, CI    |
| 2   | Small TS change                        | Typecheck/lint             | commands recorded, CI green            |
| 3   | UI change                              | Build + tests              | production build in CI                 |
| 4   | Data/API change                        | Tests and migration review | no auto-deploy                         |
| 5   | Deliberately complex                   | Time/cost/robustness       | bounded logs, no duplicate PR          |
| 6   | Same task triggered twice concurrently | Atomic claim               | one attempt; second exit 3             |
| 7   | Cancel during execution                | Release + requeue          | cleanup step, task queued again        |
| 8   | Kill the runner (job cancel)           | Lease recovery             | attempt timed_out, one requeue         |
| 9   | Re-dispatch after failure              | Resume/no duplicate commit | base commit preserved, one PR          |
| 10  | Re-run completion callback             | Idempotency                | one commit, one PR, one terminal state |

For each run record:

- task id, attempt id, execution id, worker id, run URL;
- start/end time and wall-clock duration;
- result: completed / failed / cancelled / timed_out;
- commit SHA and PR URL (or `none`);
- CI conclusion on the PR head;
- model usage/cost from Supabase attempt verification;
- duplicate check: count of attempts, PRs and completion events per task;
- comparison with the same class of Codespace attempt (success, time, cost,
  log quality, recovery).

Do not mark the pilot green in Admin acceptance until CI has actually passed
and the owner has reviewed the PR.

### 4.1 Local checks already run for this change

See the final execution evidence JSON. Real pilot rows cannot be fabricated.

---

## 5. Rollback to Codespaces

The migration and workflow are independent of the Codespace path.

1. In GitHub: disable **Pierrot Actions Executor** (`Actions → workflow →
Disable workflow`) or stop dispatching `pierrot-dev-task`. No code revert is
   required to stop new Actions runs.
2. Do **not** delete the Codespace or its secrets. It remains the reserve
   executor and can resume the same Supabase queue.
3. Tasks already claimed by an Actions run: let the run finish, or cancel it.
   The cleanup step releases the attempt and requeues the task. If the runner is
   gone, the lease reaper returns the task to the queue after at most one
   automatic retry.
4. If the additive migration must be reverted, drop only the new RPC and
   restore the previous kind check **after** confirming no `actions` worker rows
   remain. Queue and attempt history are untouched. Do not drop tables.
5. Resume Codespaces by starting the existing Codespace; `postStartCommand`
   starts the existing supervisor/worker. Because Actions is now the standard
   executor, explicitly assign work to the reserve before it can be claimed:
   `UPDATE public.pierrot_dev_prompts SET assigned_executor = 'codespace',
actions_dispatch_requested_at = NULL WHERE id = '<task-uuid>';`
   No queue migration or data copy is needed.

Rollback loses no tasks, attempts, events, commits or PR links.

---

## 6. Security notes and residual risks

- Workflow triggers: `workflow_dispatch` and `repository_dispatch` only. No
  `pull_request`/`pull_request_target`. Secrets are unavailable to forks.
- Permissions: `contents: write` only. No `pull-requests`, `packages`,
  `id-token`, `deployments` or `actions` write.
- OpenCode runs with the existing deny rules: no `git push`, `git merge`, `gh`,
  `vercel`, `supabase`, `env`, credential files or external directories. The
  runner owns commit/push. Merge/deploy are impossible from the executor.
- The provider key is not written to disk by the executor, not placed in argv,
  and redacted from worker logs. The preflight prints only presence booleans.
- **GitHub token scope**: the job uses the automatic `GITHUB_TOKEN` with
  `contents: write`; checkout does not persist it in `.git/config`. Pushes made
  with `GITHUB_TOKEN` do not trigger additional workflow runs. The first PR is
  created by the server token, so PR CI runs normally; if a retry adds commits
  to an existing PR and CI-on-synchronize is required, configure a fine-grained
  `PIERROT_DEV_PUSH_TOKEN` (contents: write) and map it to `GITHUB_TOKEN` for
  the executor step. This is a documented residual risk, not a silent default.
- **Unsigned commits**: Actions has no `gh-gpgsign`. The pilot defaults
  `PIERROT_DEV_ALLOW_UNSIGNED_COMMITS` to `true` (repository variable may set it
  to `false`), which is logged as a warning and recorded on the attempt. If the
  repository ruleset requires signed commits, configure a signing key or keep
  using Codespaces until signing is added.
- **Single active attempt**: the existing database guarantee deliberately
  allows one executor at a time. Parallel Actions runners for different tasks
  would require a separate, reviewed change to that constraint; this task does
  not relax it.
- **Third-party action supply chain**: only official `actions/*` and
  `pnpm/action-setup` are used. Pin/upgrade policy is unchanged from CI.
