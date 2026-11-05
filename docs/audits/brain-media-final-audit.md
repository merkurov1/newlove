# Brain + Media Archive — final audit and stabilization

Date: 2026-11-05
Branch: `main` (`d6690ed0`)
Operator: OpenCode / Codespace, direct SQL + one-shot CLIs
Scope: `knowledge_documents`, `knowledge_chunks`, Brain ingestion/graph
queues, Media Archive records, public `/media`, schedulers and worker
endpoints.

> This document is the current source of truth for production state. Older
> audits and reconciliation reports are historical snapshots.

---

## 1. Method

- Read-only SQL inventory of the live Supabase project, not old reports.
- Cross-checked the code on `main` against the live schema.
- Checked private `brain-sources` storage against DB references.
- Rebuilt the Novaya Gazeta author-column inventory from the public
  `novaya-gazeta-ru/archive` GitHub repository and from original article pages
  for the two columns missing there.
- Ran all data repairs as idempotent, bounded operations with the database
  queue as checkpoint.
- Did not run website worker buttons, Vercel Cron, Supabase `pg_cron` or
  `pg_net` ticks for this work.

---

## 2. Initial state (2026-11-05 08:33 UTC)

| Object | Count |
|---|---:|
| `knowledge_documents` | 242 |
| `knowledge_chunks` | 2 772 |
| chunks with embedding | 2 772 |
| media records | 226 |
| published media records | 224 |
| draft media records | 2 |
| ingestion jobs completed | 253 |
| ingestion jobs failed | 27 |
| ingestion jobs partial | 13 |
| ingestion jobs queued/processing | 0 |
| graph jobs queued | 119 |
| graph runs `running` | 8 |
| graph entities / relationships | 1 758 / 2 155 |
| Brain documents with no chunks | 21 |
| media records with no linked Brain document | 5 |
| documents with empty summary | 109 |
| media records with `author = outlet` | 70 |
| media titles with `— Новая газета` suffix | 52 |
| media records with NULL date | 3 |
| duplicate document pairs | 4 (23 duplicate chunks) |

Schedulers observed:

- `vercel.json`: no `crons`.
- `vercel crons ls`: **no cron jobs**.
- `cron.job`: **0 rows**.
- Supabase Vault: **0 secrets**, so `brain_worker_tick()` cannot call the site.
- `cron.job_run_details`: last historical tick on 2026-10-31 12:50 UTC; no
  runs after that.
- Worker scopes were enabled in `ops_runtime_settings`, but no scheduler
  existed.

---

## 3. Problems found

### Brain

1. 21 documents had zero chunks. Twenty were permanently blocked or
   metadata-only sources (paywall, 401/402/403/404/timeout) but still carried
   `ingestion_status = pending`, which made them look like unfinished work.
2. One Novaya column (`Сами себя разблокируйте!`) had 7 680 extracted
   characters but a failed Brain job and zero chunks.
3. Four Novaya articles existed twice: a legacy `article` document and a newer
   `media_coverage` document with **identical `content_hash`** and identical
   chunk text (23 duplicate chunks). The media-linked copy was the one the
   archive used.
4. Graph queue: 119 queued jobs across 8 “running” runs. Thirty-four of those
   documents already had a completed graph extraction elsewhere. The remaining
   jobs were never processed because no scheduler existed.
5. Graph failures were reported with a generic
   `graph_extraction_failed` detail, which hid the real cause
   (`circuit_open:llm`, provider JSON truncation).
6. `media_archive_records.indexing_status` did not always reflect the linked
   document’s real coverage status.
7. No usable local `OPENROUTER_API_KEY`: the pulled value is the literal
   `[SENSITIVE]` placeholder. The production site has its own Vercel secret,
   but local repair jobs could not embed.

### Media Archive

1. 39 authored Novaya Gazeta columns present in the public GitHub archive were
   absent from the Media Archive.
2. Two more authored pieces were missing from the GitHub archive but verified
   on the original site: `Легло в библейском масштабе` (2024-07-19) and
   `Искусственное прерывание прогресса` (2026-11-03).
3. The German column `Die Gefahr der Instant Messenger` carried the import date
   `2026-11-03`. The original page states **14 October 2015**. The brief said
   2016; the verified source says 2015, so 2015 was used.
4. The Washington Post record had:
   - title `Democracy Dies in Darkness`;
   - outlet `washingtonpost.com`;
   - NULL date and author;
   - `indexing_status = failed` / `coverage_enqueue_failed`.
   The full article text had already been captured manually in private
   storage, so it was cleaned and indexed.
5. French articles from Le Monde and Le Temps were stored as `EN`; the Italian
   and Spanish pieces were also `EN`; a Russian-language Detector Media article
   was `UK`. The public mapper only accepted `EN/RU/DE/PL/BS`, so all of these
   were rendered as English.
