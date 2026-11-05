# Pierrot Dev Mode — Operational Investigation Fix

**Date:** 5 November 2026
**Repository:** `merkurov1/newlove`
**Scope:** repository investigation, provider deadlines/fallback, structured diagnosis and Task Studio hand-off.

---

## 1. What the saved traces showed

Production request traces confirmed all three reported failure modes:

- A Memory-timestamp task ran **22 tool calls** and ended at **~90.15 s** with
  `DEV_PROVIDER_FAILED` / `Request was aborted.` The trace proved that useful
  repository evidence had already been collected when the provider died.
- The Flow preview request completed after **~84.8 s** and **20 tool calls**, but
  the answer stayed at the level of possible causes instead of a confirmed path.
- The prompts and tool results were large, the model budget was broad by default,
  and the fallback provider could start only after most of the shared deadline
  had already been spent.

## 2. Root causes

1. `lib/pierrot/dev/prompt.ts` asked for a whole-system technical dossier while
   also forbidding code changes and describing a broad audit workflow. A narrow
   bug request therefore became an open-ended investigation.
2. The default tool budget was 16 calls with 24k/80k result caps. Repeated
   searches and whole-file reads were cheaper than stopping at sufficient
   evidence.
3. OpenAI abort variants were untyped and surfaced as ordinary provider
   failures. The fallback loop could not distinguish a user abort, a provider
   outage and the global deadline.
4. No part of the deadline was reserved before the first provider started, so a
   late failure left no useful fallback window.
5. After successful read-only tool calls, the fallback provider replayed the
   investigation from scratch instead of preserving the collected evidence.
6. The final answer had no structured diagnosis. Task Studio could only copy a
   conversation into a generic task, so it had no verified file list, findings
   or confidence level.
7. The UI did not state whether GitHub access existed before submitting a
   request, and it had no compact diagnosis/evidence surface.

## 3. Files changed

- `lib/pierrot/dev/prompt.ts`
  - replaced the dossier workflow with a narrow 4–8-call investigation flow;
  - explicit evidence standard: repository, ref, commit SHA, paths, ranges,
    current behaviour, cause, confidence, missing runtime evidence;
  - no path requests when search/tree tools exist;
  - one `<DEV_DIAGNOSIS>` machine-readable block for investigations and tasks.
- `lib/pierrot/dev/diagnosis.ts` *(new)*
  - parses and strips the diagnosis block;
  - validates files and line ranges against the actual tool trace;
  - sanitizes invented line references;
  - converts a validated diagnosis into a draft Task Studio input.
- `lib/pierrot/dev/llm.ts`
  - default budget reduced to 10 calls; result caps reduced to 18k/64k;
  - identical repeated tool calls are skipped;
  - abort/deadline errors are explicit;
  - fallback window is reserved before the first provider;
  - no fallback after a user abort or after any successful repository evidence;
  - labelled partial result with preserved trace when a provider fails after
    useful evidence.
- `lib/pierrot/dev/types.ts`
  - diagnosis types;
  - trace path/range metadata;
  - diagnosis on model results and events.
- `lib/pierrot/dev/tools.ts`
  - records the paths and line ranges actually returned by read/search tools.
- `lib/pierrot/dev/requests.ts`
  - persists the validated diagnosis in the existing `events` jsonb array;
  - no new table or column.
- `lib/pierrot/dev/store.ts`
  - reloads the diagnosis with the saved request trace.
- `lib/pierrot/dev/tasks.ts`
  - normalizes the repository key to the `owner/repo` value required by the
    production Task Studio CHECK constraint;
  - preserves decision IDs on task records.
- `app/api/admin/pierrot/dev/route.ts`
  - refuses to call the model when GitHub access is missing;
  - passes the active repository to the model;
  - returns and persists the diagnosis;
  - returns partial traces and useful error detail on failure.
- `components/pierrot/workspace/DevWorkspace.tsx`
  - first-use examples and selected repository/access facts;
  - connecting/searching/reading/analysing/preparing progress states;
  - compact expandable diagnosis card;
  - preserves failure traces in the transcript.
