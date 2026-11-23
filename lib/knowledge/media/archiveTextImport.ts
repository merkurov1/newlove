import { chunkArticle } from '@/lib/knowledge/brain/chunk';
import {
  BrainSourceError,
  normalizePlainText,
  sha256Hex,
  sourcePathForStorage,
  validatePdfBuffer,
  validateTxtBuffer,
} from '@/lib/knowledge/brain/sourceValidation';
import { extractPlainTextDocument } from '@/lib/knowledge/brain/textExtract';
import { normalizeSourceUrl } from '@/lib/knowledge/brain/url';
import type { MediaArchivePatch, MediaArchiveRecord } from '@/lib/knowledge/brain/store';

import { normalizeMediaLanguage } from './classify';
import { evaluateMediaTextQuality } from './quality';

export const MEDIA_ARCHIVE_TEXT_IMPORT_VERSION = 'media-archive-proofread-text-v1';
export const MEDIA_ARCHIVE_DIAGNOSTICS_LIMIT = 8_000;

export type MediaArchiveSourceRecord = Pick<
  MediaArchiveRecord,
  | 'id'
  | 'url'
  | 'canonical_url'
  | 'title'
  | 'outlet'
  | 'author'
  | 'published_date'
  | 'lang'
  | 'ai_metadata'
>;

export type MediaArchiveTextPlanInput = {
  record: MediaArchiveSourceRecord;
  /** The unchanged original PDF. It is archived, not re-OCRed here. */
  pdf: Buffer;
  /** Proofread UTF-8 article text. Blank lines separate paragraphs. */
  text: string;
  pdfFilename?: string | null;
  textFilename?: string | null;
  pdfPageCount?: number | null;
  articlePageNumbers?: number[];
  issue?: {
    publication: string;
    number: number | string;
    year: number | string;
    publishedAt?: string | null;
    sourceUrl?: string | null;
  } | null;
  authorFallback?: string | null;
  ocrReviewNote?: string | null;
  now?: Date;
};

export type MediaArchiveTextPlan = {
  recordId: string;
  author: string | null;
  pdf: {
    filename: string | null;
    sourcePath: string;
    sourceSha256: string;
    byteSize: number;
    pageCount: number | null;
  };
  text: {
    filename: string | null;
    sourcePath: string;
    sourceSha256: string;
    contentHash: string;
    byteSize: number;
    charCount: number;
    wordCount: number;
    paragraphCount: number;
    chunkCount: number;
    quality: string;
  };
  diagnostics: Record<string, unknown>;
  diagnosticsBytes: number;
  patch: MediaArchivePatch;
  job: {
    inputUrl: string;
    normalizedUrl: string;
    sourceFormat: 'text';
    storagePath: string;
    sourceSha256: string;
    originalFilename: string | null;
    mimeType: 'text/plain';
    byteSize: number;
    pageCount: null;
    titleOverride: string;
    authorOverride: string | null;
    publishedAtOverride: string | null;
    languageOverride: string;
  };
};

