#!/usr/bin/env tsx
/**
 * Attach an archived PDF + proofread UTF-8 text to an existing Media Archive
 * record, enqueue Brain ingestion and verify retrieval.
 *
 * The script never inserts a media row. The record id is the identity, so a
 * repeated run updates the same row and reuses the same knowledge document.
 *
 * Dry run (no database writes):
 *   npx tsx scripts/knowledge/import-media-archive-source.ts \
 *     --record-id 775e8169-a02e-4b64-b3f8-e3722a48c28f \
 *     --pdf data/media-archive/775e8169-a02e-4b64-b3f8-e3722a48c28f/Pilot.pdf \
 *     --text data/media-archive/775e8169-a02e-4b64-b3f8-e3722a48c28f/yarmarka-intellekta.txt
 *
 * Offline plan (no database, useful in CI):
 *   npx tsx scripts/knowledge/import-media-archive-source.ts --offline ...
 *
 * Apply:
 *   npx tsx scripts/knowledge/import-media-archive-source.ts --apply ...
 */
import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

import { processBrainRunInline } from '@/lib/knowledge/brain/inline';
import { createBrainStorage } from '@/lib/knowledge/brain/storage';
import { createBrainStore, type MediaArchiveRecord } from '@/lib/knowledge/brain/store';
import {
  planMediaArchiveTextSource,
  type MediaArchiveTextPlan,
} from '@/lib/knowledge/media/archiveTextImport';
import { enqueueMediaCoverageJob } from '@/lib/knowledge/media/queue';
import { retrieveBrainEvidence } from '@/lib/knowledge/rag/brainRetrieval';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production.local' });
dotenv.config();

const SOURCE_URL = 'https://www.expertiza.org/MAYDAYCO/CDPRO/Pilot.pdf';
const DEFAULT_RECORD_ID = '775e8169-a02e-4b64-b3f8-e3722a48c28f';
const REQUESTED_BY = 'media-archive-source-import';

type CliArgs = {
  values: Map<string, string>;
  flags: Set<string>;
};

export function parseArgs(argv: string[]): CliArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith('--')) continue;

    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const next = argv[index + 1];

    if (inlineValue !== undefined) {
      values.set(rawKey, inlineValue);
    } else if (next && !next.startsWith('--')) {
      values.set(rawKey, next);
      index += 1;
    } else {
      flags.add(rawKey);
    }
  }

  return { values, flags };
}

function value(args: CliArgs, key: string, fallback = ''): string {
  return args.values.get(key) ?? fallback;
}

function flag(args: CliArgs, key: string): boolean {
  return args.flags.has(key) || args.values.get(key) === 'true';
}

function integer(valueToParse: string, fallback: number): number {
  const parsed = Number.parseInt(valueToParse, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pageNumbers(valueToParse: string, fallback: number[]): number[] {
  if (!valueToParse.trim()) return fallback;

  const pages = valueToParse
    .split(',')
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isFinite(entry) && entry > 0);

  return pages.length > 0 ? pages : fallback;
}

type BundleManifestExpectations = {
  pdfSha256: string | null;
  pdfPageCount: number | null;
  textSha256: string | null;
  contentHash: string | null;
  sourcePath: string | null;
};

export function readBundleManifestExpectations(manifestPath: string): BundleManifestExpectations {
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    source?: { sha256?: unknown; pageCount?: unknown };
    article?: { sha256?: unknown; contentHash?: unknown };
    recordUpdate?: { source_path?: unknown };
  };
  const stringValue = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.trim() : null;

  return {
    pdfSha256: stringValue(parsed.source?.sha256),
    pdfPageCount: typeof parsed.source?.pageCount === 'number' ? parsed.source.pageCount : null,
    textSha256: stringValue(parsed.article?.sha256),
    contentHash: stringValue(parsed.article?.contentHash),
    sourcePath: stringValue(parsed.recordUpdate?.source_path),
  };
}

