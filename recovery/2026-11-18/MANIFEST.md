# Pierrot Dev recovery archive — 2026-11-18

This tag preserves work that was not on `main` before the repository was
consolidated. It is an archive, not a release, and it is intentionally not
merged into `main`.

## Repository consolidation

- Before: 22 local branches and 28 remote branches.
- After: `main` only. The active worker attempt branch is temporary.
- Every removed remote branch was first archived as an immutable tag:
  `archive/remote/<sha12>-<branch>`.
- The rejected PR #31 branch was archived as
  `archive/rejected/e99e136a-39f6-4fd1-ab2b-751626d3afa8/1`.
  It was not merged and its task remains rejected.

## Preserved attempt work

Each entry is a local tag and a patch in this archive. The commits are
recovery snapshots; they were not treated as completed tasks.

| Task | Attempt | Recovery tag | Commit |
| --- | --- | --- | --- |
| 1eee5a4b-e6a1-428c-9435-256441f0393b | 2 | `archive/recovery/1eee5a4b-e6a1-428c-9435-256441f0393b/2` | 0d7bc4b8fb3b73246192f8331a0fec85add7f0b5 |
| 2a8e80ac-92e4-4141-84ea-181bf3c3fd24 | 1 | `archive/recovery/2a8e80ac-92e4-4141-84ea-181bf3c3fd24/1` | 7dca87f34bef1c5a2669fc45be73cb5c42e79739 |
| 2a8e80ac-92e4-4141-84ea-181bf3c3fd24 | 2 | `archive/recovery/2a8e80ac-92e4-4141-84ea-181bf3c3fd24/2` | 5b68729f1b590772f054c36c34556d9437b84ace |
| 2a8e80ac-92e4-4141-84ea-181bf3c3fd24 | 3 | `archive/recovery/2a8e80ac-92e4-4141-84ea-181bf3c3fd24/3` | 29d2cf3e218d79bd44602e7707e406fc6757217c |
| 85a7c112-2e86-4ce6-9b98-b3724348cfce | 1 | `archive/recovery/85a7c112-2e86-4ce6-9b98-b3724348cfce/1` | 48b6d7bdca8c77e3083421c1f99aa915160bb6cf |
| 85a7c112-2e86-4ce6-9b98-b3724348cfce | 2 | `archive/recovery/85a7c112-2e86-4ce6-9b98-b3724348cfce/2` | e1db4cbef8085bf7e4d2177677895af19565db14 |
| 97c1a834-49dd-4ca1-825a-69f6919f477a | 1 | `archive/recovery/97c1a834-49dd-4ca1-825a-69f6919f477a/1` | 1f3a616cbe3fefa010613c3bf9e674fdfa2ea8d1 |
| ee3c1f42-ff52-4707-bc9a-203839590d83 | 1 | `archive/recovery/ee3c1f42-ff52-4707-bc9a-203839590d83/1` | dee12663abbee6cf84c348a43f5f6ec3d521adcc |

## Database reconciliation

- `97c1a834-49dd-4ca1-825a-69f6919f477a` (PR #27): corrected from
  `rejected` to `verified` after GitHub confirmed merge
  `29084e83b138346842d67ed8de0c3617217a9634` and successful required checks.
- `1eee5a4b-e6a1-428c-9435-256441f0393b` (PR #29): corrected from `review`
  to `verified` after GitHub confirmed merge
  `a182a0b4ead3ab8e2df8372f29b3796e0e55bb1d` and successful required checks.
- Historical events were preserved. Each correction added a `task.reconciled`
  event with the previous status and the evidence.

## Root cause of the regression

The review endpoint used `task.result_commit` as the diff head. After a PR was
merged, that field held the merge commit, which is already contained in
`main`. `main...merge_commit` is empty, so the review produced a false
"no changed files" verdict and `saveDevTaskReview` persisted `rejected`.
Opening a merged task in Admin was therefore destructive. The fix makes review
advisory and read-only for terminal states, and reads the merged PR's own head
and files.
