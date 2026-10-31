# Media Archive source-based ingestion

## Result

Every Media Archive publication has one `media_archive_records` row and one linked `knowledge_documents` row. Text can come from:

1. publication URL;
2. manual full text;
3. PDF;
4. TXT.

The publication status and Brain indexing status are independent:

- `media_archive_records.status` — `draft` / `published`;
- `media_archive_records.indexing_status` — `not_indexed` / `pending` / `processing` / `completed` / `partial` / `failed` / `blocked`;
- linked `knowledge_documents.media_coverage_status` remains the source of truth for coverage details.

## Single-fetch architecture

`POST /api/admin/media-records` now supports:

- `action: "preview"` (also accepts legacy `"parse"`);
- `action: "save"`.

### Preview

`preview` fetches the publication **once**, extracts text, stores the captured source in the private `brain-sources` bucket, and returns:

- original URL and canonical URL;
- outlet, title, author, date, language, kind, topic, summary, image;
- source method (`url`, `pdf`, `txt`, `text`);
- source SHA-256 and content hash;
- extraction quality, character and word counts;
- chunk count;
- paywall / truncation flags;
- extraction diagnostics;
- duplicate record and existing Brain coverage status.

For URL sources the captured HTML is stored in private storage. Save and the worker read that stored HTML; they do not download the page again.

### Save

`save` requires the `source` descriptor returned by preview. It only verifies that the stored object still matches its SHA-256, writes or updates the archive record, and enqueues the existing Media coverage Brain job.

Save never fetches or re-extracts the publication. If a record with the same canonical URL already exists, the existing row is updated instead of creating a duplicate.

## Washington Post case

Target URL:

```text
https://www.washingtonpost.com/world/2026/10/29/ukrainian-attacks-are-threatening-putin-ai-aspirations/
```

Verified server-side result (2026-10-31):

- title: `These data centers hold Putin’s AI aspirations. They’re big targets.`
- outlet: `The Washington Post`
- author: `Mary Ilyushina`
- canonical URL retained
- publication date: `2026-10-29`
- quality: `metadata_only`
- coverage status: `failed`
- 649 chars / 96 words / 1 chunk
- no paywall bypass

The preview therefore:

- retains the original URL and normalized canonical URL;
- reports extraction quality `metadata_only`, not `full_text`;
- shows a warning before save;
- does not index the subscriber preview as complete coverage;
- allows the administrator to switch to manual full text or PDF/TXT using the same original URL.

If the page exceeds the 3 MB source cap or the server returns 401/402/403/451, the preview returns a `blocked` result with 0 chars / 0 chunks and the same manual/PDF fallback.

Manual text and PDF/TXT then go through the same Brain chunking, embedding, indexing and graph pipeline.

## Legacy linked article documents

Some Media Archive rows were previously linked to an `article` knowledge document by the reconciliation script. If a new manual/PDF/TXT source is saved for such a row, the worker re-indexes that same document id and replaces its content with media provenance instead of returning early with stale text. The media record and document link stay stable.

## Duplicate and update rules

- URL/canonical duplicate → preview returns the existing record and coverage; save updates that row.
- Existing record is never deleted.
- Repeated save does not create a second media record or a second knowledge document.
- `media_record_id` remains unique on `knowledge_documents`.

## Privacy and storage

- private bucket: `brain-sources`;
- source formats: captured `html`, `pdf`, `txt`, manual text (`txt`);
- database stores `source_path`, `source_sha256`, `content_hash`;
- no public URL is created for originals;
- source text is not stored in `ai_metadata`/JSONB; only compact extraction diagnostics are stored there.

## Migration

`migrations/2026-11-07_media_source_ingestion.sql` adds:

- `author`, `source_format`, `content_hash`, `source_path`, `source_sha256`;
- `extraction_diagnostics`;
- `indexing_status` and `indexing_error`;
- constraints/indexes;
- HTML support in `brain_ingestion_jobs.storage_path`.

Existing rows are backfilled from their linked `knowledge_documents` rows. No record is deleted.

## Tests

```bash
npx jest lib/knowledge/media --runInBand
npx tsc --noEmit
```

Coverage includes:

- the exact Washington Post URL as `metadata_only`, plus a blocked-source fallback;
- HTTP 403 and 402;
- paywall partial text;
- truncated extraction;
- manual text;
- TXT source;
- PDF source with page provenance;
- duplicate record and existing Brain coverage;
- migration safety.
