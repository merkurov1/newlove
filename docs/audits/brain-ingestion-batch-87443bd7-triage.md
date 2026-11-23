# Brain ingestion batch `87443bd7-8af8-4bd7-86fb-5d19baf81e34` — item-level triage plan

Date: 2026-11-23
Batch: `87443bd7-8af8-4bd7-86fb-5d19baf81e34`
Owner-supplied distribution: 63 jobs, 25 completed, 34 failed, 4 partial
(38 failed/partial jobs to decide).

## Status of this workspace

This workspace has **no production database URL, Supabase service key or
OpenRouter key**. It therefore cannot read the real job rows, URLs, extraction
logs, document state or chunk rows for the 38 failed/partial jobs. No row or
credential was read, and **no production write was performed**.

To avoid inventing evidence, this document does not contain a fabricated 38-row
table. It defines the exact item-level decision engine and the reproducible
command that produces that table from the live batch. The engine is implemented
in `lib/knowledge/brain/jobTriage.ts` and is exercised by
`lib/knowledge/brain/__tests__/jobTriage.test.ts`.

## What “item-by-item” means in the report

`--triage` adds a `triage` object to the operator report. Every failed/partial
job gets one row with:

| Field                                                                        | Source                              | Purpose                                           |
| ---------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| `jobId`, `runId`, `status`, `sourceType`                                     | `brain_ingestion_jobs`              | Identity; no new job is created                   |
| `errorCode`, `errorDetail`                                                   | job row                             | Primary failure classification                    |
| `evidence.errorDebugName`, `evidence.errorDebugMessage`                      | `extraction_metadata.error_debug`   | Redacted worker log for generic failures          |
| `evidence.extractionStage`, `evidence.extractionReason`                      | `extraction_metadata`               | Last stage and reason                             |
| `evidence.extractionDiagnostics`                                             | `extraction_metadata.diagnostics`   | Paywall/truncation/word and paragraph counts      |
| `evidence.url`, `validHttpUrl`, `urlMatchesMedia`, `urlDate`                 | job + Media Archive URLs            | URL validity, redirect/date mismatch              |
| `evidence.mediaStatus`, `mediaIndexingStatus`, `mediaIndexingError`          | `media_archive_records`             | Archive state and its own error                   |
| `evidence.documentId`, `documentIngestionStatus`, `documentExtractionStatus` | `knowledge_documents`               | Whether a document exists and its ingestion state |
| `evidence.documentTextQuality`, `documentCoverageStatus`                     | `knowledge_documents`               | Whether the record may be called full text        |
| `evidence.documentChunkCount`, `actualChunkRows`                             | document + `knowledge_chunks` count | Detects missing/extra chunks                      |
| `evidence.sourceCharCount`, `contentOrigin`                                  | document                            | Confirms metadata-only vs full text               |
| `evidence.activeDuplicateJobIds`                                             | active queue rows                   | Blocks duplicate creation                         |
| `decision`, `reasonCode`, `reason`                                           | triage engine                       | One of the four allowed outcomes                  |
| `requiresExplicitApproval`                                                   | triage engine                       | Always true only for `retry_transient`            |
| `indexedAsFullText`                                                          | triage engine                       | Never true for metadata-only/blocked              |

The report also contains `groups` (same status + error code, counts, decisions),
`integrityIssues`, `retryCandidates`, `decisions` and `warnings`.

## Allowed decisions

| Decision            | Meaning                                                                                                                                                                                                     | Write?                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `retry_transient`   | Proven transient code (`fetch_timeout`, `fetch_failed`, `dns_failed`, 408/425/429/5xx, embedding timeout/rate limit, database/storage transient), retry budget left, no active duplicate, no indexed chunks | Only after approval, one explicit job id at a time |
| `manual_review`     | `ingestion_failed`, `needs_review`, unclassified/unknown codes, exhausted budget, active duplicate, embedding configuration, OCR/PDF quality, document/chunk contradiction                                  | No                                                 |
| `keep_partial`      | Existing partial text or metadata-only record is retained; metadata-only is never presented as full text; already-indexed document is not duplicated                                                        | No                                                 |
| `close_unavailable` | Access restriction, authentication, paywall, gone source, unsupported type, missing/archived Media record                                                                                                   | No                                                 |

Hard rules enforced by the engine:

- `http_status_403`, 401, 407, 451 are never retried and never bypassed.
- Paywalls (`paywall_detected`, HTTP 402) are never bypassed. Existing partial
  chunks are kept; without text the record is closed as unavailable.
- `metadata_only` keeps no chunks and is reported with `indexedAsFullText: false`.
- `partial` jobs are never retried; they stay partial unless a contradiction
  requires manual review.
- An existing document with chunks is never re-created; the job is
  `keep_partial` with reason `document_already_indexed`.
- A declared/actual chunk-count mismatch, `full_text` with zero chunks, or
  `metadata_only/blocked` with chunks is always `manual_review`.

