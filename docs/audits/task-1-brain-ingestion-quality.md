# Task 1 — Brain Ingestion Quality & Document Normalization

**Status:** implemented locally. No production jobs were deleted or reset. No production data was modified by this change.

## 1. What changed

### Extraction (`lib/knowledge/brain/extract.ts`)

- Added site profiles for:
  - `novayagazeta.ru` / `novayagazeta.eu`
  - `*.substack.com`
  - generic article pages
- Added Novaya-specific content roots and interface-noise removal.
- Added Substack content roots (`.available-content`, `.post-content`, `.body.markup`) and removal of subscription/share/post-footer widgets.
- Expanded generic noise selectors for cookie notices, ads, related/recommended widgets, share/social controls, paywalls, newsletter prompts, author interfaces, breadcrumbs, tags and hidden elements.
- Added text-level boilerplate filtering for repeated interface labels (`No posts`, `Subscribe`, `Read more`, `Share`, `Читайте также`, `Поделиться`, etc.).
- Preserved paragraph, heading, list and quotation blocks. Quotations remain prefixed with `>`, lists with `•`.
- Added source-domain detection and Novaya URL-date recovery.
- Added a JSON-LD `articleBody` fallback for pages without usable article markup.
- The separate UNFRAMED manuscript parser (`lib/knowledge/unframed.ts`) is unchanged; its existing long-form chunking contract remains intact.
- Added extraction metrics: body chars, selected chars, word count, paragraph count, heading count, link density, boilerplate chars/count/ratio, truncation flag and completeness.
- Added explicit statuses:
  - `complete`
  - `partial`
  - `failed`
  - `needs_review`
- Bumped the extraction contract to `brain-article-extractor-v2`.
- A `needs_review` result is not indexed automatically. At the job level it is
  stored as `status = 'partial'` with `extraction_status = 'needs_review'` and
  `error_code = 'needs_review'`, so the existing queue contract does not need a
  new job-status value.

### Chunking (`lib/knowledge/brain/chunk.ts`)

- Bumped parser/chunker/ingestion versions to v2.
- Changed grouping into logical units:
  - a quotation stays with the preceding paragraph when it fits;
  - consecutive list items stay together;
  - headings continue to define section boundaries.
- Oversized units are still split at sentence/space boundaries with overlap; paragraphs are not pre-split unless they exceed the 2,400-character limit.
- Each chunk now stores existing-schema `metadata`:
  ```json
  {
    "section": "Article title / Section heading",
    "source_type": "article",
    "source_domain": "novayagazeta.ru",
    "language": "ru",
    "publication_date": "2025-04-26T00:00:00.000Z",
    "extraction_version": "brain-article-extractor-v2",
    "chunker_version": "brain-article-chunker-v2"
  }
  ```
  No new chunk columns were required; `knowledge_chunks.metadata` already exists.

### Ingestion (`lib/knowledge/brain/process.ts`, `store.ts`)

- A known URL is now re-fetched. The extractor compares the new content hash with the stored hash.
- Identical content under the same URL: job becomes `duplicate`, no document write.
- Changed content under the same logical URL: the **same document id** is updated, chunks are re-created, stale chunks are deleted, and the document returns to `completed`.
- Identical content found under a different URL: job becomes `duplicate` and links to the existing logical document.
- A partial/failed/needs-review extraction never overwrites an existing completed document. The existing document id is retained on the job for operator visibility, with `existing_document_preserved: true`.
- Article chunk cleanup is now explicit through `deleteArticleChunksExcept`.
- Job `extraction_metadata` records:
  - `stage` (`fetching`, `extracting`, `validating`, `embedding`, `storing`, `done`, `failed`, `queued`)
  - `chunks`
  - `change` (`inserted` / `updated`)
  - `previous_content_hash`
  - `duplicate_reason`
  - `reason`
  - `existing_document_preserved`
  - extraction diagnostics and all version identifiers.
- Job `extraction_status` stores the new status directly.
- `completeArticleDocument` now receives the actual extraction status instead of hard-coding `ok`.

### Metadata normalization

Written to existing `knowledge_documents` columns where possible:

| Value              | Storage                                                           |
| ------------------ | ----------------------------------------------------------------- |
| canonical URL      | `canonical_url`                                                   |
| normalized URL     | `normalized_url`                                                  |
| source domain      | `metadata.source_domain` and chunk metadata                       |
| source type        | `source_type = 'article'`                                         |
| language           | `language` + metadata                                             |
| author             | `author`                                                          |
| publication date   | `published_at`                                                    |
| date source        | `metadata.published_at_source` (`metadata`, `jsonld`, `url_path`) |
| document title     | `title`                                                           |
| extraction version | `metadata.extraction_version`                                     |
| parser version     | `parser_version`                                                  |
| chunker version    | `chunker_version`                                                 |
| ingestion version  | `ingestion_version`                                               |

Novaya Gazeta date recovery only accepts a real `/YYYY/MM/DD/` calendar date on `novayagazeta.ru` / `novayagazeta.eu`. No date is inferred for other domains or malformed dates.

### Admin import (`app/admin/brain/BrainIngestionClient.tsx`, Brain routes)

- The queue table now shows:
  - queue position,
  - current stage,
  - extraction status,
  - chunk count,
  - job status,
  - attempts,
  - error/detail,
  - per-job Retry.
- Added a **Recheck existing URLs** option. Without it, existing URLs are skipped as before. With it, existing URLs are queued so changed content can update the logical document.
- Added a **Continue run** action for an interrupted `running` run.
- Added per-job retry endpoint:
  `POST /api/admin/brain/jobs/[id]/retry`
