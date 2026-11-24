# Temple stage integration — 2026-11-24

## Repository state inspected

- Main at inspection: `7fd2103679c212f9e00ab9aa2a6bb546b3b02e7d` (PR #104, merge of
  the Traces/Chronicles attempt 2).
- Traces/Chronicles source: `6d261b74ca43c23d0231427621a9cfb76e38d253` (already in
  main through PR #104; the merge tree equals that commit tree).
- Homepage/layout source: `bc232d04074d2c02f7b7755af5942fe26061d2ad` (PR #105).
  PR #105 is still open and reports `mergeable: false` / `dirty` against current
  main, so it is superseded by this integration rather than merged directly.
- Cast redesign: PR #100, merged. Absolution redesign: PR #99, merged.
- Integration branch: `pierrot/dev/cbbac557-b279-4186-a76f-4cb3d5233ea9/2`,
  based on `de93242a` with the attempt-1 snapshot committed as `971f76d7`.
  Although the commit parent precedes PR #104, the branch tree already carries
  the PR #104 feed/page changes: `git diff main 971f76d7` is 12 files
  (`TempleClient`, `layout`, the scoped CSS module, integration evidence, one
  doc and one Playwright spec), not a competing fork of the feed work.

## Integrated result

- One coherent Temple home keeps the owner-supplied triptych, the top-centred
  heart, open edge figures, the centred ritual menu, the in-place Tribute flow
  and the Chronicles dialog.
- The former Traces dialog-only view is now a visible `Journal` section that
  renders the same seven server-filtered rows in the first server HTML.
- The server page reads the bounded feed with `resolveTempleFeed`; the browser
  hook keeps the last-known-good snapshot and refreshes only on mount, TTL
  expiry, panel open, tab visibility or explicit Refresh.
- No migration, production data write, secret read or competing executor was
  added.

## Checks run locally

- `pnpm typecheck` — passed.
- `pnpm lint` — passed with 0 errors (pre-existing warnings only).
- `pnpm test --runInBand` — 532 suites / 3785 tests passed, 1 suite / 10 tests
  skipped.
- `pnpm test:pierrot` — 58 passed, 2 retried-flaky (unrelated Pierrot home
  modal timing), 0 failed.
- `pnpm exec playwright test ... tests/temple-home.spec.ts` — 4 passed.
- `pnpm exec playwright test ... tests/cast-redesign.spec.ts
  tests/absolution-redesign.spec.ts` — 18 passed.
- `pnpm build` with build-time placeholder Supabase values — passed.

## Executor and release evidence

- Attempt 2 was claimed by the repository executor. The run-local
  `actions-active-attempt.json` records task `cbbac557-b279-4186-a76f-4cb3d5233ea9`,
  attempt `6896c251-7301-4795-857e-f303fde850f5`, attempt number 2, worker
  `actions:45440755202:1`, execution `gha:45440755202:1`, started
  `2026-11-24T16:46:04Z`. This is a real claim and a real attempt, not a ready
  queue row.
- Attempt 1 ran as `45433219260` and reached the `Execute task` step after a
  successful preflight. The earlier failed run `45420141018` failed inside
  `Execute task`, not in dispatch, checkout or runner setup. No competing runner
  implementation was added; the existing `dev-worker.mjs` path is in use.
- Executor scripts pass `node --check`; `node --test` for
  `dev-worker-lib.test.mjs` and `actions-executor.test.mjs` reports 45/45 pass.
- Production deployment `8033748381` is `success` for
  `7fd2103679c212f9e00ab9aa2a6bb546b3b02e7d` (2026-11-24T16:18Z).
- Main CI run `45435367782` passed typecheck/lint/tests, Playwright, production
  build and migration apply/rollback.

## Attempt 2 verification (2026-11-24)

- Production baseline read directly at 16:46–16:50Z:
  `GET /api/temple_logs` returned seven eligible real rows (ids 794, 792, 791,
  790, 789, 788, 787) and stats `completedRituals=38`, `namedAuthors=3`,
  `vigilSparks=18`, window 30 days, no stale flag.
- Production `/temple` still serves the pre-integration composition (Traces above
  Rituals), so the Journal/hero integration is not live yet.
- Production `/cast` already serves the language-only first screen
  (English / Русский) and `/absolution` serves the ritual + certificate flow.
  Both merged redesigns are live; the art/colour evidence is in
  `artifacts/cast-redesign/` and `artifacts/absolution-redesign/`.
- Attempt-2 local checks (this branch tree):
  - `pnpm typecheck` — exit 0.
  - `pnpm lint` — exit 0, 0 errors (1386 pre-existing warnings).
  - `pnpm test --runInBand` — 532 suites / 3785 tests passed, 1 suite / 10
    tests skipped.
  - Targeted `app/temple`, `lib/temple`, `hooks/useTempleFeed`, `app/cast`,
    `app/absolution`, `app/@modal` run — 14 suites / 78 tests passed.
  - `playwright test ... temple-home cast-redesign absolution-redesign` — 22
    passed (desktop 1440×900, tablet 768×1024, phone 390×844, Telegram WebView).
  - `pnpm build` with build-time placeholder Supabase values — exit 0.

## Remaining owner action

The executor cannot commit, push, merge or deploy. The owner/runner must commit
this branch (`971f76d7` plus this verification addendum), open/refresh the PR
against `main` `7fd21036`, wait for required CI, merge, and run the normal
owner-approved production release. Until then production keeps
`7fd21036` and the integrated Journal/hero composition is not live.

Queue inspection beyond this task was not possible from inside the executor: the
worker token and Supabase queue tables are deliberately unavailable to the task
process. The claim evidence above proves dispatch for this task; other Temple
queue rows must be reconciled by the runner/owner view.
