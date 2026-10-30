# Media / RAG reconciliation report

Date: 2026-10-30
Mode: dry-run inventory + explicit `--apply`
Script: `scripts/knowledge/reconcile-media-rag.ts`
Inventory: `docs/audits/media-rag-reconciliation-inventory.csv`
Action log: `docs/audits/media-rag-reconciliation-actions.csv`
Machine-readable state: `docs/audits/media-rag-reconciliation.json`

## Result

The media corpus is now defined by `knowledge_documents.media_record_id`, not by
`source_type`. Legacy `article` documents keep their original ID, text, chunks,
embeddings, metadata and timestamps. No second content store was introduced.

| Metric | Before | After |
| --- | ---: | ---: |
| `media_archive_records` | 154 | 223 |
| Media records with a knowledge document | 49 | 119 |
| Legacy `article` documents linked to media | 40 | 110 |
| `media_coverage` documents linked to media | 9 | 9 |
| Metadata-only media records | 104 | 104 |
| Searchable media publications | 45 | 115 |
| Duplicate documents per media record | 0 | 0 |
| Duplicate media canonical URLs | 0 | 0 |

Newly created media records: 69
- 22 Novaya Gazeta columns that existed only as legacy articles.
- 47 Substack publications (`kind = blog`) from the author's archive.

Newly linked legacy documents: 70
- 69 legacy articles received a new media record.
- 1 legacy article matched an existing media record by canonical URL.

No duplicate knowledge document and no duplicate media record was created.

## Matching policy

Applied in this order:

1. Exact canonical URL.
2. Exact normalized URL (scheme/tracking/trailing-slash insensitive).
3. Explicit document metadata identifier.
4. Exact normalized title + outlet + publication date.
5. Fuzzy title similarity only as a review suggestion.

Ambiguous matches were never merged automatically. Final unresolved matches: **0**.

The pre-run title/date matching was too weak because 40 legacy Novaya documents
had no date and titles ending in `— Новая газета`. Dates are now recovered from
the Novaya URL convention, and the outlet suffix is removed from media titles.
No richer metadata was overwritten: only missing dates and domain-shaped outlet
names were repaired.

## Queue and ingestion

- 53 new `media_coverage` jobs were queued in run `6436abaf-bbad-4556-adfc-7bc5fb95fe4b`.
- 47 existing queued `article` jobs were converted in place to `media_coverage`
  with their `media_record_id`, instead of downloading and embedding the same
  publication twice. The run is `55d7a343-cbe8-48e5-a324-41c933678f4f`.
- 100 publications are queued for extraction. 4 non-text records
  (`profile`, `radio`, `video`) remain bibliographic only and were not queued.
- 7 queued `article` URLs are not in the media archive yet. They will be
  reconciled after the existing article ingestion finishes, or can be imported
  through the Media admin panel.

The local `OPENROUTER_API_KEY` is invalid, so extraction/embedding cannot be
verified from this workstation. Jobs are durable and must be resumed from the
admin Brain screen after a valid key is configured. No secrets were changed.

## Corpus state

From `docs/audits/media-rag-reconciliation-inventory.csv`:

| State | Publications |
| --- | ---: |
| Indexed and searchable | 115 |
| Metadata only, queued | 100 |
| Metadata only, non-text | 4 |
| Full text, embeddings pending | 2 |
| Blocked (paywall/HTTP) | 1 |
| Extraction failed | 1 |

The two embeddings-pending documents are:
- Edizioni del Frisco, 9,299 extracted characters, 0 chunks.
- Le Temps, 1,635 extracted characters, 0 chunks.

They are **not** presented as successfully indexed.

## Retrieval verification

`media_search()` already joins `knowledge_documents` to
`media_archive_records` through `media_record_id`, so it now sees both legacy
`article` and new `media_coverage` documents.

A query seeded from a legacy article chunk returned:
- 8 fragments, all from linked legacy `article` documents.
- Outlets: Novaya Gazeta and the author's Substack.

A query seeded from a `media_coverage` chunk returned:
- 7 `media_coverage` fragments and 3 legacy `article` fragments.
- Both document generations in the same result set.

Exact title/outlet/date SQL against `media_archive_records` works for all 223
records. `media_search` remains service-role only; public access goes through
`/api/media/search`, which has rate limiting and a metadata/verified-quote
fallback when embeddings are unavailable.

Public verification with a local Next.js server:

- `GET /media` → 200, contains thematic collections, semantic search, and the
  newly linked Substack archive.
- `GET /media/record/<slug>` → 200 for a newly created Novaya record.
- `POST /api/media/search` with embeddings unavailable → 200, metadata fallback,
  `semantic:false`, no invented quotes.