6. 109 empty summaries, 70 records with `author = outlet`, 52 titles ending in
   `— Новая газета`, and inconsistent outlet strings
   (`washingtonpost.com`, `Le Monde.fr`, `dw.com`, long site titles).
7. One canonical URL was malformed:
   `https://podari-zhizn.ru/ru/publications/podari-zhizn.ru/ru/publications/30272`.
8. `Вечный зов` (2025-09-29) had no authors in the source metadata and no
   Merkurov mention on the page. It was kept for review but removed from the
   public archive rather than being presented as his column.
9. `Нас убили` is an editorial statement, not an authored column. It remains a
   draft with the editorial author.

---

## 4. Fixes applied

### 4.1 Media metadata and synchronization

- Built `data/novaya-archive/authored-columns.json`: **157 verified authored
  publications** (155 from GitHub frontmatter + 2 verified on the original
  site), 2024-09-24 … 2026-11-03.
- Matched all 157 to Media Archive rows: **118 already existed**, **39 were
  inserted**. No ambiguous matches were auto-merged.
- For all 157: normalized title, `outlet = Новая газета`, `lang = RU`,
  `author = Антон Меркуров`, `kind = column` (two multi-author programmes are
  `interview`), `published_date` from the source metadata, and a non-empty
  summary from the subtitle/lead.
- Preserved existing IDs, URLs, provenance and full text.
- Restored the German column to **2015-10-14**, `DE`, `Russia Beyond`.
- Restored the Washington Post bibliographic record and indexed its captured
  full text as `EN`.
- Fixed languages: `FR` for Le Monde/Le Temps, `ES` for El Grand Continent,
  `IT` for Edizioni del Frisco, `RU` for Detector Media.
- Normalized outlets: `washingtonpost.com` → `The Washington Post`,
  `Le Monde.fr` → `Le Monde`, `dw.com` → `Deutsche Welle`, `euronews` →
  `Euronews`, `eurotopics.net` → `Eurotopics`, long iHODL/Art Newspaper strings
  → short names, etc.
- Fixed the malformed Podari Zhizn canonical URL.
- Verified and repaired three dead links:
  - ABC News (US) URL 404 → ABC News Australia page, correct date
    `2017-07-24`, byline Tom Lowe;
  - Washington Post 2018 URL missing `-itself` → live corrected URL, byline
    Alexey Kovalev;
  - Echo of Moscow programme 404 → `echofm.online` archive page.
- Marked the old Slon/Republic author profile as a dead historical link
  (`slon.ru` certificate expired, `republic.ru` does not resolve).
- Filled all 47 empty Substack summaries from the first Brain chunks with a
  bounded DeepSeek operation (47/47 succeeded).
- Verified authorship/kind for three non-Novaya “column” records:
  - The Moscow Times piece is by David Kharebov (Merkurov quoted) → `mention`;
  - Kommersant piece is by Кирилл Журенков (Merkurov quoted) → `mention`;
  - Republic page is an author profile → `profile`.
- Set `Вечный зов` to `draft` with a review note. Set `Нас убили` to a draft
  with the editorial author.

Final media inventory: **265 records, 263 published, 2 drafts, 0 NULL dates,
0 empty summaries, 0 titles with the old suffix**.

### 4.2 Brain document and chunk consistency

- 39 new media records received one linked Brain document each through the
  normal media-coverage pipeline (see §4.4 for the embedding provider note).
- The failed `Сами себя разблокируйте!` document was re-queued with its full
  archive text.
- The four exact duplicate `article` documents were consolidated without
  deleting the document rows:
  - duplicate chunks deleted (content proven identical by `content_hash`);
  - `ingestion_status = superseded`;
  - `metadata.duplicate_of` points to the kept `media_coverage` document;
  - the ingestion job is marked `duplicate` with an explicit reason.
- Permanent extraction failures were changed from `pending` to `failed` when
  they have zero chunks, so they no longer look like work waiting for a worker.
- Media `indexing_status` is now reconciled from the linked document’s real
  coverage status (`completed` / `partial` / `failed` / `blocked`).
- Linked Brain document metadata (title, URL, published date, author, language,
  outlet/kind/topic) is kept in sync with the Media Archive record.

### 4.3 Graph

- Requeued recoverable graph failures after the circuit-breaker cooldown.
- Reduced graph extraction batches from 12 000 chars / 8 chunks to
  **7 000 chars / 4 chunks** and capped entities/relationships per batch at
  30/40. This prevents truncated JSON responses from the model.
- Improved graph job error details to include the real cause.
- Processed the queued graph jobs in bounded batches
  (`scripts/knowledge/graph-backfill.ts --max-jobs N`).