/**
 * Refuses to apply files that no longer match the audited bundle manifest.
 * This keeps the archived PDF unchanged and prevents attaching a different
 * text file to the existing media record.
 */
export function assertPlanMatchesManifest(plan: MediaArchiveTextPlan, manifestPath: string): void {
  const expected = readBundleManifestExpectations(manifestPath);

  if (expected.pdfSha256 && expected.pdfSha256 !== plan.pdf.sourceSha256) {
    throw new Error('manifest_pdf_sha256_mismatch');
  }

  if (expected.pdfPageCount && expected.pdfPageCount !== plan.pdf.pageCount) {
    throw new Error('manifest_pdf_page_count_mismatch');
  }

  if (expected.textSha256 && expected.textSha256 !== plan.text.sourceSha256) {
    throw new Error('manifest_text_sha256_mismatch');
  }

  if (expected.contentHash && expected.contentHash !== plan.text.contentHash) {
    throw new Error('manifest_content_hash_mismatch');
  }

  if (expected.sourcePath && expected.sourcePath !== plan.patch.source_path) {
    throw new Error('manifest_source_path_mismatch');
  }
}

function stubRecord(args: CliArgs): MediaArchiveRecord {
  const url = value(args, 'url', SOURCE_URL);
  const now = new Date().toISOString();

  return {
    id: value(args, 'record-id', DEFAULT_RECORD_ID),
    url,
    canonical_url: value(args, 'canonical-url', url),
    title: value(args, 'title', 'Ярмарка интеллекта'),
    outlet: value(args, 'outlet', 'CDпро.ru'),
    author: value(args, 'author', 'Антон (Палыч) Меркуров') || null,
    published_date: value(args, 'published-at', '2001-12-10'),
    lang: value(args, 'language', 'RU'),
    kind: 'column',
    topic: 'Art & Culture',
    summary: '',
    image_url: null,
    status: 'published',
    ai_metadata: { reviewed: true, import_pending: false },
    updated_at: now,
  };
}

export function planFromFiles(
  record: MediaArchiveRecord,
  pdfPath: string,
  textPath: string,
  args: CliArgs
): MediaArchiveTextPlan {
  const pdf = fs.readFileSync(pdfPath);
  const text = fs.readFileSync(textPath, 'utf8');

  return planMediaArchiveTextSource({
    record,
    pdf,
    text,
    pdfFilename: path.basename(pdfPath),
    textFilename: path.basename(textPath),
    pdfPageCount: integer(value(args, 'pdf-pages'), 16),
    articlePageNumbers: pageNumbers(value(args, 'article-pages'), [3]),
    articleSpreadPages: pageNumbers(value(args, 'spread-pages'), [2, 3]),
    issue: {
      publication: value(args, 'issue', 'CDпро.ru'),
      number: integer(value(args, 'issue-number'), 27),
      year: integer(value(args, 'issue-year'), 2001),
      publishedAt: value(args, 'published-at', record.published_date || '2001-12-10'),
      sourceUrl: value(args, 'url', record.url || SOURCE_URL),
    },
    authorFallback: value(args, 'author', 'Антон (Палыч) Меркуров'),
    ocrReviewNote:
      value(args, 'ocr-review-note') ||
      'Вручную склеены переносы строк и слова, исправлены пробелы, дефисы, кавычки и пунктуация OCR; абзацы сохранены.',
  });
}

type Verification = {
  jobStatus: string | null;
  jobError: string | null;
  coverageStatus: string | null;
  ingestionStatus: string | null;
  documentId: string | null;
  chunkCount: number | null;
  contentHash: string | null;
  retrieval: {
    outcome: string;
    hits: number;
    matchedDocument: boolean;
    ok: boolean;
    error: string | null;
  } | null;
  ok: boolean;
};