- `components/pierrot/workspace/DevTaskStudio.tsx`
  - creates a draft from the validated diagnosis;
  - prefills verified files, findings, plan, tests, risks and unverified items;
  - retains the originating Dev conversation ID;
  - keeps the owner review/edit step before saving.
- `app/admin/pierrot/(workspace)/workspace.css`
  - restrained diagnosis and first-use styles.
- Tests:
  - `lib/pierrot/dev/__tests__/llm.test.ts`
  - `lib/pierrot/dev/__tests__/diagnosis.test.ts` *(new)*
  - `lib/pierrot/dev/__tests__/security.test.ts`
  - `lib/pierrot/dev/__tests__/tasks.test.ts`
  - `lib/pierrot/dev/__tests__/requests.test.ts`
  - `app/api/admin/pierrot/dev/__tests__/route.test.ts` *(new)*

## 4. Behaviour fixed

- A normal request starts with repository metadata, searches first, reads a
  small set of files and stops when evidence is sufficient.
- The model is told not to perform a project audit unless asked, not to request
  paths, and not to answer code questions with generic checklists.
- Every diagnosis cites the repository/ref/commit and only paths that were
  actually returned by tools.
- Invented files and unsupported line numbers are removed before display or
  Task Studio.
- Confirmed findings, likely findings and hypotheses are separate.
- Provider aborts and deadline exhaustion are explicit; no fallback after a user
  abort; no fallback after useful evidence.
- A provider failure after evidence returns a labelled partial result with the
  real trace instead of an empty answer or a replay.
- Task Studio can create a reviewable draft directly from the diagnosis; the
  owner still edits and saves it.
- Missing GitHub access is reported before model execution.
- Dev Mode remains owner-only and read-only.

## 5. Verification

Run on the working tree:

```bash
npx jest lib/pierrot/dev app/api/admin/pierrot/dev app/api/pierrot-web \
  --runInBand --forceExit
```

- 10 suites passed
- 163 tests passed
- 0 failed

Broader run:

```bash
npx jest lib/pierrot app/api/pierrot-web app/api/admin/pierrot/dev \
  --runInBand --forceExit
```

- 70 suites passed
- 675 tests passed
- 0 failed

Typecheck:

- a targeted `tsc` project covering the changed Dev route, components and
  modules passes;
- a later repo-wide `npx tsc --noEmit --incremental` was blocked by unrelated
  parallel work in `lib/pierrot/skills/analysis/collect.ts`, not by the files in
  this change.

Lint:

- `npm run lint` still fails on repository-wide pre-existing debt.
- The modified Dev components only show the project-wide
  `react/react-in-jsx-scope` rule; no new logic lint errors were reported.
- No new lint errors were reported in the modified Dev server modules.

Production build:

- `npm run build` was attempted. The process exited with code 0, but under the
  concurrent workspace load it did not emit the final Next.js compilation
  summary or write `.next/BUILD_ID`. The build is therefore **not counted as
  verified** in this report.

## 6. Migration

**No new database migration is required for this change.**

- The diagnosis is stored in the existing `pierrot_dev_requests.events` jsonb
  array.
- No table, column, RPC or production schema change was introduced or applied.
- Production `pierrot_dev_prompts.repository_check` requires `owner/repo`.
  Task creation therefore normalizes the short repository key to the full name
  at the persistence boundary.
- Production `pierrot_dev_prompts.status_check` currently allows
  `draft/ready/used/verified/failed`. Creating a draft from a diagnosis works.
  Moving tasks to `in_progress`, `review`, `rejected` or `archived` still needs
  the existing prepared additive status-constraint migration, which was **not**
  applied by this work.

## 7. Limitations

- GitHub source can prove code paths and static behaviour. It cannot prove
  production latency, browser cache state, remote image availability or
  database contents unless a tool actually returned that evidence.
- The saved Flow preview request was reviewed at trace level, not re-run against
  live production data or browser profiling. The fix makes the next run produce
  a validated diagnosis when the available source evidence supports one.
- Dev Mode still does not write code, create branches, commit or open PRs.
  OpenCode remains the implementation environment.
- The first-use experience is text and status based; no dashboard or onboarding
  wizard was added.