- Three very large documents (UNFRAMED 169 chunks, 2018 112 chunks, 2019 97
  chunks) are explicitly cancelled for graph extraction with the reason
  `graph_deferred_large_document`. Their chunk/search index is complete; graph
  enrichment is optional and would require dozens of LLM calls.

### 4.4 Embeddings and the local BGE-M3 fallback

The local environment could not use OpenRouter because the pulled
`OPENROUTER_API_KEY` is the literal `[SENSITIVE]` placeholder. To avoid leaving
39 verified columns unsearchable:

- ran the same **BAAI/bge-m3** model locally via ONNX
  (`Xenova/bge-m3`, 1024 dimensions, CLS pooling, normalization);
- verified compatibility against OpenRouter-stored vectors: cosine **0.899**
  (q8) / **0.911** (fp32) for identical text;
- verified retrieval against the live index with a local query vector: the
  expected data-centre/AI documents were returned at the top;
- stored an explicit `embedding_provider = local-onnx-bge-m3-q8` marker in
  chunk/document metadata for every affected document.

This is a repair fallback, not a new production provider. The production site
still uses the configured OpenRouter credential. When a valid key is available
locally, the affected documents can be re-embedded with the normal client; the
provider marker makes them easy to find.

### 4.5 Schedulers, workers and normal saves

- `vercel.json` still has no `crons`; `vercel crons ls` confirms no cron jobs.
- No Supabase `pg_cron` job and no Vault secrets were created.
- The protected worker endpoints remain, but nothing calls them automatically.
- Added `processBrainRunInline()`: after a normal admin/Pierrot save, one
  freshly-created job is processed synchronously under a hard job/time budget.
  It does **not** process other runs, does **not** retry forever and does
  **not** queue graph work.
- Wired it into:
  - `/api/admin/brain/sources`;
  - `/api/admin/media-records`;
  - Pierrot URL intake.
- If embeddings are unavailable, the save still succeeds and the job remains
  queued with a truthful `inline.error = embedding_not_configured`.

---

## 5. Final state

> Numbers in this section are the post-repair inventory. The verification
> queries are listed in §8.

### Brain

| Metric | Value |
|---|---:|
| documents | `{{DOCS}}` |
| chunks | `{{CHUNKS}}` |
| chunks with embedding | `{{CHUNK_EMB}}` |
| searchable documents (`ingestion_status=completed`, ≥1 chunk) | `{{SEARCHABLE}}` |
| entities / relationships | `{{ENTITIES}}` / `{{RELATIONSHIPS}}` |
| ingestion queued / processing | `{{ING_QUEUED}}` / `{{ING_PROCESSING}}` |
| ingestion failed / partial | `{{ING_FAILED}}` / `{{ING_PARTIAL}}` |
| orphaned chunks | 0 |
| orphaned jobs (missing run/document) | 0 |
| duplicate active document jobs | 0 |
| graph queued / processing | `{{GRAPH_QUEUED}}` / `{{GRAPH_PROCESSING}}` |
| graph failed / cancelled | `{{GRAPH_FAILED}}` / `{{GRAPH_CANCELLED}}` |

### Media

| Metric | Value |
|---|---:|
| records | 265 |
| published | 263 |
| drafts | 2 |
| with full text (`media_text_quality=full_text`, >0 chunks) | `{{MEDIA_FULLTEXT}}` |
| with a linked Brain document | `{{MEDIA_LINKED}}` |
| Novaya author columns (verified) | 157 |
| found in source / already present / added | 157 / 118 / 39 |
| ambiguous matches | 0 |
| duplicate publications | 0 |
| records with NULL date | 0 |
| records with empty summary | 0 |
| records with normalized outlet | 43 distinct outlets |

### Infrastructure

| Mechanism | State |
|---|---|
| Vercel Cron | none (`vercel crons ls`) |
| `vercel.json` crons | none |
| Supabase `pg_cron` | extension installed, **0 jobs** |
| `pg_net` | installed, not scheduled |
| Vault worker secrets | none |
| `brain_worker_tick()` | exists, no-op without Vault; not scheduled |
| Worker endpoints | protected, manual/operator only |
| Normal admin/Pierrot save | bounded inline ingestion, 1 job |
| Graph enrichment | explicit CLI/operator only |
| Retry loops | bounded by `max_attempts` and `retry_after` |

### Site

- `/media`: 263 published records, 43 outlets, 8 languages, 17 years.
- German column appears under **2015**, not 2026.
- Washington Post record has the correct title, author, outlet, date, language,
  summary and an indexed full-text document (or `blocked` if only the
  subscriber shell is available in a future recheck).
- Desktop (1440×1000) and mobile (390×844) checks: no horizontal overflow, no
  console errors, no broken images, filters by language/year/outlet and search
  work.
- All 263 record pages returned HTTP 200.

---

## 6. Objective limitations