async function verify(input: {
  store: NonNullable<ReturnType<typeof createBrainStore>>;
  record: MediaArchiveRecord;
  plan: MediaArchiveTextPlan;
  skipRetrieval: boolean;
}): Promise<Verification> {
  const [job, coverage] = await Promise.all([
    input.store.getLatestMediaJob(input.record.id),
    input.store.findMediaCoverageDocument({
      mediaRecordId: input.record.id,
      canonicalUrl: input.record.canonical_url,
    }),
  ]);

  let retrieval: Verification['retrieval'] = null;

  if (!input.skipRetrieval && coverage?.documentId) {
    try {
      const result = await retrieveBrainEvidence({
        query: 'Ярмарка интеллекта non/fiction CDпро Меркуров электронные книги',
        scope: 'owner',
        ownerAuthorized: true,
        documentId: coverage.documentId,
        topK: 5,
      });

      retrieval = {
        outcome: result.outcome,
        hits: result.hits.length,
        matchedDocument: result.hits.some((hit) => hit.documentId === coverage.documentId),
        ok:
          (result.outcome === 'relevant_results' || result.outcome === 'weak_match') &&
          result.hits.length > 0,
        error:
          result.outcome === 'unavailable'
            ? result.code || 'retrieval_unavailable'
            : result.hits.length === 0
              ? 'no_retrieval_hits'
              : null,
      };
    } catch (error) {
      retrieval = {
        outcome: 'error',
        hits: 0,
        matchedDocument: false,
        ok: false,
        error: error instanceof Error ? error.message.slice(0, 300) : 'retrieval_failed',
      };
    }
  }

  const coverageComplete =
    coverage?.ingestionStatus === 'completed' &&
    coverage.coverageStatus === 'completed' &&
    (coverage.chunkCount || 0) > 0;
  const retrievalComplete =
    input.skipRetrieval || Boolean(retrieval?.ok && retrieval.matchedDocument);

  return {
    jobStatus: job?.status ?? null,
    jobError: job?.error_code ?? null,
    coverageStatus: coverage?.coverageStatus ?? null,
    ingestionStatus: coverage?.ingestionStatus ?? null,
    documentId: coverage?.documentId ?? null,
    chunkCount: coverage?.chunkCount ?? null,
    contentHash: coverage?.contentHash ?? null,
    retrieval,
    ok:
      job?.status === 'completed' &&
      coverageComplete &&
      coverage?.contentHash === input.plan.text.contentHash &&
      retrievalComplete,
  };
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const recordId = value(args, 'record-id', DEFAULT_RECORD_ID);
  const pdfPath = value(args, 'pdf');
  const textPath = value(args, 'text');
  const manifestPath = value(args, 'manifest');
  const offline = flag(args, 'offline');
  const apply = flag(args, 'apply');
  const skipProcess = flag(args, 'no-process');
  const skipVerification = flag(args, 'no-verify');
  const json = flag(args, 'json');

  if (!pdfPath || !textPath) {
    console.error('Usage: --pdf <original.pdf> --text <proofread.txt> [--record-id <uuid>]');
    return 2;
  }

  if (!fs.existsSync(pdfPath)) {
    console.error(`PDF not found: ${pdfPath}`);
    return 2;
  }

  if (!fs.existsSync(textPath)) {
    console.error(`Text not found: ${textPath}`);
    return 2;
  }

  if (manifestPath && !fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    return 2;
  }

  if (offline) {
    const record = stubRecord(args);
    const plan = planFromFiles(record, pdfPath, textPath, args);
    if (manifestPath) assertPlanMatchesManifest(plan, manifestPath);
    console.log(
      JSON.stringify(
        {
          status: 'planned',
          mode: 'offline',
          recordId: record.id,
          plan,
        },
        null,
        2
      )
    );
    return 0;
  }

  const store = createBrainStore();
  const storage = createBrainStorage();

  if (!store) {
    console.error('Knowledge database is not configured (Supabase service role is missing).');
    return 3;
  }

  if (!storage) {
    console.error('Private Brain storage is not configured (Supabase service role is missing).');
    return 3;
  }

  const record = await store.getMediaRecord(recordId);

  if (!record) {
    console.error(`Media record not found: ${recordId}. Refusing to create a duplicate row.`);
    return 4;
  }

  const plan = planFromFiles(record, pdfPath, textPath, args);
  if (manifestPath) assertPlanMatchesManifest(plan, manifestPath);

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          status: 'planned',
          mode: 'dry-run',
          recordId: record.id,
          current: {
            sourceFormat: record.source_format ?? null,
            sourcePath: record.source_path ?? null,
            indexingStatus: record.indexing_status ?? null,
          },
          plan,
        },
        null,
        2
      )
    );
    return 0;
  }

  const storedPdf = await storage.storeSourceBuffer(
    fs.readFileSync(pdfPath),
    'pdf',
    'application/pdf'
  );
  const storedText = await storage.storeSourceBuffer(
    Buffer.from(fs.readFileSync(textPath, 'utf8'), 'utf8'),
    'txt',
    'text/plain'
  );

  if (
    storedPdf.sourcePath !== plan.pdf.sourcePath ||
    storedPdf.sourceSha256 !== plan.pdf.sourceSha256
  ) {
    throw new Error('stored_pdf_verification_failed');
  }

  if (
    storedText.sourcePath !== plan.text.sourcePath ||
    storedText.sourceSha256 !== plan.text.sourceSha256
  ) {
    throw new Error('stored_text_verification_failed');
  }

  await store.updateMediaRecord(record.id, plan.patch);

  const queued = await enqueueMediaCoverageJob({
    store,
    mediaRecordId: record.id,
    inputUrl: plan.job.inputUrl,
    normalizedUrl: plan.job.normalizedUrl,
    requestedBy: REQUESTED_BY,
    source: 'media_archive_source_import',
    sourceFormat: plan.job.sourceFormat,
    storagePath: plan.job.storagePath,
    sourceSha256: plan.job.sourceSha256,
    originalFilename: plan.job.originalFilename,
    mimeType: plan.job.mimeType,
    byteSize: plan.job.byteSize,
    pageCount: plan.job.pageCount,
    titleOverride: plan.job.titleOverride,
    authorOverride: plan.job.authorOverride,
    publishedAtOverride: plan.job.publishedAtOverride,
    languageOverride: plan.job.languageOverride,
  });

  const inline = skipProcess
    ? null
    : await processBrainRunInline({
        store,
        runId: queued.runId,
        maxJobs: 1,
        budgetMs: 90_000,
        workerId: REQUESTED_BY,
      });

  const verification = skipProcess
    ? null
    : await verify({
        store,
        record,
        plan,
        skipRetrieval: skipVerification,
      });

  const report = {
    status:
      skipProcess || verification?.ok
        ? skipProcess
          ? 'saved'
          : 'completed'
        : 'verification_failed',
    recordId: record.id,
    updated: true,
    pdf: {
      sourcePath: plan.pdf.sourcePath,
      sourceSha256: plan.pdf.sourceSha256,
      byteSize: plan.pdf.byteSize,
      pageCount: plan.pdf.pageCount,
    },
    text: {
      sourcePath: plan.text.sourcePath,
      sourceSha256: plan.text.sourceSha256,
      contentHash: plan.text.contentHash,
      byteSize: plan.text.byteSize,
      charCount: plan.text.charCount,
      wordCount: plan.text.wordCount,
      paragraphCount: plan.text.paragraphCount,
      chunkCount: plan.text.chunkCount,
    },
    diagnosticsBytes: plan.diagnosticsBytes,
    queue: {
      status: queued.status,
      runId: queued.runId,
      jobId: queued.job.id,
    },
    inline,
    verification,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!skipProcess && !verification?.ok) return 5;

  return 0;
}

const directRun = /import-media-archive-source\.(ts|js)$/.test(process.argv[1] || '');

if (directRun) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(
        '[media-archive-import] failed:',
        error instanceof Error ? error.message : error
      );
      process.exitCode = 1;
    });
}
