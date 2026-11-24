# Pierrot PR reconciliation — #105, #106, #107 (2026-11-24)

Status: **analysis complete, merge blocked by missing GitHub write access in the
execution sandbox.** No PR was merged, closed, force-pushed or deployed by this
run. The executor lifecycle was hardened in the same change so the server path
can perform this reconciliation safely when it has the required token.

## Evidence inspected

| PR  | Head SHA                                   | Head branch                                          | Task                                   | Attempt |
| --- | ------------------------------------------ | ---------------------------------------------------- | -------------------------------------- | ------- |
| 105 | `bc232d04074d2c02f7b7755af5942fe26061d2ad` | `pierrot/dev/9b5d0c55-2ccb-4625-849e-6f27290fd93a/2` | `9b5d0c55-2ccb-4625-849e-6f27290fd93a` | 2       |
| 106 | `9c3a02761b01cd94641cdcfdffdabe527d042c66` | `pierrot/dev/cbbac557-b279-4186-a76f-4cb3d5233ea9/2` | `cbbac557-b279-4186-a76f-4cb3d5233ea9` | 2       |
| 107 | `971f76d777285f561747a65a670dc6ea7a1a7e32` | `pierrot/dev/cbbac557-b279-4186-a76f-4cb3d5233ea9/1` | `cbbac557-b279-4186-a76f-4cb3d5233ea9` | 1       |

Current `main` at inspection: `7cb51caafd0f4c1db028586a0cacdb4dab68a4b5`.

The PR heads were read with `git ls-remote` and fetched as read-only refs. No
write, merge or branch update was performed.

## Authoritative Temple work

- **PR #106 is authoritative for task `cbbac557…`.** It is attempt 2 and
  contains the Temple feed/stage integration plus the Temple home assets/CSS and
  Playwright coverage. **PR #107 is its attempt-1 predecessor** and is
  superseded by attempt 2.
- **PR #105 is authoritative for task `9b5d0c55…`.** It is attempt 2 of a
  separate Temple-home task; attempt 1 already landed in `main` via PR #103.
  Its unique work (home triptych assets, Temple home CSS, trace layout) must be
  preserved; it is not the same task as #106/#107.
- Neither #105 nor #106 is a strict ancestor of the other. #106 already carries
  the shared `lib/temple/homeAssets.ts` and Temple home CSS that #105 also adds,
  but #105 contains additional trace-view behaviour. They must therefore be
  reconciled as two tasks, not silently collapsed into one.

## Conflict evidence against current main

`git merge-tree --write-tree origin/main <pr>` (read-only) reports conflicts in:

- **#105** — `app/temple/TempleClient.tsx`,
  `app/temple/__tests__/TempleClient.test.tsx`, `app/temple/layout.tsx` (and
  further hunks in `page.tsx`/CSS).
- **#106** — `app/temple/TempleClient.tsx`,
  `docs/audits/temple-feed-metrics-2026-11-24.md`.

Both branches predate current `main` (`#108` and the earlier Temple feed work
landed afterwards). They require a non-destructive merge of current `main` into
their head branches before CI can pass.

## Required sequence when write access is available

1. Re-read each PR's exact head/base SHA; never use a cached SHA.
2. For each task keep exactly one authoritative PR:
   - `cbbac557…` → #106; close #107 only after proving attempt-2 supersession
     (already established by the immutable attempt number).
   - `9b5d0c55…` → #105.
3. Non-destructively merge `main` into each authoritative PR head. Never force
   push. Resolve real conflicts in a reviewed commit if GitHub reports 409.
4. Wait for CI on the resulting exact head SHA (typecheck, lint, Jest,
   production build, Playwright, executor checks, migration check).
5. Merge only green PRs. Expected target files: Temple client/page/layout,
   `temple-home.module.css`, `lib/temple/homeAssets.ts`, Temple tests,
   feed hooks/audit docs and Temple screenshots.
6. Observe the Vercel production deployment read-only; verify it serves the
   exact landed merge commit and smoke-check `/temple`.
7. Record PR head/base, merge SHA, check runs and deployment evidence in
   Supabase. Do not mark a task verified on PR existence or merge alone.

## Exact blocker in this sandbox

- The execution contract forbids `push`, PR creation/merge/close and deployment;
  the runner owns git and PR writes.
- No `GITHUB_TOKEN`/GitHub App token with **Contents: write** and **Pull
  requests: write** is available to this sandbox. `gh`/GitHub API writes are
  denied, so merges, branch synchronisation and closing #107 cannot be executed
  here.
- Reading CI needs **Checks: read**; merging/synchronising branches needs
  **Contents: write**; creating/updating/closing PRs needs **Pull requests:
  write**.
- Production verification needs a read-only Vercel token (`VERCEL_TOKEN`, and
  `VERCEL_PROJECT_ID` if auto-detection fails). Without it the new lifecycle
  intentionally blocks with `PRODUCTION_VERIFICATION_UNAVAILABLE` instead of
  claiming delivery.

No merge/deployment state was fabricated. The code change in this branch makes
the same reconciliation idempotent and safe when the server/runner has the
permissions above.
