# Pierrot Dev executor investigation — 2026-11-20

Scope: repeated `worker.boot` errors, DeepSeek model identity, the failed Flow
attempt, PR/task reconciliation, and the status of the remaining non-terminal
tasks. This document records only evidence that is available from the public
repository, the public GitHub API and local execution. Production Supabase rows
were not read: no service-role key is available to the executor and the
execution contract forbids using one.

## 1. Repeated `worker.boot` DeepSeek Flash error

Observed event:

```
worker.boot  level=error
failed: Checking deepseek provider and model deepseek/deepseek-flash.
```

Root cause: `scripts/pierrot/dev-worker.mjs` reported the informational phase
`checking_provider`:

```js
await bootPhase(
  'checking_provider',
  `Checking ${OPENCODE_PROVIDER} provider and model ${OPENCODE_MODEL}.`
);
```

`bootPhase` coerced every phase not present in `BOOT_PHASES` to `failed`:

```js
const safePhase = BOOT_PHASES.includes(phase) ? phase : 'failed';
```

`checking_provider` was missing from the closed phase list, so the harmless
provider check was persisted as an error, and
`lib/pierrot/dev/workbench/lifecycle.ts` maps `phase === 'failed'` to
`level: 'error'`. This is a **false diagnostic**, not a fatal condition:

- the model check result is stored separately in `capabilities.modelAvailable`;
- `runActionsOnce` continues to claim/execute unless the actual model check,
  readiness or claim fails;
- this boot event does not trigger a retry or alter the claim/lease.

Fix:

- `checking_provider` is now a first-class boot phase;
- `normalizeBootPhase()` only returns `failed` for the explicit `failed`
  phase; unknown informational phases are recorded as `starting` instead of
  inventing an error;
- regression tests assert the phase list, normalization and error level.

This explains why different Actions runners repeatedly produced the same
`worker.boot` error while the same runs still claimed and executed tasks.

## 2. Preflight model vs. actual OpenCode model

Before this change the check, the invocation and cost telemetry had three
independent defaults:

| Place                                                       | Model                               |
| ----------------------------------------------------------- | ----------------------------------- |
| `.github/workflows/pierrot-actions-executor.yml`            | `deepseek/deepseek-flash`           |
| `opencode.json`                                             | `deepseek/deepseek-flash`           |
| `scripts/pierrot/actions-preflight.mjs`                     | env or `deepseek/deepseek-flash`    |
| `scripts/pierrot/dev-worker.mjs`                            | env or `deepseek/deepseek-flash`    |
| `lib/pierrot/dev/workbench/costs.ts` estimate/normalization | env or **`deepseek/deepseek-chat`** |

The execution path did pass `--model deepseek/deepseek-flash`, but the server
cost ledger fell back to `deepseek/deepseek-chat` whenever the deployment
environment did not set `PIERROT_DEV_OPENCODE_MODEL` and OpenCode did not report
a usage model. That is the source of `deepseek/deepseek-chat` in cost telemetry;
it was not proof that the executor invoked chat.

Fix:

- `lib/pierrot/dev/executorModel.json` is the single provider/model contract;
- preflight, worker and cost ledger resolve the model through it
  (`resolveConfiguredModel` / `DEV_EXECUTOR_MODEL`);
- preflight and worker both validate the exact id with `verifyConfiguredModel`
  against `opencode models`;
- a provider/model mismatch (`provider=openrouter`, `model=deepseek/...`) is a
  hard `MODEL_PROVIDER_MISMATCH` error, not a fallback;
- the worker records the configured identity and the provider-reported
  identity (`verification.modelIdentity`); a mismatch is a warning and a
  `worker.note` event;
- cost telemetry prefers the reported model, then the executor-configured
  model, and marks `modelSource` (`opencode-reported`, `executor-configured`,
  `server-configured`, `unknown`). It never silently relabels a fallback.

## 3. Flow attempt `9f1148cf-bbb2-418b-939a-5f32d704e84d`

Public evidence:

- Workflow run: <https://github.com/merkurov1/newlove/actions/runs/44688991153>
- Job: `136130003657` (`Execute one Pierrot task`, 15m 1s)
- Step `Execute task` conclusion: failure. GitHub annotation:
  `Process completed with exit code 4.` and
  `Execution failed; the attempt and diagnostics are in Supabase.`
- Worker exit code 4 = `ACTIONS_EXIT.executionFailed` (the attempt failed, the
  runner itself was healthy).
- Preserved branch head: `d6047aa59fce0349d1ca26d384299c577dbd7907`
  (`wip(dev): task 9f1148cf-... attempt 1`, 2026-11-20 06:51:19Z). The
  `wip` commit proves the worker preserved partial work after OpenCode failed.
  The job ended at 06:51:28Z, nine seconds after that commit, matching the
  failed run.
