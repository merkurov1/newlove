# Temple stage integration — 2026-11-24

## Repository state inspected

- Main at attempt 3: `d8e5aa079fd7d68bc6e4229fd351254debbd72ee` (PR #109). It
  carries the executor retry/delivery/reconciliation work from PR #108 and
  PR #109, the Traces/Chronicles work from PR #104 and the merged Cast (#100)
  and Absolution (#99) redesigns.
- Traces/Chronicles source: `6d261b74ca43c23d0231427621a9cfb76e38d253` (already
  in main through PR #104; the merge tree equals that commit tree).
- Homepage/layout source: `bc232d04074d2c02f7b7755af5942fe26061d2ad` (PR #105).
  PR #105 is still open and reports `mergeable: false` / `dirty` against current
  main, so it is superseded by this integration rather than merged directly.
- Cast redesign: PR #100, merged. Absolution redesign: PR #99, merged.
- Integration branch: `pierrot/dev/cbbac557-b279-4186-a76f-4cb3d5233ea9/3`,
  based on `971f76d7` (attempt 1's snapshot). Attempt 1's tree already carries
  the PR #104 feed/page changes: `git diff main 971f76d7` is the Temple
  integration (TempleClient, layout, the scoped CSS module, integration
  evidence, one doc and one Playwright spec), not a competing fork of the feed
  work.
- Attempt 3 restored the executor/workbench, migration and documentation files
  from current main before touching Temple code, so the branch no longer
  deletes PR #108/#109 work relative to main.

## Integrated result

- One coherent Temple home keeps the owner-supplied triptych, the top-centred
  heart, open edge figures, the centred ritual menu, the in-place Tribute flow
  and the Chronicles dialog.
- The former Traces dialog-only view is now a visible `Journal` section that
  renders the same seven server-filtered rows in the first server HTML. The
  Journal sits after the Rituals and Tribute rows, directly above Chambers.
- The server page reads the bounded feed with `resolveTempleFeed`; the browser
  hook keeps the last-known-good snapshot and refreshes only on mount, TTL
  expiry, panel open, tab visibility or explicit Refresh. The 60-second cache is
  per server process, not a cross-instance shared cache.
- `/cast` is now only the language-selection landing: the unrelated
  "The Cast — Psychological Protocol" page preamble was removed, the language
  heading is the standalone page `h1` and the modal keeps an `h2` inside the
  ritual dialog. Its daylight palette now uses the Temple canvas `#f8f3ec`,
  ink `#241f1c`, muted `#786c63` and Sanctuary gold `#a98046`.
- `/absolution` keeps the Temple ritual shell (`#141210`, warm gold rules,
  cream certificate); this is the same palette as `.temple-modal__dialog`, so
  it was verified rather than re-skinned.
- No migration, production data write, secret read or competing executor was
  added. The migration and workbench files present in the tree are main's.

## Checks run locally (attempt 3)

- `pnpm typecheck` — exit 0.
- `pnpm lint` — exit 0, 0 errors (1386 pre-existing warnings).
- `pnpm test --runInBand` — 535 suites passed, 1 skipped; 3818 tests passed,
  10 skipped.
- Targeted Jest: `app/temple lib/temple hooks/useTempleFeed app/cast
  app/absolution` — 11 suites / 61 tests passed.
- `node --test scripts/pierrot/__tests__/*.test.mjs` — 53/53 passed;
  `node --check` for the executor entrypoints passed.
- `pnpm exec playwright test --config=tests/pierrot.playwright.config.ts
  tests/temple-home.spec.ts tests/cast-redesign.spec.ts
  tests/absolution-redesign.spec.ts` — 22 passed (desktop 1440×900, tablet
  768×1024, phone 390×844, small phone 320×568, Telegram WebView emulation,
  Cast/absolution ritual modals).
- `pnpm build` with build-time placeholder Supabase values — exit 0.

## Executor and release evidence

- Attempt 3 is a real claim and a real attempt: executor run
  `https://github.com/merkurov1/newlove/actions/runs/45455116560`
  (repository_dispatch, run 120) started `2026-11-24T18:02:20Z` on main
  `d8e5aa07`; the Preflight step passed and the `Execute task` step is
  `in_progress` for this attempt (worker `actions:45455116560:1`).
- Run 119 (17:20Z) and runs 117/118 (16:45Z/16:56Z) also completed `success`,
  so the executor is claiming and executing, not merely registering.
- The executor scripts pass `node --check`; `node --test` for the executor
  tests reports 53/53 pass. No competing runner implementation was added.
- Main CI run `45451257310` on `d8e5aa07` is `success`.
- Production deployment for main is still the pre-integration Temple
  composition (`Traces` before `Rituals`, no Journal hero). Production was not
  changed by this branch.

## Remaining owner action

The executor cannot merge or deploy. The owner/runner must push the attempt-3
branch, open/refresh the PR against `main` `d8e5aa07` (it must include the
current main history so the PR is not dirty), wait for required CI, then run the
normal owner-approved production release. Until then production keeps the old
Temple composition; the integrated Journal/hero and the language-only `/cast`
landing are not live yet.

Queue inspection beyond this task was not possible from inside the executor: the
worker token and Supabase queue tables are deliberately unavailable to the task
process. The claim evidence above proves dispatch for this task; the remaining
Temple queue rows must be reconciled by the runner/owner view. No queue row was
paused or re-prioritised by this change.

## Attempt-3 final branch state

- The attempt-3 branch commit `46588afe` is a merge of `971f76d7` (attempt 1)
  and main `d8e5aa07`. `git merge-tree --write-tree main HEAD` reports no
  conflict, so the PR no longer inherits the dirty state of #105/#106/#107.
- `git diff --stat main HEAD` is 28 files: the Temple home/layout/CSS, the
  language-only Temple-palette `/cast` landing, the integration Playwright
  spec, the artifact set and the two audit documents. No workbench, executor or
  migration file is deleted or reverted by the branch.

