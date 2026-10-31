# Unified Brain ingestion — URL, PDF, TXT and pasted text

**Status:** implemented, migration required before use in production.

## 1. What changed

The admin Brain loader is no longer URL-only. All four source types now share one pipeline:

```text
SOURCE
  → VALIDATION
  → DUPLICATE DETECTION
  → EXTRACTION
  → NORMALIZATION
  → CHUNKING
  → EMBEDDINGS
  → KNOWLEDGE INDEX
  → GRAPH EXTRACTION (queued after the run)
  → RESULT
```

There is still exactly one RAG store:

- `public.knowledge_documents`
- `public.knowledge_chunks`
- existing `brain_search_hybrid()` and `retrieveBrainEvidence()`

No second vector table, chunker, embedding model or search RPC was added.

## 2. Source types

| Admin source | `knowledge_documents.source_type` | `source_format` | Original stored |
|---|---|---|---|
| URL | `article` | `url` | Not stored; fetched by the existing safe URL fetcher |
| PDF | `pdf` | `pdf` | Private `brain-sources/<sha>.pdf` |
| TXT | `txt` | `txt` | Private `brain-sources/<sha>.txt` |
| Pasted text | `text` | `text` | Private `brain-sources/<sha>.txt` |
| Existing UNFRAMED | `manuscript` | `markdown` | Existing frozen manifest path |

`source_type` describes the document. `source_format` describes how the original was delivered.

## 3. Validation

Server-side validation happens before a job is queued and again in the worker.

- **PDF:** size limit 25 MB, `%PDF-` magic bytes, real Parse call. Empty, damaged or
  password-protected PDFs fail with a specific code.
- **Scanned PDF:** if no usable text pages are found, the result is
  `pdf_ocr_required` (HTTP 422 in preview). It is never reported as a successful extraction.
- **TXT:** size limit 5 MB, no NUL bytes, strict UTF-8 decode.
- **Pasted text:** size limit 2 MB, no NUL bytes, UTF-8.
- **Metadata:** title ≤ 200, author ≤ 300, language ≤ 16, valid calendar date.
- **URL:** existing `normalizeSourceUrl()` and safe fetch policy.

## 4. PDF extraction

`lib/knowledge/brain/pdfExtract.ts` uses `pdf-parse` server-side and:

- extracts text page by page;
- keeps physical page numbers as `Page N` headings and `page_start`/`page_end` in chunk metadata;
- removes repeated short headers/footers when the document has enough pages;
- removes standalone page-number lines and `-- N of M --` footers;
- skips empty or unusable pages;
- reports `pageCount`, `usablePageCount`, `skippedPages`, `emptyPageCount` and `ocrSuspected`;
- fails honestly when the document is empty, damaged, password-protected or OCR-only.

## 5. TXT and pasted text

`lib/knowledge/brain/textExtract.ts`:

- normalizes BOM and CRLF line endings;
- preserves Unicode;
- recognises Markdown headings and heuristic headings;
- preserves paragraphs, quotes and lists as the same block model used by the HTML extractor;
- infers title, author, date and language when possible;
- accepts explicit metadata overrides from the admin UI.

The original pasted text / TXT bytes are stored unchanged in the private bucket for
reproducibility. Extraction uses a normalized copy; `source_sha256` is the hash of the original
bytes and `content_hash` is the hash of the normalized extracted text.

## 6. Private storage

Bucket: `brain-sources` (private, no public URL).

Object key: `<sha[0:2]>/<sha>.<pdf|txt>`.

`knowledge_documents.source_path` stores the private locator
`brain-sources/<sha[0:2]>/<sha>.<ext>`.

Large files never pass through a JSONB column or a job payload. Browser uploads use a short-lived
signed upload URL from `/api/admin/brain/uploads`; the preview endpoint downloads the object,
verifies its SHA-256 and promotes it to the final path.

## 7. Duplicate detection

Before queueing:

- URL: normalized URL and canonical URL;
- file/text: SHA-256 of the original bytes;
- all: active queued/processing job check;
- preview also reports identical extracted-text duplicates.

At write time the worker repeats the checks. Rechecking an existing source reuses the existing
logical document id, upserts chunks and deletes stale chunks. It never creates a duplicate
document.

The database enforces a partial unique index on `source_sha256` for `pdf`, `txt` and `text`.

## 8. API

| Route | Purpose |
|---|---|
| `POST /api/admin/brain/uploads` | Creates a signed upload URL for PDF/TXT |
| `POST /api/admin/brain/preview` | Validates, extracts, chunks, detects duplicates and returns preview |
| `POST /api/admin/brain/sources` | Enqueues one or more staged sources |
| `POST /api/admin/brain/runs/[id]/next` | Processes one ingestion job; on completion queues graph extraction |
| `POST /api/admin/brain/runs/[id]/cancel` | Cancels remaining queued/processing jobs |
| Existing pause/resume/retry routes | Unchanged |

All routes use `authorizeKnowledgeAdmin`.

## 9. Graph extraction

When an ingestion run completes, `queueGraphForIngestionRun()` creates one graph run for the
completed documents using the existing graph tables and `createGraphRun()`.

- Controlled by `BRAIN_AUTO_GRAPH` (`true` by default; set `false` to disable).
- Requires `DEEPSEEK_API_KEY`; otherwise the ingestion run records `graph_skipped`.
- The admin UI can process the graph run automatically after indexing.
- Graph relationships remain `verified=false` until the owner reviews them. Ingestion never
  marks an inferred relationship as verified.

## 10. UNFRAMED compatibility

- The manuscript document `doc_unframed_manuscript` and its frozen manifest are untouched.
- `source_format` is backfilled to `markdown` for the manuscript.
- Existing `knowledge_search_unframed` and `brain_search_hybrid` continue to work.
- The old manuscript admin endpoint still has global-count checks (`documentCount <= 1`). That is
  a separate pre-existing limitation; this change does not alter the manuscript.
- Manuscript remains `access_class = 'owner'` and is never exposed through public scope.

## 11. Migration

Apply:

```text
migrations/2026-11-05_unified_brain_source_ingestion.sql
```

It is additive and idempotent. It adds:

- `knowledge_documents.source_format`, `original_filename`, `mime_type`, `page_count`;
- file source SHA index and partial unique index;
- queue source metadata columns and constraints;
- the private `brain-sources` bucket.

It does not recreate tables, delete documents or chunks, or rewrite the manuscript.

## 12. Research inventory questions

Brain Research answers publication-inventory questions deterministically, not
from top-K chunks:

- «найти все мои колонки в новой газете»;
- «сколько я написал колонок в новую газету»;
- equivalent English phrasing.

The detector is `detectPublicationInventoryQuestion()`. The selector keeps
`source_type = article` on `novayagazeta.ru/.eu`, deduplicates by canonical URL,
removes `media_coverage` mirrors, applies the parsed date range, and lists every
matching document. The answer explicitly says that the count reflects the
indexed Brain corpus rather than the publication's complete archive.

The admin Overview also shows a read-only **RAG / Brain** panel: corpus counts,
embedded chunks, ingestion/graph/media queue health and 30-day retrieval
outcomes. It never returns passages, queries or owner text.

## 13. Tests

```bash
npx jest lib/knowledge/brain lib/knowledge/graph --runInBand
npx tsc --noEmit
```

Coverage added:

- UTF-8 and Unicode validation;
- TXT/pasted-text structure and metadata inference;
- PDF page numbering, skipped pages, repeated footer removal, OCR detection, signature validation;
- real process wiring for pasted text and PDF with page provenance.

The real `pdf-parse` path is also smoke-tested with a PDF fixture outside Jest because `pdfjs`
uses a dynamic worker import that Jest's VM cannot execute.