- Local verification of that branch: 62 targeted Flow/journal Jest tests passed
  and `tsc --noEmit` exited 0. The branch work is not defective and is
  recoverable.

The OpenCode child exited 1 (recorded by production as `OPENCODE_FAILED`). Its
stderr/tail was persisted in Supabase attempt diagnostics, but the public
GitHub API returns 403 for Actions log downloads without authentication, so
the exact provider message cannot be quoted from this environment. The failure
is not a repository test/type failure (the preserved branch is green). It is an
executor/provider failure after 15 minutes; disposition is **retry from the
preserved branch**, not blocked on application code.

To make the next occurrence provable without reading runner logs, the worker now
classifies OpenCode exits into stable codes (`OPENCODE_RATE_LIMITED`,
`OPENCODE_AUTH_FAILED`, `OPENCODE_PROVIDER_QUOTA`, `OPENCODE_CONTEXT_LIMIT`,
`OPENCODE_PROVIDER_UNAVAILABLE`, `OPENCODE_INTERRUPTED`, `EXECUTION_TIMEOUT`,
`OPENCODE_FAILED`) and stores a bounded, secret-scrubbed record under
`verification.opencode` (exit code, signal, duration, session id, stderr/stdout
tails, model identity).

No automatic retry was started here: the task specification says not to
interrupt the active Newsletter attempt, and the runner owns dispatch.

## 4. PR #57 and task `4011dc0e-ff8e-497f-8e53-f60fb2f73a5a`

Facts:

- PR #57 is merged; merge commit
  `cd9483543fc244118e8ea69981a71f672bbee565` is in `main`.
- The linked task was reported as `status=review`,
  `verification_status=partial`.
- `partial` maps to `verified_with_warnings` in `lib/pierrot/dev/tasks.ts`.

Two code paths could produce that inconsistent pair:

1. Queue finalization wrote the non-schema value `integration_only` to
   `verification_status`. Production rows were then left at whatever value was
   already there (for example `partial`) if the update was rejected.
2. `saveDevTaskReview()` wrote the review verdict (`partial` for
   `verified_with_warnings`) and a fresh `verified_at` while leaving
   `status=review`. An advisory review therefore looked verified without an
   owner verification.

Fix:

- `verifyTaskIntegrated()` and the new standalone reconciliation use
  `planTaskReconciliation()`;
- a merged PR with structured evidence (satisfied criteria + a passing command)
  becomes `verified` / `passed` / `verified_at`;
- a merged PR without that evidence stays `review` with
  `verification_status=not_run`, `verified_at=null` and an explicit note:
  integration is complete, owner verification is not;
- any `review` row holding `passed`/`partial`/`integration_only` or a
  `verified_at` is repaired to `not_run`; the task is not closed or archived;
- advisory reviews no longer write a verified-like status or `verified_at`;
- reconciliation runs from the bounded Admin overview pass and is independent of
  queue finalization, so merged PRs cannot remain stale merely because other
  work is queued.

Production row repair of task `4011dc0e` will happen on the next overview read
(or owner-triggered finalization) because this environment cannot write to
Supabase. The task is deliberately **not** marked verified without inspecting
its attempt criteria.

## 5. Other non-terminal tasks

- Newsletter task `6baecda8-a902-485c-bba3-a79f25bdf062` was not claimed,
  cancelled or modified by this work. PR #66 is
  `ce142113d7365fc72964b732b76a54816d1ae49e`.
- PR #56 and PR #64 are closed without merge. They remain the known
  integration blocker with priority 120; this work does not duplicate, close or
  archive those tasks. A closed-unmerged PR now produces a warning event only.
- The reconciliation planner is tested for `review`, `ready`, `queued`,
  `in_progress`, `failed` and `cancelled` rows. Only `review` rows are mutated,
  and only when a merged/closed PR or an inconsistent verification flag is
  present. No user task is archived or closed automatically.
- A read-only `auditNonTerminalTasks()` report is returned with the Admin
  overview (`consistency`). It flags `review` rows with a verified-like flag,
  `ready` rows that already have a PR, and `failed` rows with a PR link, so the
  owner can decide. None of those flags changes a task automatically.

## 6. Remaining risk

- Production Supabase rows were not inspected, so the actual repair of
  `4011dc0e` and the enumeration of every non-terminal row must be confirmed
  from Admin after deployment.
- The exact OpenCode stderr for the Flow attempt is not downloadable from the
  public API; the new diagnostics will capture it next time.
- Re-running the Flow task is an owner/dispatcher action and was not started
  while the Newsletter attempt is active.