function clean(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value
        .replace(/\u0000/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
}

function validDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizedArticleText(value: string): string {
  const normalized = normalizePlainText(value);

  if (!normalized) {
    throw new BrainSourceError('source_text_empty');
  }

  return normalized;
}

/**
 * Builds a deterministic, idempotent plan for attaching a proofread article to
 * an existing Media Archive row. The original PDF and the cleaned UTF-8 text are
 * both archived; the cleaned text is the source that Brain indexes.
 */
export function planMediaArchiveTextSource(input: MediaArchiveTextPlanInput): MediaArchiveTextPlan {
  const record = input.record;

  if (!record?.id) throw new Error('media_record_id_missing');
  if (!record.title?.trim()) throw new Error('media_record_title_missing');

  validatePdfBuffer(input.pdf, 'application/pdf');

  const textBytes = Buffer.from(input.text, 'utf8');
  const validatedText = validateTxtBuffer(textBytes, 'text/plain');
  const normalizedText = normalizedArticleText(validatedText.text);
  const textSha256 = sha256Hex(textBytes);
  const pdfSha256 = sha256Hex(input.pdf);

  const author =
    clean(record.author, 300) || clean(input.authorFallback, 300) || 'Антон (Палыч) Меркуров';
  const language = normalizeMediaLanguage(record.lang, 'RU');
  const publishedDate = validDate(record.published_date);
  const pdfPageCount =
    Number.isFinite(input.pdfPageCount) && Number(input.pdfPageCount) > 0
      ? Math.trunc(Number(input.pdfPageCount))
      : null;
  const articlePageNumbers = (input.articlePageNumbers || [])
    .map((page) => Math.trunc(Number(page)))
    .filter((page) => Number.isFinite(page) && page > 0);
  const now = (input.now || new Date()).toISOString();

  const textPath = sourcePathForStorage(textSha256, 'txt');
  const pdfPath = sourcePathForStorage(pdfSha256, 'pdf');
  const article = extractPlainTextDocument({
    kind: 'text',
    rawText: normalizedText,
    sourceSha256: textSha256,
    filename: input.textFilename || null,
    mimeType: 'text/plain',
    byteSize: textBytes.length,
    title: record.title,
    author,
    publishedAt: publishedDate,
    language,
  });
  const quality = evaluateMediaTextQuality(article);
  const chunking = chunkArticle(article, 'doc_media_preview', {
    sourceType: 'media_coverage',
  });
  const inputUrl = clean(record.url, 2048) || clean(record.canonical_url, 2048);
  const normalizedUrl = normalizeSourceUrl(record.canonical_url || inputUrl);

  const diagnostics: Record<string, unknown> = {
    quality: quality.quality,
    coverageStatus: quality.coverageStatus,
    extractionStatus: quality.extractionStatus,
    errorCode: quality.errorCode,
    charCount: article.charCount,
    wordCount: article.wordCount,
    paragraphCount: article.diagnostics.paragraphCount,
    chunkCount: chunking.chunks.length,
    languageDetected: article.language,
    paywallDetected: false,
    truncated: false,
    parser: MEDIA_ARCHIVE_TEXT_IMPORT_VERSION,
    fetchedBytes: textBytes.length,
    finalUrl: inputUrl || null,
    pageCount: pdfPageCount ?? (articlePageNumbers.length || null),
    skippedPages: [],
    sourceFormat: 'text',
    contentHash: article.contentHash,
    sourceSha256: textSha256,
    ocrReviewed: true,
    ocrReview: clean(input.ocrReviewNote, 500) || null,
    issue: input.issue
      ? {
          publication: clean(input.issue.publication, 120),
          number: String(input.issue.number).slice(0, 20),
          year: String(input.issue.year).slice(0, 10),
          publishedAt: validDate(input.issue.publishedAt),
          sourceUrl: clean(input.issue.sourceUrl, 2048) || null,
        }
      : null,
    originalPdf: {
      sourcePath: pdfPath,
      sourceSha256: pdfSha256,
      byteSize: input.pdf.length,
      pageCount: pdfPageCount,
      articlePages: articlePageNumbers,
    },
    textFile: input.textFilename || null,
    importedAt: now,
  };
  const diagnosticsBytes = Buffer.byteLength(JSON.stringify(diagnostics), 'utf8');

  if (diagnosticsBytes > MEDIA_ARCHIVE_DIAGNOSTICS_LIMIT) {
    throw new Error('media_archive_diagnostics_too_large');
  }

  const patch: MediaArchivePatch = {
    author: record.author || author || null,
    source_format: 'text',
    content_hash: article.contentHash,
    source_path: textPath,
    source_sha256: textSha256,
    extraction_diagnostics: diagnostics,
    indexing_status: 'pending',
    indexing_error: null,
    ai_metadata: {
      ...(record.ai_metadata || {}),
      reviewed: true,
      import_pending: false,
      source: 'media_archive_proofread_text',
      source_kind: 'text',
      source_format: 'text',
      source_path: textPath,
      source_sha256: textSha256,
      content_hash: article.contentHash,
      original_pdf_source_path: pdfPath,
      original_pdf_sha256: pdfSha256,
      original_pdf_page_count: pdfPageCount,
      article_pages: articlePageNumbers,
      extraction: diagnostics,
      extracted_at: now,
    },
  };

  return {
    recordId: record.id,
    author,
    pdf: {
      filename: input.pdfFilename || null,
      sourcePath: pdfPath,
      sourceSha256: pdfSha256,
      byteSize: input.pdf.length,
      pageCount: pdfPageCount,
    },
    text: {
      filename: input.textFilename || null,
      sourcePath: textPath,
      sourceSha256: textSha256,
      contentHash: article.contentHash,
      byteSize: textBytes.length,
      charCount: article.charCount,
      wordCount: article.wordCount,
      paragraphCount: article.diagnostics.paragraphCount,
      chunkCount: chunking.chunks.length,
      quality: quality.quality,
    },
    diagnostics,
    diagnosticsBytes,
    patch,
    job: {
      inputUrl,
      normalizedUrl,
      sourceFormat: 'text',
      storagePath: textPath,
      sourceSha256: textSha256,
      originalFilename: input.textFilename || null,
      mimeType: 'text/plain',
      byteSize: textBytes.length,
      pageCount: null,
      titleOverride: record.title.slice(0, 500),
      authorOverride: author,
      publishedAtOverride: publishedDate,
      languageOverride: language,
    },
  };
}
