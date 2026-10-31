# Media Intelligence lifecycle

## What changed

Media Intelligence now has a durable analysis queue, versioned results and a
dashboard backed by the production corpus. It uses the existing
`knowledge_documents` / `knowledge_chunks` text and does not create a second
article index or a second vector store.

## Eligible publications

A media record is eligible when it has a linked `knowledge_documents` row with:

- `media_text_quality` = `full_text` or `partial_text`;
- `chunk_count > 0`;
- `ingestion_status = 'completed'`.

Records without a Brain document, metadata-only previews and blocked
publications are shown in the dashboard but are never sent to the model.

## Queue

`media_analysis_runs` is both the run history and the queue.

- `pending` → `processing` → `completed` / `failed`;
- one active run per media record (`media_analysis_runs_active_uidx`);
- `media_claim_next_analysis_run(worker_id, lease_seconds)` claims with
  `FOR UPDATE SKIP LOCKED`;
- expired leases are recovered by the same function;
- bounded `attempt` / `max_attempts` and exponential `retry_after`;
- permanent input errors (`no_chunks`, `record_not_found`, invalid input) are
  not retried.

Worker entry points:

| Endpoint | Use |
| --- | --- |
| `POST /api/admin/media/analysis/batch` | enqueue `all`, `selected` or `retry_failed` |
| `POST /api/admin/media/analysis/worker` | process a small batch |
| `POST /api/admin/media/analysis/runs/[id]` | `retry` or `cancel` a run |
| `GET/POST /api/cron/media-analysis-worker` | daily Vercel cron / external scheduler |

The admin dashboard buttons enqueue and process at most three jobs per click.
This keeps each request inside the platform function limit and avoids a large
single DeepSeek bill.

## Versioning

Every run stores:

- `content_hash` from the linked knowledge document;
- `analyzer_version` (`media-intelligence-v2`);
- model and request source.

Enqueue and direct analysis skip a record when the latest completed run has the
same content hash and analyzer version. `force` / `Force refresh` bypasses this
check explicitly.

When text changes, a new run is created. Before saving new results:

- current quotes become `is_current = false`, `verification_status = 'superseded'`;
- topics, editorial roles, relations and entities become `is_current = false`;
- historical rows stay in place.

The current quote set also has a partial unique index so a retry cannot create a
duplicate current quote position.

## Extracted data

The model returns only JSON and never writes article text back into prompts or
metadata. Results are validated and quotes must be exact substrings of the
source document.

- exact direct quotes;
- indirect quotes / paraphrases;
- mentions;
- quote context before/after;
- document character range and source chunk;
- quote type and attribution confidence;
- primary topic and subtopics;
- participants (people);
- mentioned organizations;
- Anton's editorial role and the publication interaction type;
- relation hypotheses.

Quotes that the model invents are dropped. Paraphrases remain
`indirect_quote` / `needs_review`, never `direct_quote`.

## Relations

`lib/knowledge/media/relations.ts` produces deterministic hypotheses:

- reprint / syndication by identical content hash;
- shared quotes and same story;
- same topic / subtopic;
- story continuation by outlet, topic, date and title overlap.

Relations are stored as current/unconfirmed hypotheses. The admin confirms or
rejects them per publication.

`rebuildMediaRelations()` (admin endpoint
`POST /api/admin/media/analysis/relations/rebuild`, dashboard button
**Rebuild relations**) recomputes these deterministic hypotheses from current
topics and quotes without calling DeepSeek. It supersedes only outgoing current
relations for already analyzed records and never touches documents or history.

## Dashboard

`/admin/media/intelligence` now includes:

1. overview, statuses, periods, languages and outlets;
2. Brain coverage: full / partial / blocked / missing document;
3. analysis coverage: eligible / analyzed / stale / not analyzed / queued / failed;
4. quotes, paraphrases and mentions;
5. timeline;
6. topic and subtopic clusters;
7. outlets, languages and inferred countries;
8. editorial roles and interaction types;
9. participants and organizations;
10. related publications;
11. unprocessed and failed records;
12. recent analysis runs and queue health.

Filters: date range, language, topic, outlet, publication kind and editorial
role. Each analytical row links to the original publication and to the analysis
page. Quote cards link to `#quote-<id>` and show the document character range
and source chunk.

Countries are inferred only from explicit `ai_metadata.country`, a documented
outlet mapping, or a country-code TLD. Language is never used as evidence of a
country.

## Apply

```bash
psql "$DIRECT_URL" -f migrations/2026-11-08_media_analysis_queue.sql
```

Then, with `DEEPSEEK_API_KEY` configured:

The CLI runner mirrors the dashboard controls:

```bash
# enqueue all eligible and process in small batches
npx tsx scripts/media-analysis-run.ts --enqueue-all --limit 200 --batch 3

# re-run only publications whose latest completed run has no topic
npx tsx scripts/media-analysis-run.ts --refresh-missing-topics --batch 3

# deterministic relation rebuild (no model calls)
npx tsx scripts/media-analysis-run.ts --rebuild-relations
```

```bash
# 1. enqueue all eligible publications
curl -X POST https://<host>/api/admin/media/analysis/batch \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <admin session>' \
  -d '{"mode":"all","limit":200,"run":false}'

# 2. process in small batches
curl -X POST https://<host>/api/admin/media/analysis/worker \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <admin session>' \
  -d '{"limit":3}'
```

Or use the dashboard buttons: **Analyze all eligible**, **Process queue**,
**Analyze selected**, **Retry failed**, **Force refresh**.

## Tests

```bash
npx jest lib/knowledge/media lib/analytics --runInBand
npx tsc --noEmit
```

Coverage includes queue idempotency, active-run dedupe, up-to-date skipping,
transient retry, permanent failure, migration invariants, entity extraction,
quote verification and relation derivation.
