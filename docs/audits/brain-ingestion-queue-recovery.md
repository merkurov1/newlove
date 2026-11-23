# Brain ingestion queue recovery — Media Archive batch

Date: 2026-11-22
Target batch: `87443bd7-8af8-4bd7-86fb-5d19baf81e34`
Owner-supplied context: 63 `media_coverage` jobs for newly created
`media_archive_records`; overall Brain queue around 228 jobs.

## Execution status

The recovery tooling is implemented and locally tested. **The live queue was not
processed from this workspace** because it has no production database
connection, no Supabase service key and no OpenRouter embedding key. No
production row, storage object, credential, schema or deployment was touched.

This document is a runbook plus the exact evidence format. It deliberately does
not invent completed/failed/queued counts or costs. Run the commands below with
the normal production credentials and attach the generated JSON report.

## Safety invariants

The operator command:

- never inserts a `brain_ingestion_jobs` row;
- never creates a Media Archive record;
- never deletes or rewrites `media_archive_records`;
- never deletes a document or chunk;
- only retries existing rows with `status = 'failed'`;
- leaves `partial`, `duplicate`, `completed` and `cancelled` rows untouched;
- refreshes a row only when its error code is a known transient one;
- refuses to requeue when another active job exists for the same
  `media_record_id` or normalized URL;
- does not resume a paused or cancelled run implicitly;
- processes existing rows through the same bounded `runBrainWorker()` used by
  the admin and cron endpoints;
- applies no migration.

The retry update is in place (`status = 'queued'`, attempts reset, error fields
cleared). Job identity, `run_id`, `media_record_id`, source path and document
identity are unchanged, so historical duplicate-job counts do not grow.

## Commands

All commands are run from the repository root. The script loads
`.env.local`, `.env.production.local` and `.env`, in that order, exactly like the
existing knowledge scripts.

Read-only status for the target batch and the whole queue:

```bash
pnpm brain:ingestion-recovery -- \
  --run 87443bd7-8af8-4bd7-86fb-5d19baf81e34 \
  --status
```

Item-by-item triage for every failed/partial job (URL, redacted worker log,
Media record, document and chunk state, plus one explicit decision per job):

```bash
pnpm brain:ingestion-recovery -- \
  --run 87443bd7-8af8-4bd7-86fb-5d19baf81e34 \
  --triage \
  --report docs/audits/brain-ingestion-87443bd7-triage.json
```

The batch-specific decision matrix and the approval gate for targeted retries
are in [`brain-ingestion-batch-87443bd7-triage.md`](./brain-ingestion-batch-87443bd7-triage.md).

Retry only safe failed rows in that batch, then drain existing queued work
through the normal bounded worker:

```bash
pnpm brain:ingestion-recovery -- \
  --run 87443bd7-8af8-4bd7-86fb-5d19baf81e34 \
  --retry-safe-failed \
  --process \
  --max-jobs 10 \
  --max-rounds 20 \
  --report docs/audits/brain-ingestion-87443bd7.json
```

Verify that Brain can retrieve both the earliest indexed publication and a new
publication from this batch:

```bash
pnpm brain:ingestion-recovery -- \
  --run 87443bd7-8af8-4bd7-86fb-5d19baf81e34 \
  --verify-retrieval \
  --report docs/audits/brain-ingestion-87443bd7-retrieval.json
```

If the target batch is not known, omit `--run` to report and process the whole
recoverable queue. `BRAIN_INGESTION_RUN_ID` may be set instead of `--run`.

`--process` is resumable. Each invocation handles at most `--max-jobs` rows per
round and stops on the worker time budget. Rerun it until `queue.unresolved` is
zero; a killed invocation cannot lose a claimed row because the database queue
is the checkpoint. Graph extraction is not queued by this command. Pass
`--with-graph` only when the owner explicitly wants the optional graph
enrichment, which uses the separate graph LLM budget.

## What the report contains

`queue` is the whole Brain ingestion queue; `targetRun.summary` is the batch
scope. Each summary includes:

| Field                          | Meaning                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `total`, `final`, `unresolved` | every job is accounted for; `unresolved` is exactly `queued + processing`                         |
| `status`                       | completed / duplicate / partial / failed / cancelled / queued / processing counts                 |
| `bySourceType`                 | the same split per `source_type`, including `media_coverage`                                      |
| `errors`                       | failed and partial groups by error code, with a redacted sample detail and retryability           |
| `retryPlan`                    | one row per failed job: `retry` or `skip` plus the explicit reason                                |
| `duplicateMediaJobs`           | repeated jobs for one `media_record_id` + `source_type`, with statuses and job ids                |
| `cost`                         | linked documents, source characters, chunks, estimated embedding tokens and optional USD estimate |

`before` keeps the snapshot taken before any mutation. `retry` records how many
rows were classified as safe, how many were blocked by an existing active job,
and how many were requested/reset. `processing` records each bounded worker
round. `retrieval.probes` records the earliest and newest publication probe, the
returned count and whether the expected `media_record_id` was in the top
results.

A non-zero `queue.unresolved` means the drain is not finished. A non-empty
`duplicateMediaJobs` is reported, never auto-deleted. A null
`cost.estimatedCostUsd` means the price is unknown, not zero.

### Cost inputs

The script estimates embedding tokens from `knowledge_documents.source_char_count`
at four characters per token. To turn that into USD, set a verified embedding
input price:

```bash
BRAIN_EMBEDDING_INPUT_USD_PER_MILLION=<verified price>
```

Without that value the report keeps `estimatedCostUsd: null` and still records
character, chunk and token volume. Media classification/LLM calls and retries
are outside the embedding-only estimate.

## Acceptance evidence mapping

| Criterion                                                   | Evidence to read from the generated report                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| All jobs have a final or explained status                   | `queue.total`, `queue.final`, `queue.unresolved`, `queue.unresolvedStatuses`; zero unresolved after the final drain |
| No repeated jobs per `media_record_id`/`source_type`        | `queue.duplicateMediaJobs` and `targetRun.summary.duplicateMediaJobs`                                               |
| Failed/partial errors triaged; safe failures retried        | `queue.errors`, `queue.retryPlan`, `retry.reset`, final status counts                                               |
| Brain finds early-year and new additions                    | `retrieval.probes[*].outcome = matched` for the earliest and batch-new probes                                       |
| Report shows completed/failed/partial/queued, reasons, cost | `status`, `errors`, `cost`, `bySourceType`                                                                          |

## Permanent failures left for manual review

The retry planner does not requeue access restrictions, paywalls, metadata-only
sources, missing/archived Media records, OCR-only PDFs, invalid text/PDF files,
embedding auth/payment or other generic embedding failures, parser-quality
failures or unknown error codes. Those remain in the final distribution with
their error code and recommended manual action.

## Rollback

The tooling change is repository-only. The only database mutation is the
in-place requeue of selected failed rows; completed work is never rolled back.
If a retried row fails again, the worker records the new error under the same job
id. No migration or archive write needs a rollback.