- Internal search responses carry `X-Robots-Tag: noindex, nofollow`.
- No verified quotes exist in production yet, so no quote card was fabricated.

## Consumer audit

No `source_type` migration is needed. `source_type` remains `article` or
`media_coverage`; membership is decided by `media_record_id`.

Consumers checked:
- public `/media` and `/media/record/[slug]` read `media_archive_records` and
  enrich by `media_record_id`;
- `/api/media/search` calls `searchMediaIntelligence` → `media_search`;
- `/admin/media/intelligence` analytics joins documents by `media_record_id`;
- Pierrot media intent calls `retrieveMediaEvidence` → `searchMediaIntelligence`;
- `lib/knowledge/rag/mediaEvidence.ts` keeps the logical evidence label
  `media_coverage` for the UI, but retrieval is relationship-based and includes
  linked legacy articles.

No unrelated knowledge documents or manuscripts are included: `media_search`
requires a non-null `media_record_id` that exists in `media_archive_records`.

## Safety checks

- Foreign key `knowledge_documents.media_record_id → media_archive_records.id`
  exists.
- Unique index `knowledge_documents_media_record_uidx` guarantees at most one
  document per media record.
- Unique constraint `media_archive_records_canonical_url_key` prevents duplicate
  archive URLs.
- `brain_ingestion_jobs_active_media_uidx` prevents two active jobs per media
  record.
- No deletion of documents, chunks or embeddings.
- No embedding was regenerated or replaced.
- No schema, RLS or permission change was made.
- The reconciliation script is idempotent: a second dry-run reports 0 planned
  links, 0 creates, 0 enqueues, 0 conversions and 0 metadata fixes. It only
  reports the 100 already-queued publications as skipped.

## Rollback

The script never deletes data. To undo this reconciliation only:

```sql
BEGIN;

-- 1. Revert the 47 converted article jobs back to their previous type.
UPDATE public.brain_ingestion_jobs
SET source_type = 'article',
    media_record_id = NULL,
    requested_by = NULL
WHERE requested_by = 'media_reconciliation'
  AND status = 'queued';

-- 2. Cancel the 53 jobs created by the reconciliation run.
UPDATE public.brain_ingestion_jobs
SET status = 'cancelled',
    error_code = 'reconciliation_rollback',
    updated_at = now()
WHERE run_id = '6436abaf-bbad-4556-adfc-7bc5fb95fe4b'
  AND status IN ('queued', 'processing');

-- 3. Unlink documents attached by this reconciliation.
UPDATE public.knowledge_documents
SET media_record_id = NULL,
    media_outlet = NULL,
    media_kind = NULL,
    media_topic = NULL,
    media_language = NULL,
    media_published_date = NULL,
    media_archive_status = NULL,
    media_coverage_status = NULL,
    media_text_quality = NULL,
    media_coverage_method = NULL,
    media_coverage_error_code = NULL,
    media_coverage_error_detail = NULL,
    media_coverage_diagnostics = NULL,
    updated_at = now()
WHERE media_coverage_method IN ('reconciled_link', 'reconciled_create');

-- 4. Remove only media records created by this reconciliation.
DELETE FROM public.media_archive_records
WHERE ai_metadata->>'reconciled_from' = 'knowledge_documents'
  AND ai_metadata->>'reconciliation_version' = 'media-rag-reconciliation-v1'
  AND NOT EXISTS (
    SELECT 1
    FROM public.knowledge_documents d
    WHERE d.media_record_id = media_archive_records.id
  );

COMMIT;
```

Metadata normalization (removed outlet suffixes, recovered Novaya dates,
domain-shaped outlet names) is non-destructive and intentionally not reverted
by the SQL above. Restore the pre-run database snapshot if byte-for-byte
rollback of those 48 metadata fields is required.

## Reproduce

```bash
./node_modules/.bin/esbuild scripts/knowledge/reconcile-media-rag.ts \
  --bundle --platform=node --format=cjs \
  --outfile=/tmp/opencode/reconcile-media-rag.cjs \
  --alias:@=/workspaces/newlove --packages=external

# Inventory only; rolls back the transaction and writes reports.
NODE_PATH=/workspaces/newlove/node_modules node /tmp/opencode/reconcile-media-rag.cjs

# Apply, once the dry-run has been reviewed.
NODE_PATH=/workspaces/newlove/node_modules node /tmp/opencode/reconcile-media-rag.cjs --apply

# Retry publications whose previous media job failed.
NODE_PATH=/workspaces/newlove/node_modules node /tmp/opencode/reconcile-media-rag.cjs --apply --retry-failed
```