## Commands

### 1. Read-only item triage (safe, no writes)

```bash
pnpm brain:ingestion-recovery -- \
  --run 87443bd7-8af8-4bd7-86fb-5d19baf81e34 \
  --triage \
  --report docs/audits/brain-ingestion-87443bd7-triage.json
```

This reads the batch and the whole queue and writes only the local JSON report.
The expected owner-supplied totals are `triage.scope.failed = 34`,
`triage.scope.partial = 4`, `triage.scope.analysed = 38`. If the live counts
differ, the report is authoritative; do not force the expected totals.

### 2. Review the groups before any write

Expected groups from the owner-supplied counts:

| Group                 | Expected | Required handling                                                                                                        | Auto-retry                            |
| --------------------- | -------: | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `ingestion_failed`    |       14 | Inspect `evidence.errorDebug*`, stage, URL, Media and chunk state; manual review unless the log proves a transient cause | No                                    |
| `http_status_403`     |       11 | Close as unavailable; keep metadata; do not bypass access control                                                        | No                                    |
| `metadata_only`       |        7 | Keep partial/metadata-only; never label as full text                                                                     | No                                    |
| `needs_review`        |        3 | Manual review of extraction quality                                                                                      | No                                    |
| Three single causes   |        3 | Use the exact code from `triage.groups`; apply the same decision matrix                                                  | Only if code is on the transient list |
| `partial` status rows |        4 | Keep partial unless `integrityIssues` flags a contradiction                                                              | No                                    |

The report groups by `status|errorCode`, so the exact single causes are visible
without guessing.

### 3. Approval-gated targeted retry

Only after the owner approves the specific job ids from
`triage.retryCandidates`:

```bash
pnpm brain:ingestion-recovery -- \
  --run 87443bd7-8af8-4bd7-86fb-5d19baf81e34 \
  --retry-job <approved-job-id-1> \
  --retry-job <approved-job-id-2> \
  --process \
  --max-jobs 5 \
  --max-rounds 10 \
  --report docs/audits/brain-ingestion-87443bd7-retry.json
```

`--retry-job` is repeatable, restricted to the named ids, and still runs the
same safety checks. Selecting a 403, metadata-only, needs-review or
already-indexed job is rejected and appears in `retry.rejected`; it cannot be
forced by passing the id. No job row is inserted, no Media record is created,
and no archive row is rewritten.

The existing batch-wide `--retry-safe-failed` flag remains available, but it
must **not** be used for this batch without the same owner approval; the task
explicitly forbids a mass retry.

### 4. Verify chunks and retrieval after the approved retries

The retry report already includes `triageAfter` for every remaining
failed/partial row. Check that every approved job is no longer failed, that its
document has `chunk_count > 0` and matching `actualChunkRows`, and that
metadata-only rows still have zero chunks.

Then run the existing representative retrieval probe:

```bash
pnpm brain:ingestion-recovery -- \
  --run 87443bd7-8af8-4bd7-86fb-5d19baf81e34 \
  --verify-retrieval \
  --report docs/audits/brain-ingestion-87443bd7-retrieval.json
```

Acceptance requires `retrieval.probes[*].outcome = matched` for the earliest
indexed publication and a batch-new publication. If the embedding provider is
not configured, the report says retrieval was skipped; that must not be
reported as a pass.

## Evidence mapping for the 38 jobs

| Criterion                                 | Evidence in the JSON report                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Every failed/partial job has one decision | `triage.jobs` length 38 and `triage.scope.analysed`                                       |
| Errors are grouped                        | `triage.groups`                                                                           |
| Logs were inspected                       | `triage.jobs[*].evidence.errorDebug*`, `extractionStage`, `extractionReason`              |
| URLs were checked                         | `evidence.url`, `validHttpUrl`, `urlMatchesMedia`, `urlDate`                              |
| Document and chunk state were checked     | `evidence.documentId`, `documentIngestionStatus`, `documentChunkCount`, `actualChunkRows` |
| Retry only for proven transient errors    | `triage.retryCandidates`; every other row is not retryable                                |
| No access/paywall bypass                  | `decision = close_unavailable` for 401/402/403/407/451 and paywalls                       |
| No metadata-only presented as full text   | `indexedAsFullText: false` and `documentTextQuality = metadata_only`                      |
| No duplicates                             | `activeDuplicateJobIds`, `reason = document_already_indexed`, no new job insert           |
| Partial rows retained                     | `decision = keep_partial` with existing chunk count                                       |
| Production writes gated                   | `mode.readOnly` is true for `--triage`; retry requires explicit ids and approval          |

## Rollback

The triage run is read-only. A targeted retry only resets the selected existing
row to `queued` in place; if it fails again, the worker records the new error
under the same job id. No migration, deletion or Media Archive rewrite is part
of this plan.