- Per-job retry only accepts `failed`, `partial` or `duplicate` jobs and never deletes the document or chunks.
- The existing global “Retry failed” action remains.
- Processing stays sequential: one article per request. Large batches remain resumable through Recent runs / Continue run.

### Recovery

- Existing stuck `processing` jobs are reclaimed by the existing `reclaimStaleJobs` path when the run is continued.
- The resume endpoint now accepts a run that is already `running` (for continuation) as well as `paused`.
- Pause/resume now return the actual persisted run status instead of a synthetic status.
- No production job was automatically reset or deleted by this implementation.
- Operators can safely:
  - open a recent run and press **Continue run**;
  - retry one failed/partial/duplicate job with the row action;
  - use the global retry for all failed/partial jobs in a run.

## 2. Extraction status rules

A result is `failed` when there is no usable text, fewer than 20 words, or fewer than 120 characters. A paywalled/truncated page with no usable text is `partial` instead.

A result is `partial` when any of these is true:

- paywall or truncation marker detected,
- fewer than 120 words,
- fewer than 2 content blocks,
- fewer than 600 characters,
- link density above 0.35.

A result is `needs_review` when it is otherwise long enough but structurally weak:

- completeness below 0.8,
- boilerplate ratio above 0.65,
- no headings and fewer than 400 words.

Otherwise it is `complete`.

The completeness score combines word count, paragraph count, heading presence, title/date presence, link density, boilerplate ratio and paywall/truncation penalties. It is a heuristic, not a claim of perfect extraction.

## 3. Duplicate and change rules

Resolution order after a successful fetch/extract:

1. Find by normalized URL.
2. Find by canonical URL.
3. Compare content hash with the existing logical document.
4. Find by content hash across other articles.

Results:

| Situation                                    | Result                                                        |
| -------------------------------------------- | ------------------------------------------------------------- |
| Same URL, same hash, existing completed      | `duplicate`; no writes                                        |
| Same URL, different hash, existing completed | update same document, re-chunk, re-embed, delete stale chunks |
| Same URL, existing not completed             | resume/update same document                                   |
| Different URL, same content hash             | `duplicate`; link to existing document                        |
| New content                                  | insert new document                                           |
| Partial/failed/needs-review extraction       | no document write; existing good document preserved           |

`knowledge_documents.metadata.change` and `previous_content_hash` record the update. The existing schema has no document-version table, so full historical text is not retained; the previous content hash and previous job metadata are the available audit trail.

## 4. Migration

Added `migrations/2026-10-30_normalize_brain_extraction_status.sql`.

It is non-destructive and idempotent:

- normalizes legacy `ok` to `complete` for article documents,
- normalizes legacy `ok` to `complete` for ingestion jobs,
- documents the new status values.

No new columns are required: `knowledge_chunks.metadata`, `knowledge_documents.metadata` and `brain_ingestion_jobs.extraction_metadata` already exist.

## 5. Tests

Added/updated:

- `lib/knowledge/brain/__tests__/extract.test.ts`
  - complete extraction and structure
  - boilerplate removal
  - paywall/partial status
  - Novaya date recovery from URL
  - Substack content-root extraction
  - needs_review status
  - no date guessing
- `lib/knowledge/brain/__tests__/url.test.ts`
  - source-domain normalization
  - Novaya host/date validation
- `lib/knowledge/brain/__tests__/chunk.test.ts`
  - chunk metadata
  - quotation/context grouping
- `lib/knowledge/brain/__tests__/process.test.ts`
  - new document insert
  - unchanged duplicate
  - changed content updates same document
  - partial extraction preserves an existing good document
  - needs_review does not index
  - transient embedding retry
- `app/api/admin/brain/__tests__/route.test.ts`
  - existing URLs skipped by default
  - `recheckExisting` queues changed-article checks
  - unauthenticated rejection
- `app/api/admin/brain/jobs/[id]/retry/__tests__/route.test.ts`
  - failed job requeued without deleting a document
  - unauthenticated rejection
- `lib/pierrot/__tests__/migration.test.ts`
  - asserts the extraction-status migration is non-destructive.

Run:

```bash
npx jest lib/knowledge/brain app/api/admin/brain --runInBand
npx tsc --noEmit
```

## 6. Recovery notes for the existing production queue

At the Task 0 audit snapshot (`2026-10-30T06:36:44Z`) the queue contained:

- 2 `running` runs with 39 queued jobs;
- 1 `partial` job (`word_count_below_threshold`);
- 0 failed jobs;
- 76 completed jobs.

No job was automatically reset or deleted by this implementation. Safe recovery:

1. Open the run in **Admin → Brain ingestion**.
2. Press **Continue run**; the worker calls `reclaimStaleJobs` before claiming and will requeue only `processing` jobs older than 900 seconds.
3. Review `partial` / `needs_review` rows. Use the row-level **Retry** only after deciding that re-fetching is appropriate.
4. Use **Retry failed** for a batch of failed/partial jobs. This resets only `failed` and `partial` jobs, never deletes a document, and never touches completed jobs.
5. If an extraction was partial and an older completed document exists, the job records `existing_document_preserved: true`; the old document remains searchable.

## 7. Known limitations

- Substack may return a Cloudflare `403` to server-side fetches. The fetcher fails the job safely and does not index the challenge page. A proxy/reader fallback is intentionally not enabled because it would send source URLs to a third party and change the ingestion architecture.
- Full document history is not stored because the existing schema has no version table. The previous content hash and job metadata are preserved.
- The completeness score is heuristic and should be calibrated against a labelled extraction set before tightening thresholds.
- Existing documents retain their v1 parser/chunker metadata until they are re-imported with **Recheck existing URLs**.