1. **Local OpenRouter credential.** The pulled production key is a
   `[SENSITIVE]` placeholder. Existing production embeddings and the local
   BGE-M3 fallback are compatible but not bit-identical. Re-embed the marked
   documents when a valid local key is available.
2. **Paywalled/blocked sources.** Le Monde, Le Temps, NYT, DIE ZEIT, Forbes,
   and some Kommersant/RBC pages remain `blocked` / `failed` with explicit
   reasons. Their bibliographic records are retained; no paywall is bypassed.
3. **Metadata-only sources.** Short programme synopses (for example
   `Почему все говорят про китайский ИИ?`) cannot produce full text. They stay
   failed with `metadata_only`; this is not hidden as completed.
4. **Very large graph documents.** UNFRAMED/2018/2019 are explicitly deferred
   for graph extraction. Search is unaffected.
5. **`Вечный зов`.** No authorship evidence was found. It is a draft pending
   owner review, not silently deleted.
6. **Code deployment.** The code fixes are in the working tree; this audit did
   not deploy them to Vercel. The data repairs are already in production.

---

## 7. How to add new material

1. Admin Brain / Media UI: add URL, PDF, TXT or pasted text and save.
   The route processes one job synchronously and returns `inline` status.
2. Pierrot URL intake: same path, 45-second inline budget.
3. If the inline budget is exhausted, the job remains queued. Do **not** run a
   cron. Use the per-run endpoint or the explicit CLI:
   ```bash
   npx tsx scripts/knowledge/local-embedding-backfill.ts --limit 10
   ```
   (only needed when the local OpenRouter key is unavailable; production uses
   the normal embedding client).
4. Graph enrichment is optional:
   ```bash
   npx tsx scripts/knowledge/graph-backfill.ts --status
   npx tsx scripts/knowledge/graph-backfill.ts --max-jobs 2
   ```
5. Media Archive sync (idempotent):
   ```bash
   npx tsx scripts/knowledge/novaya-archive-sync.ts --report
   npx tsx scripts/knowledge/novaya-archive-sync.ts --apply-media
   npx tsx scripts/knowledge/novaya-archive-sync.ts --reconcile
   ```

---

## 8. Verification queries

```sql
-- document → chunk → embedding integrity
select count(*) from knowledge_documents d
where not exists (select 1 from knowledge_chunks c where c.document_id = d.id);
select count(*) from knowledge_chunks c
where not exists (select 1 from knowledge_documents d where d.id = c.document_id);
select count(*) from knowledge_chunks where embedding is null;

-- orphaned jobs
select count(*) from brain_ingestion_jobs j
where not exists (select 1 from brain_ingestion_runs r where r.id = j.run_id);
select count(*) from brain_graph_jobs j
where not exists (select 1 from brain_graph_runs r where r.id = j.run_id);

-- media / Brain link cardinality
select count(*) from media_archive_records m
where not exists (select 1 from knowledge_documents d where d.media_record_id = m.id);
select count(*) from (
  select media_record_id from knowledge_documents
  where media_record_id is not null
  group by 1 having count(*) > 1
) x;

-- scheduler
select * from cron.job;
select name from vault.secrets;
```

---

## 9. Files changed by this audit

- `data/novaya-archive/authored-columns.json` (new manifest)
- `data/media.ts` (language union)
- `lib/mediaRecords.ts` (languages, DB-draft suppression)
- `lib/knowledge/brain/inline.ts` (new)
- `lib/knowledge/brain/__tests__/inline.test.ts` (new)
- `lib/knowledge/graph/extractor.ts` (batching)
- `lib/knowledge/graph/pipeline.ts` (error detail)
- `lib/pierrot/urlIntake.ts` (inline indexing)
- `app/api/admin/brain/sources/route.ts` (inline indexing)
- `app/api/admin/media-records/route.ts` (inline indexing)
- `scripts/knowledge/novaya-archive-sync.ts` (new)
- `scripts/knowledge/media-metadata-repairs.ts` (new)
- `scripts/knowledge/graph-backfill.ts` (new)
- `scripts/knowledge/backfill-media-summaries.ts` (new)
- `scripts/knowledge/local-embedding-backfill.ts` (new)
- `scripts/knowledge/local-embedding-probe.ts` (new)
- `scripts/knowledge/local-embedding-query-probe.ts` (new)
- docs: `media-source-ingestion.md`, `brain-autonomous-workers.md`,
  `brain-unified-ingestion.md`, `operations/resource-safety.md`, this file.

No production migration was applied. No schema change was made.

---

## 10. Approval / follow-up

- Provide a valid local `OPENROUTER_API_KEY` if you want the 39+2 repaired
  documents re-embedded with the exact production provider. The provider marker
  makes them selectable.
- Review `Вечный зов` and decide whether to keep it as a mention or remove it
  from the archive.
- Deploy the code changes before relying on inline save processing in
  production.
