import { createHash } from 'node:crypto';

import type { EmbeddingClient } from '@/lib/knowledge/rag/embeddings';
import {
  EmbeddingProviderError,
  EmbeddingTimeoutError,
  KnowledgeDatabaseError,
} from '@/lib/knowledge/rag/errors';
import type { KnowledgeChunkWithEmbedding } from '@/lib/knowledge/rag/types';
import {
  classifyMediaPublication,
  normalizeMediaLanguage,
  type MediaClassification,
} from '@/lib/knowledge/media/classify';
import {
  evaluateMediaFailure,
  evaluateMediaTextQuality,
  type MediaQualityAssessment,
  type MediaTextQuality,
} from '@/lib/knowledge/media/quality';

import {
  ARTICLE_CHUNKER_VERSION,
  ARTICLE_PARSER_VERSION,
  BRAIN_INGESTION_VERSION,
  chunkArticle,
} from './chunk';
import {
  extractArticle as defaultExtractArticle,
  ARTICLE_EXTRACTION_VERSION,
  type ExtractedArticle,
} from './extract';
import { extractPdfDocument } from './pdfExtract';
import { extractPlainTextDocument } from './textExtract';
import {
  BrainSourceError,
  decodeUtf8Strict,
  deriveFileDocumentId,
  normalizePublishedAt,
  sha256Hex,
  validatePdfBuffer,
  validateTxtBuffer,
} from './sourceValidation';
import { createBrainStorage, type BrainStorage } from './storage';
import type {
  BrainArticleDocumentRow,
  BrainJobRow,
  BrainJobStatus,
  BrainRunStatus,
  BrainSourceFormat,
  BrainSourceType,
  BrainStore,
  DuplicateMatch,
  MediaArchivePatch,
  MediaArchiveRecord,
  MediaCoverageDocumentRow,
  MediaCoverageMatch,
  MediaCoverageStatus,
  MediaCoverageStatusPatch,
} from './store';
import {
  BrainUrlError,
  fetchHtmlSafely as defaultFetchHtmlSafely,
  normalizeSourceUrl,
  type SafeFetchResult,
} from './url';

export type BrainProgress = {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  duplicate: number;
  partial: number;
  failed: number;
  cancelled: number;
  done: boolean;
};

export type ProcessNextResult =
  | {
      state: 'processed';
      job: BrainJobRow;
      progress: BrainProgress;
      runStatus: BrainRunStatus;
    }
  | {
      state: 'waiting';
      progress: BrainProgress;
      runStatus: BrainRunStatus;
      nextRetryAt: string | null;
    }
  | {
      state: 'done';
      progress: BrainProgress;
      runStatus: BrainRunStatus;
    }
  | {
      state: 'paused';
      progress: BrainProgress;
      runStatus: BrainRunStatus;
    };

export type ProcessNextOptions = {
  runId: string;
  store: BrainStore;
  embeddingClient: EmbeddingClient;
  workerId?: string;
  fetchArticle?: (url: string) => Promise<SafeFetchResult>;
  extractArticle?: (html: string, finalUrl: string) => ExtractedArticle;
  /** Optional preloaded archive record for media coverage jobs. */
  mediaRecord?: MediaArchiveRecord | null;
  /** Optional storage adapter, injectable for tests. */
  storage?: BrainStorage | null;
};

export const MEDIA_COVERAGE_INGESTION_VERSION = 'media-coverage-ingestion-v1';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function deriveArticleDocumentId(canonicalUrl: string): string {
  return `doc_article_${sha256(canonicalUrl).slice(0, 32)}`;
}

/**
 * Media coverage identity is the Media Archive UUID, not the URL. A canonical
 * URL can change; the record id is the stable source-of-truth key.
 */
export function deriveMediaCoverageDocumentId(mediaRecordId: string): string {
  const compact = mediaRecordId.trim().toLowerCase().replace(/-/g, '');

  if (!/^[a-f0-9]{32}$/.test(compact)) {
    throw new Error('media_record_id_invalid');
  }

  return `doc_media_${compact}`;
}

export function computeBrainProgress(jobs: BrainJobRow[]): BrainProgress {
  const counts: Record<BrainJobStatus, number> = {
    queued: 0,
    processing: 0,
    completed: 0,
    duplicate: 0,
    partial: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const job of jobs) {
    if (job.status in counts) counts[job.status] += 1;
  }

  return {
    total: jobs.length,
    ...counts,
    done: counts.queued === 0 && counts.processing === 0,
  };
}

export function retryDelaySeconds(attempts: number, random: number = Math.random()): number {
  const safeAttempts = Math.max(1, Math.trunc(attempts || 1));
  const base = Math.min(900, 15 * 2 ** (safeAttempts - 1));
  const jitter = 0.85 + Math.min(0.999, Math.max(0, random)) * 0.3;

  return Math.max(1, Math.min(900, Math.round(base * jitter)));
}

function isRetryable(error: unknown): boolean {
  if (error instanceof BrainSourceError) return error.retryable;

  if (error instanceof BrainUrlError) {
    return [
      'fetch_timeout',
      'fetch_failed',
      'dns_failed',
      'http_status_408',
      'http_status_425',
      'http_status_429',
      'http_status_500',
      'http_status_502',
      'http_status_503',
      'http_status_504',
    ].includes(error.code);
  }

  if (error instanceof EmbeddingTimeoutError) return true;

  if (error instanceof EmbeddingProviderError) {
    return (
      error.status === null || error.status === 408 || error.status === 429 || error.status >= 500
    );
  }

  if (error instanceof KnowledgeDatabaseError) return true;

  const message = error instanceof Error ? error.message : '';

  return (
    message.startsWith('brain_document_') ||
    message.startsWith('brain_chunks_') ||
    message.startsWith('brain_job_') ||
    message.startsWith('brain_run_')
  );
}

function errorCode(error: unknown): string {
  if (error instanceof BrainSourceError) return error.code;

  if (error instanceof BrainUrlError) return error.code;

  if (error instanceof EmbeddingTimeoutError) return 'embedding_timeout';

  if (error instanceof EmbeddingProviderError) {
    if (error.status === 401) return 'embedding_auth_failed';
    if (error.status === 402) return 'embedding_payment_required';
    return error.status === 429 ? 'embedding_rate_limited' : 'embedding_failed';
  }

  if (error instanceof KnowledgeDatabaseError) return 'database_failed';

  const message = error instanceof Error ? error.message : '';

  if (message.startsWith('brain_') || message.startsWith('media_')) return message;

  return 'ingestion_failed';
}

function safeErrorDetail(code: string): string {
  switch (code) {
    case 'fetch_timeout':
      return 'The page took too long to load.';
    case 'fetch_failed':
      return 'The page could not be fetched.';
    case 'dns_failed':
      return 'The hostname could not be resolved.';
    case 'unsupported_content_type':
      return 'The URL did not return an HTML page.';
    case 'response_too_large':
      return 'The page exceeded the ingest size limit.';
    case 'truncated_content':
      return 'The page exposed only a truncated article preview.';
    case 'needs_review':
      return 'Extraction requires operator review before it can be indexed.';
    case 'paywall_detected':
      return 'The source exposed only a paywalled or subscriber-only preview.';
    case 'metadata_only':
      return 'Only title and description were available; no article body was indexed.';
    case 'no_chunks':
      return 'The article body produced no indexable text chunks.';
    case 'media_record_missing':
      return 'The Media Archive record is missing from this job.';
    case 'media_record_not_found':
      return 'The Media Archive record no longer exists.';
    case 'media_record_archived':
      return 'The Media Archive record is archived and cannot be re-indexed.';
    case 'media_record_url_missing':
      return 'The Media Archive record has no usable publication URL.';
    case 'media_document_conflict':
      return 'An existing article document already uses this URL; manual review is required.';
    case 'brain_document_race_retry':
      return 'A concurrent import updated the same document; the job was queued for a safe retry.';
    case 'embedding_rate_limited':
      return 'The embedding provider rate-limited the request.';
    case 'embedding_auth_failed':
      return 'The embedding provider rejected the configured credentials.';
    case 'embedding_payment_required':
      return 'The embedding provider rejected the request for billing reasons.';
    case 'embedding_failed':
      return 'The embedding request failed.';
    case 'database_failed':
      return 'The knowledge database write failed.';
    case 'storage_not_configured':
      return 'Private source storage is not configured.';
    case 'storage_path_invalid':
    case 'storage_incoming_path_invalid':
      return 'The private source path is invalid.';
    case 'storage_download_failed':
    case 'storage_incoming_missing':
      return 'The original file could not be read from private storage.';
    case 'storage_hash_mismatch':
      return 'The stored file does not match its recorded SHA-256.';
    case 'storage_upload_failed':
    case 'storage_upload_url_failed':
      return 'The original file could not be written to private storage.';
    case 'brain_source_storage_missing':
      return 'This job has no private source file.';
    case 'pdf_signature_invalid':
      return 'The file is not a valid PDF.';
    case 'pdf_mime_invalid':
      return 'The file MIME type does not match PDF.';
    case 'txt_mime_invalid':
      return 'The file MIME type does not match plain text.';
    case 'pdf_empty':
      return 'The PDF is empty.';
    case 'pdf_no_text':
      return 'The PDF contains no usable text pages.';
    case 'pdf_ocr_required':
      return 'The PDF appears to be scanned or image-only. OCR is required before indexing.';
    case 'pdf_password_protected':
      return 'The PDF is password-protected and cannot be read.';
    case 'pdf_parse_failed':
      return 'The PDF is damaged or unsupported.';
    case 'pdf_text_too_large':
      return 'The PDF contains too much text for this ingestion path.';
    case 'txt_empty':
      return 'The text file is empty after normalization.';
    case 'txt_encoding_invalid':
      return 'The text file is not valid UTF-8.';
    case 'txt_binary_content':
      return 'The file contains binary content and is not a plain text file.';
    case 'source_text_empty':
      return 'The pasted text is empty.';
    case 'source_text_invalid':
      return 'The pasted text contains invalid binary characters.';
    case 'source_text_too_large':
    case 'txt_too_large':
    case 'pdf_too_large':
      return 'The source exceeds the allowed size for its type.';
    case 'source_title_too_long':
    case 'source_author_too_long':
    case 'source_language_invalid':
    case 'source_date_invalid':
      return 'The supplied metadata is invalid.';
    default:
      return code.startsWith('http_status_')
        ? `The page returned HTTP ${code.replace('http_status_', '')}.`
        : 'Ingestion failed.';
  }
}

function partialReason(article: ExtractedArticle): string {
  if (article.diagnostics.paywallDetected) return 'paywall_detected';
  if (article.diagnostics.truncated) return 'truncated_content';
  if (article.status === 'needs_review') return 'needs_review';
  if (article.wordCount < 120) return 'word_count_below_threshold';
  if (article.diagnostics.paragraphCount < 2) return 'too_few_paragraphs';
  if (article.charCount < 600) return 'text_too_short';
  return 'extraction_incomplete';
}

function extractionMetadata(
  article: ExtractedArticle,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    canonical_url: article.canonicalUrl,
    site_name: article.siteName,
    source_domain: article.sourceDomain,
    language: article.language,
    published_at: article.publishedAt,
    published_at_source: article.publishedAtSource,
    extraction_version: article.extractionVersion,
    parser_version: ARTICLE_PARSER_VERSION,
    chunker_version: ARTICLE_CHUNKER_VERSION,
    extraction_status: article.status,
    diagnostics: article.diagnostics,
    ...extra,
  };
}

type ExtractedSourceInfo = {
  sourceType: 'article' | 'pdf' | 'txt' | 'text';
  sourceFormat: BrainSourceFormat;
  sourcePath: string;
  sourceSha256: string;
  sourceUrl: string | null;
  canonicalUrl: string | null;
  normalizedUrl: string;
  originalFilename?: string | null;
  mimeType?: string | null;
  pageCount?: number | null;
  byteSize?: number | null;
};

function buildDocument(
  article: ExtractedArticle,
  job: BrainJobRow,
  documentId: string,
  embeddingClient: EmbeddingClient,
  chunkCount: number,
  sourceCharCount: number,
  previousContentHash: string | null,
  change: 'inserted' | 'updated',
  source: ExtractedSourceInfo
): BrainArticleDocumentRow {
  const sourcePath =
    source.sourcePath.length <= 500 ? source.sourcePath : `brain/source/${documentId}`;

  const manifestHash = sha256(
    JSON.stringify({
      sourceType: source.sourceType,
      sourceFormat: source.sourceFormat,
      sourceSha256: source.sourceSha256,
      contentHash: article.contentHash,
      parserVersion: ARTICLE_PARSER_VERSION,
      chunkerVersion: ARTICLE_CHUNKER_VERSION,
      extractionVersion: article.extractionVersion,
      chunkCount,
    })
  );

  return {
    id: documentId,
    title: article.title.slice(0, 200) || 'Untitled document',
    source_path: sourcePath,
    source_sha256: source.sourceSha256,
    manifest_hash: manifestHash,
    parser_version:
      article.sourceType === 'article' ? ARTICLE_PARSER_VERSION : article.extractionVersion,
    chunker_version: ARTICLE_CHUNKER_VERSION,
    ingestion_version: BRAIN_INGESTION_VERSION,
    embedding_model: embeddingClient.modelId,
    embedding_dimensions: embeddingClient.dimensions,
    access_class: 'owner',
    chunk_count: chunkCount,
    source_char_count: sourceCharCount,
    metadata: {
      ingestion_version: BRAIN_INGESTION_VERSION,
      extraction_version: article.extractionVersion,
      parser_version:
        article.sourceType === 'article' ? ARTICLE_PARSER_VERSION : article.extractionVersion,
      chunker_version: ARTICLE_CHUNKER_VERSION,
      source_type: source.sourceType,
      source_format: source.sourceFormat,
      source_path: source.sourcePath,
      source_sha256: source.sourceSha256,
      original_filename: source.originalFilename || null,
      mime_type: source.mimeType || null,
      page_count: source.pageCount ?? null,
      byte_size: source.byteSize ?? null,
      source_domain: article.sourceDomain,
      site_name: article.siteName,
      language: article.language,
      published_at: article.publishedAt,
      published_at_source: article.publishedAtSource,
      change,
      previous_content_hash: previousContentHash,
      extraction: article.diagnostics,
    },
    source_type: source.sourceType,
    source_format: source.sourceFormat,
    source_url: source.sourceUrl ? source.sourceUrl.slice(0, 2048) : null,
    canonical_url: source.canonicalUrl,
    normalized_url: source.normalizedUrl,
    content_hash: article.contentHash,
    language: article.language,
    author: article.author,
    published_at: article.publishedAt,
    extraction_status: article.status,
    ingestion_status: 'pending',
    processed_at: null,
    original_filename: source.originalFilename || null,
    mime_type: source.mimeType || null,
    page_count: source.pageCount ?? null,
  };
}

function applySourceOverrides(article: ExtractedArticle, job: BrainJobRow): void {
  if (job.title_override) article.title = job.title_override.slice(0, 200);
  if (job.author_override !== null && job.author_override !== undefined) {
    article.author = job.author_override.slice(0, 300);
  }
  if (job.published_at_override) {
    try {
      article.publishedAt = normalizePublishedAt(job.published_at_override);
      article.publishedAtSource = article.publishedAt ? 'metadata' : null;
    } catch {
      // The job was validated at enqueue time; keep automatic metadata if a
      // legacy row contains an invalid override.
    }
  }
  if (job.language_override) article.language = job.language_override.slice(0, 16);
}

async function indexExtractedDocument(input: {
  store: BrainStore;
  job: BrainJobRow;
  article: ExtractedArticle;
  documentId: string;
  existing: DuplicateMatch | null;
  source: ExtractedSourceInfo;
  embeddingClient: EmbeddingClient;
  setStage: (stage: string) => Promise<void>;
}): Promise<'completed' | 'duplicate' | 'failed'> {
  const { store, job, article, documentId, existing, source, embeddingClient, setStage } = input;
  const change: 'inserted' | 'updated' = existing ? 'updated' : 'inserted';
  const previousContentHash = existing?.contentHash ?? null;
  const chunking = chunkArticle(article, documentId, { sourceType: source.sourceType });

  if (chunking.chunks.length === 0) {
    await store.updateJob(job.id, {
      status: 'failed',
      canonical_url: source.canonicalUrl,
      final_url: source.sourceUrl ? source.sourceUrl.slice(0, 2048) : null,
      title: article.title,
      language: article.language,
      content_hash: article.contentHash,
      extraction_status: article.status,
      extraction_metadata: extractionMetadata(article, {
        stage: 'done',
        reason: 'no_chunks',
        existing_document_preserved: Boolean(existing),
        source_type: source.sourceType,
        source_format: source.sourceFormat,
      }),
      error_code: 'no_chunks',
      error_detail: 'The document produced no indexable chunks.',
      retry_after: null,
      processed_at: new Date().toISOString(),
      locked_at: null,
      worker_id: null,
    });
    return 'failed';
  }

  const embeddingInputs = chunking.chunks.map((chunk) => {
    const path = chunk.sectionPath.join(' / ');
    return path ? `${path}\n\n${chunk.content}` : chunk.content;
  });

  await setStage('embedding');
  const embeddings = await embeddingClient.embed(embeddingInputs);

  if (embeddings.length !== chunking.chunks.length) {
    throw new Error('embedding_count_mismatch');
  }

  const document = buildDocument(
    article,
    job,
    documentId,
    embeddingClient,
    chunking.chunks.length,
    chunking.documentText.length,
    previousContentHash,
    change,
    source
  );

  await setStage('storing');

  const insertResult = existing
    ? (await store.updateArticleDocument(document), { status: 'inserted' as const })
    : await store.insertArticleDocument(document);

  if (insertResult.status === 'duplicate') {
    throw new Error('brain_document_race_retry');
  }

  const chunkRows: KnowledgeChunkWithEmbedding[] = chunking.chunks.map((chunk, index) => ({
    id: chunk.id,
    document_id: documentId,
    chunk_index: chunk.chunkIndex,
    content: chunk.content,
    content_hash: chunk.contentHash,
    heading: chunk.heading,
    section_path: chunk.sectionPath,
    section_index: chunk.sectionIndex,
    char_start: chunk.charStart,
    char_end: chunk.charEnd,
    line_start: chunk.lineStart,
    line_end: chunk.lineEnd,
    embedding_model: embeddingClient.modelId,
    embedding_dimensions: embeddingClient.dimensions,
    access_class: 'owner',
    metadata: chunk.metadata,
    embedding: embeddings[index],
  }));

  await store.insertArticleChunks(chunkRows);
  await store.deleteArticleChunksExcept(
    documentId,
    chunking.chunks.map((chunk) => chunk.id)
  );
  await store.completeArticleDocument(documentId, article.status);

  await store.updateJob(job.id, {
    status: 'completed',
    canonical_url: source.canonicalUrl,
    final_url: source.sourceUrl ? source.sourceUrl.slice(0, 2048) : null,
    document_id: documentId,
    title: article.title,
    language: article.language,
    content_hash: article.contentHash,
    extraction_status: article.status,
    extraction_metadata: extractionMetadata(article, {
      stage: 'done',
      chunks: chunking.chunks.length,
      change,
      previous_content_hash: previousContentHash,
      source_type: source.sourceType,
      source_format: source.sourceFormat,
      page_count: source.pageCount ?? null,
    }),
    error_code: null,
    error_detail:
      change === 'updated'
        ? 'Existing logical document updated because its content changed.'
        : null,
    retry_after: null,
    processed_at: new Date().toISOString(),
    locked_at: null,
    worker_id: null,
  });

  return 'completed';
}

type MediaCoverageFailure = MediaQualityAssessment;

function mediaArchiveDate(mediaRecord: MediaArchiveRecord): string | null {
  const value = mediaRecord.published_date?.trim().slice(0, 10) || '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function mediaPublishedAt(
  mediaRecord: MediaArchiveRecord,
  article?: ExtractedArticle
): string | null {
  const date = mediaArchiveDate(mediaRecord);
  return date ? `${date}T00:00:00.000Z` : (article?.publishedAt ?? null);
}

function canonicalKey(value: string): string {
  try {
    return normalizeSourceUrl(value);
  } catch {
    return value.trim();
  }
}

function mediaDiagnostics(
  article: ExtractedArticle | null,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  if (!article) {
    return {
      extraction_version: ARTICLE_EXTRACTION_VERSION,
      parser_version: ARTICLE_PARSER_VERSION,
      chunker_version: ARTICLE_CHUNKER_VERSION,
      ...extra,
    };
  }

  return extractionMetadata(article, extra);
}

function buildMediaCoverageDocument(input: {
  article: ExtractedArticle;
  job: BrainJobRow;
  mediaRecord: MediaArchiveRecord;
  documentId: string;
  embeddingClient: EmbeddingClient;
  chunkCount: number;
  sourceCharCount: number;
  previousContentHash: string | null;
  change: 'inserted' | 'updated';
  quality: MediaQualityAssessment;
}): MediaCoverageDocumentRow {
  const { article, job, mediaRecord, documentId, embeddingClient, quality } = input;
  const archiveCanonical = mediaRecord.canonical_url?.trim() || article.canonicalUrl;
  const archiveDate = mediaArchiveDate(mediaRecord);
  const publishedAt = mediaPublishedAt(mediaRecord, article);
  const sourcePath =
    job.storage_path && job.storage_path.length <= 500
      ? job.storage_path
      : archiveCanonical.length <= 500
        ? archiveCanonical
        : `media/${mediaRecord.id}`;
  const diagnostics = mediaDiagnostics(article, {
    stage: 'done',
    change: input.change,
    previous_content_hash: input.previousContentHash,
    archive_canonical_url: archiveCanonical,
    extracted_canonical_url: article.canonicalUrl,
    canonical_mismatch: canonicalKey(archiveCanonical) !== canonicalKey(article.canonicalUrl),
  });

  const manifestHash = sha256(
    JSON.stringify({
      mediaRecordId: mediaRecord.id,
      canonicalUrl: archiveCanonical,
      contentHash: article.contentHash,
      parserVersion: ARTICLE_PARSER_VERSION,
      chunkerVersion: ARTICLE_CHUNKER_VERSION,
      extractionVersion: ARTICLE_EXTRACTION_VERSION,
      chunkCount: input.chunkCount,
    })
  );

  return {
    id: documentId,
    title: (mediaRecord.title || article.title).slice(0, 200) || 'Untitled media coverage',
    source_path: sourcePath,
    source_sha256: job.source_sha256 || article.contentHash,
    source_format: job.source_format || 'url',
    original_filename: job.original_filename || null,
    mime_type: job.mime_type || null,
    page_count: job.page_count ?? article.diagnostics.file?.pageCount ?? null,
    manifest_hash: manifestHash,
    parser_version: ARTICLE_PARSER_VERSION,
    chunker_version: ARTICLE_CHUNKER_VERSION,
    ingestion_version: MEDIA_COVERAGE_INGESTION_VERSION,
    embedding_model: embeddingClient.modelId,
    embedding_dimensions: embeddingClient.dimensions,
    access_class: 'owner',
    chunk_count: input.chunkCount,
    source_char_count: input.sourceCharCount,
    metadata: {
      ingestion_version: MEDIA_COVERAGE_INGESTION_VERSION,
      extraction_version: ARTICLE_EXTRACTION_VERSION,
      parser_version: ARTICLE_PARSER_VERSION,
      chunker_version: ARTICLE_CHUNKER_VERSION,
      source_type: 'media_coverage',
      source_format: job.source_format || 'url',
      source_path: sourcePath,
      source_sha256: job.source_sha256 || article.contentHash,
      original_filename: job.original_filename || null,
      mime_type: job.mime_type || null,
      page_count: job.page_count ?? article.diagnostics.file?.pageCount ?? null,
      media_record_id: mediaRecord.id,
      archive_title: mediaRecord.title,
      extracted_title: article.title,
      outlet: mediaRecord.outlet,
      kind: mediaRecord.kind,
      topic: mediaRecord.topic,
      archive_language: mediaRecord.lang,
      detected_language: article.language,
      archive_published_date: archiveDate,
      published_at_source: article.publishedAtSource,
      source_domain: article.sourceDomain,
      site_name: article.siteName,
      content_origin: quality.quality === 'partial_text' ? 'partial_text' : 'full_text',
      text_quality: quality.quality,
      canonical_mismatch: canonicalKey(archiveCanonical) !== canonicalKey(article.canonicalUrl),
      change: input.change,
      previous_content_hash: input.previousContentHash,
      extraction: article.diagnostics,
    },
    source_type: 'media_coverage',
    source_url: (mediaRecord.url || mediaRecord.canonical_url).slice(0, 2048),
    canonical_url: archiveCanonical,
    normalized_url: job.normalized_url,
    content_hash: article.contentHash,
    language: article.language,
    author: mediaRecord.author || article.author,
    published_at: publishedAt,
    extraction_status: quality.extractionStatus,
    ingestion_status: 'pending',
    processed_at: new Date().toISOString(),
    media_record_id: mediaRecord.id,
    media_outlet: mediaRecord.outlet.slice(0, 300),
    media_kind: mediaRecord.kind.slice(0, 60),
    media_topic: mediaRecord.topic.slice(0, 120),
    media_language: mediaRecord.lang.slice(0, 16),
    media_published_date: archiveDate,
    media_archive_status: mediaRecord.status.slice(0, 40),
    media_coverage_status: quality.coverageStatus,
    media_text_quality: quality.quality,
    media_coverage_method: ARTICLE_EXTRACTION_VERSION,
    media_coverage_error_code: quality.errorCode,
    media_coverage_error_detail: quality.errorCode ? safeErrorDetail(quality.errorCode) : null,
    media_coverage_diagnostics: diagnostics,
  };
}

function buildMediaPlaceholderDocument(input: {
  job: BrainJobRow;
  mediaRecord: MediaArchiveRecord;
  documentId: string;
  embeddingClient: EmbeddingClient;
  status: Exclude<MediaCoverageStatus, 'completed'>;
  textQuality?: MediaTextQuality | null;
  errorCode: string | null;
  errorDetail?: string | null;
  diagnostics?: Record<string, unknown>;
}): MediaCoverageDocumentRow {
  const { job, mediaRecord, documentId, embeddingClient, status } = input;
  const canonical = mediaRecord.canonical_url?.trim() || job.normalized_url;
  const archiveDate = mediaArchiveDate(mediaRecord);
  const emptyHash = sha256('');
  const extractionStatus =
    status === 'blocked'
      ? 'blocked'
      : status === 'partial'
        ? 'partial'
        : status === 'failed'
          ? 'failed'
          : null;
  const diagnostics = {
    stage: status,
    error_code: input.errorCode,
    ...(input.diagnostics || {}),
    content_origin: 'none',
  };
  const manifestHash = sha256(
    JSON.stringify({
      mediaRecordId: mediaRecord.id,
      canonicalUrl: canonical,
      status,
      errorCode: input.errorCode,
      parserVersion: ARTICLE_PARSER_VERSION,
      chunkerVersion: ARTICLE_CHUNKER_VERSION,
    })
  );

  return {
    id: documentId,
    title: (mediaRecord.title || 'Untitled media coverage').slice(0, 200),
    source_path:
      job.storage_path && job.storage_path.length <= 500
        ? job.storage_path
        : canonical.length <= 500
          ? canonical
          : `media/${mediaRecord.id}`,
    source_sha256: job.source_sha256 || emptyHash,
    source_format: job.source_format || 'url',
    original_filename: job.original_filename || null,
    mime_type: job.mime_type || null,
    page_count: job.page_count ?? null,
    manifest_hash: manifestHash,
    parser_version: ARTICLE_PARSER_VERSION,
    chunker_version: ARTICLE_CHUNKER_VERSION,
    ingestion_version: MEDIA_COVERAGE_INGESTION_VERSION,
    embedding_model: embeddingClient.modelId,
    embedding_dimensions: embeddingClient.dimensions,
    access_class: 'owner',
    chunk_count: 0,
    source_char_count: 0,
    metadata: {
      ingestion_version: MEDIA_COVERAGE_INGESTION_VERSION,
      source_type: 'media_coverage',
      source_format: job.source_format || 'url',
      source_path: job.storage_path || canonical,
      source_sha256: job.source_sha256 || emptyHash,
      original_filename: job.original_filename || null,
      mime_type: job.mime_type || null,
      page_count: job.page_count ?? null,
      media_record_id: mediaRecord.id,
      archive_title: mediaRecord.title,
      outlet: mediaRecord.outlet,
      kind: mediaRecord.kind,
      topic: mediaRecord.topic,
      archive_language: mediaRecord.lang,
      archive_published_date: archiveDate,
      content_origin: 'none',
      coverage_status: status,
      error_code: input.errorCode,
    },
    source_type: 'media_coverage',
    source_url: (mediaRecord.url || mediaRecord.canonical_url).slice(0, 2048),
    canonical_url: canonical,
    normalized_url: job.normalized_url,
    content_hash: null,
    language: null,
    author: null,
    published_at: mediaPublishedAt(mediaRecord),
    extraction_status: extractionStatus || 'pending',
    ingestion_status: 'pending',
    processed_at: status === 'pending' || status === 'processing' ? null : new Date().toISOString(),
    media_record_id: mediaRecord.id,
    media_outlet: mediaRecord.outlet.slice(0, 300),
    media_kind: mediaRecord.kind.slice(0, 60),
    media_topic: mediaRecord.topic.slice(0, 120),
    media_language: mediaRecord.lang.slice(0, 16),
    media_published_date: archiveDate,
    media_archive_status: mediaRecord.status.slice(0, 40),
    media_coverage_status: status,
    media_text_quality: input.textQuality ?? null,
    media_coverage_method: null,
    media_coverage_error_code: input.errorCode,
    media_coverage_error_detail: input.errorDetail ?? null,
    media_coverage_diagnostics: diagnostics,
  };
}

function mediaMetadataPatch(
  mediaRecord: MediaArchiveRecord,
  job: BrainJobRow,
  article: ExtractedArticle | null
) {
  const archiveDate = mediaArchiveDate(mediaRecord);
  const effectivePublishedAt = mediaPublishedAt(mediaRecord, article ?? undefined);

  return {
    title: (mediaRecord.title || 'Untitled media coverage').slice(0, 200),
    source_url: (mediaRecord.url || mediaRecord.canonical_url).slice(0, 2048),
    canonical_url: mediaRecord.canonical_url,
    normalized_url: job.normalized_url,
    media_outlet: mediaRecord.outlet.slice(0, 300),
    media_kind: mediaRecord.kind.slice(0, 60),
    media_topic: mediaRecord.topic.slice(0, 120),
    media_language: mediaRecord.lang.slice(0, 16),
    media_published_date: archiveDate,
    media_archive_status: mediaRecord.status.slice(0, 40),
    ...(effectivePublishedAt ? { published_at: effectivePublishedAt } : {}),
    ...(article ? { language: article.language } : {}),
  };
}

async function hydrateMediaRecord(input: {
  store: BrainStore;
  mediaRecord: MediaArchiveRecord;
  article: ExtractedArticle;
  quality: MediaQualityAssessment;
  classification: MediaClassification | null;
  chunkCount?: number;
}): Promise<{ mediaRecord: MediaArchiveRecord; canonicalConflictId: string | null }> {
  const { store, mediaRecord, article, quality, classification } = input;
  const shouldHydrate =
    mediaRecord.ai_metadata?.import_pending === true || mediaRecord.ai_metadata?.reviewed !== true;

  const nextCanonical = canonicalKey(article.canonicalUrl) || mediaRecord.canonical_url;
  let canonicalConflictId: string | null = null;

  if (nextCanonical && canonicalKey(nextCanonical) !== canonicalKey(mediaRecord.canonical_url)) {
    const existing = await store.findMediaRecordByUrl(nextCanonical, nextCanonical);

    if (existing && existing.id !== mediaRecord.id) {
      canonicalConflictId = existing.id;
    }
  }

  const patch: MediaArchivePatch = {};
  const aiMetadata = { ...(mediaRecord.ai_metadata || {}) };

  if (shouldHydrate) {
    patch.title = (article.title || mediaRecord.title).slice(0, 500);
    patch.outlet = (article.siteName || mediaRecord.outlet).slice(0, 300);
    const articleDate = article.publishedAt?.slice(0, 10) || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(articleDate)) patch.published_date = articleDate;
    patch.lang = normalizeMediaLanguage(
      classification?.lang || article.language,
      normalizeMediaLanguage(mediaRecord.lang)
    );
    patch.kind = classification?.kind || mediaRecord.kind;
    patch.topic = classification?.topic || mediaRecord.topic;
    patch.summary = (article.description || mediaRecord.summary || '').slice(0, 2000);
    patch.image_url = article.imageUrl ?? mediaRecord.image_url;
  }

  if (!canonicalConflictId && nextCanonical) {
    patch.canonical_url = nextCanonical;
  }

  patch.ai_metadata = {
    ...aiMetadata,
    import_pending: false,
    last_processed_at: new Date().toISOString(),
    extraction_status: quality.extractionStatus,
    text_quality: quality.quality,
    coverage_status: quality.coverageStatus,
    char_count: article.charCount,
    word_count: article.wordCount,
    chunk_count: input.chunkCount ?? Number(aiMetadata.chunk_count || 0),
    detected_language: article.language,
    classification_model: classification?.model ?? null,
    classification_error: classification?.error ?? null,
    canonical_conflict_with: canonicalConflictId,
    canonical_mismatch:
      canonicalKey(mediaRecord.canonical_url) !== canonicalKey(article.canonicalUrl),
    paywall_detected: article.diagnostics.paywallDetected,
    truncated: article.diagnostics.truncated,
    source_domain: article.sourceDomain,
  };

  await store.updateMediaRecord(mediaRecord.id, patch);

  return {
    mediaRecord: {
      ...mediaRecord,
      ...patch,
      ai_metadata: patch.ai_metadata,
    } as MediaArchiveRecord,
    canonicalConflictId,
  };
}

async function markMediaNotIndexed(input: {
  store: BrainStore;
  job: BrainJobRow;
  mediaRecord: MediaArchiveRecord;
  article: ExtractedArticle | null;
  documentId: string | null;
  failure: MediaCoverageFailure;
  preserveExisting: boolean;
}): Promise<void> {
  const { store, job, mediaRecord, article, failure } = input;
  const now = new Date().toISOString();
  const diagnostics = mediaDiagnostics(article, {
    stage: 'done',
    reason: failure.errorCode,
    coverage_status: failure.coverageStatus,
    existing_document_preserved: input.preserveExisting,
  });

  if (input.documentId) {
    await store.updateMediaCoverageMetadata(
      input.documentId,
      mediaMetadataPatch(mediaRecord, job, article)
    );

    const patch: MediaCoverageStatusPatch = {
      media_coverage_status: failure.coverageStatus,
      extraction_status: failure.extractionStatus,
      media_coverage_method: article ? ARTICLE_EXTRACTION_VERSION : null,
      media_coverage_error_code: failure.errorCode,
      media_coverage_error_detail: failure.errorCode ? safeErrorDetail(failure.errorCode) : null,
      media_coverage_diagnostics: diagnostics,
      processed_at: now,
    };

    // A previously indexed document keeps its chunks and stays searchable.
    // Only a placeholder with no indexed content gets zeroed counters.
    if (!input.preserveExisting) {
      patch.ingestion_status = 'pending';
      patch.media_text_quality = failure.quality;
      patch.content_hash = null;
      patch.chunk_count = 0;
      patch.source_char_count = 0;
    }

    await store.setMediaCoverageStatus(input.documentId, patch);
  }

  await store.updateJob(job.id, {
    status: failure.jobStatus,
    document_id: input.documentId,
    title: mediaRecord.title,
    canonical_url: mediaRecord.canonical_url,
    final_url: article?.url.slice(0, 2048) ?? null,
    language: article?.language ?? null,
    content_hash: article?.contentHash ?? null,
    extraction_status: failure.extractionStatus,
    extraction_metadata: diagnostics,
    error_code: failure.errorCode,
    error_detail: failure.errorCode ? safeErrorDetail(failure.errorCode) : null,
    retry_after: null,
    processed_at: now,
    locked_at: null,
    worker_id: null,
  });
}

async function markMediaDuplicate(input: {
  store: BrainStore;
  job: BrainJobRow;
  mediaRecord: MediaArchiveRecord;
  article: ExtractedArticle;
  documentId: string;
  quality: MediaQualityAssessment;
  existingQuality: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const keepFullText = input.existingQuality === 'full_text';
  const quality = keepFullText ? 'full_text' : input.quality.quality;
  const coverageStatus = quality === 'full_text' ? 'completed' : input.quality.coverageStatus;
  const extractionStatus = quality === 'full_text' ? 'complete' : input.quality.extractionStatus;
  const errorCode = quality === 'full_text' ? null : input.quality.errorCode;

  await input.store.updateMediaCoverageMetadata(
    input.documentId,
    mediaMetadataPatch(input.mediaRecord, input.job, input.article)
  );

  await input.store.setMediaCoverageStatus(input.documentId, {
    media_coverage_status: coverageStatus,
    media_text_quality: quality,
    extraction_status: extractionStatus,
    ingestion_status: 'completed',
    media_coverage_method: ARTICLE_EXTRACTION_VERSION,
    media_coverage_error_code: errorCode,
    media_coverage_error_detail: errorCode ? safeErrorDetail(errorCode) : null,
    media_coverage_diagnostics: mediaDiagnostics(input.article, {
      stage: 'done',
      duplicate_reason: 'unchanged_content',
      unchanged: true,
      text_quality: quality,
    }),
    content_hash: input.article.contentHash,
    processed_at: now,
  });

  await input.store.updateJob(input.job.id, {
    status: 'duplicate',
    document_id: input.documentId,
    title: input.mediaRecord.title,
    canonical_url: input.mediaRecord.canonical_url,
    final_url: input.article.url.slice(0, 2048),
    language: input.article.language,
    content_hash: input.article.contentHash,
    extraction_status: extractionStatus,
    extraction_metadata: mediaDiagnostics(input.article, {
      stage: 'done',
      duplicate_reason: 'unchanged_content',
      unchanged: true,
      text_quality: quality,
    }),
    error_code: errorCode,
    error_detail: errorCode
      ? safeErrorDetail(errorCode)
      : 'This media publication is already indexed with identical content.',
    retry_after: null,
    processed_at: now,
    locked_at: null,
    worker_id: null,
  });
}

async function markDuplicate(
  store: BrainStore,
  job: BrainJobRow,
  documentId: string,
  title: string | null,
  canonicalUrl: string | null,
  contentHash: string | null,
  options: { reason?: string; article?: ExtractedArticle } = {}
): Promise<void> {
  await store.updateJob(job.id, {
    status: 'duplicate',
    document_id: documentId,
    title,
    canonical_url: canonicalUrl,
    content_hash: contentHash,
    final_url: options.article?.url.slice(0, 2048) ?? null,
    extraction_status: options.article?.status ?? null,
    extraction_metadata: options.article
      ? extractionMetadata(options.article, {
          stage: 'done',
          duplicate_reason: options.reason ?? 'identical_content',
        })
      : { stage: 'done', duplicate_reason: options.reason ?? 'identical_content' },
    error_code: null,
    error_detail:
      options.reason === 'same_url'
        ? 'This URL is already indexed with identical content.'
        : 'An existing Brain document already contains this article.',
    retry_after: null,
    processed_at: new Date().toISOString(),
    locked_at: null,
    worker_id: null,
  });
}

async function markNotIndexed(
  store: BrainStore,
  job: BrainJobRow,
  article: ExtractedArticle,
  existingDocumentId: string | null
): Promise<void> {
  const status = article.status === 'failed' ? 'failed' : 'partial';
  const reason = partialReason(article);

  await store.updateJob(job.id, {
    status,
    document_id: existingDocumentId,
    canonical_url: article.canonicalUrl,
    final_url: article.url.slice(0, 2048),
    title: article.title,
    language: article.language,
    content_hash: article.contentHash,
    extraction_status: article.status,
    extraction_metadata: extractionMetadata(article, {
      stage: 'done',
      reason,
      existing_document_preserved: Boolean(existingDocumentId),
    }),
    error_code: article.status === 'needs_review' ? 'needs_review' : reason,
    error_detail:
      article.status === 'needs_review'
        ? 'Extraction requires operator review before it can be indexed.'
        : existingDocumentId
          ? 'Extraction was incomplete; the existing indexed document was preserved.'
          : 'Extraction was incomplete and was not indexed.',
    retry_after: null,
    processed_at: new Date().toISOString(),
    locked_at: null,
    worker_id: null,
  });
}

async function finalizeRun(
  store: BrainStore,
  runId: string,
  jobs: BrainJobRow[]
): Promise<{ progress: BrainProgress; runStatus: BrainRunStatus }> {
  const progress = computeBrainProgress(jobs);
  const run = await store.getRun(runId);

  if (!run) throw new Error('brain_run_query_failed');

  let runStatus: BrainRunStatus = run.status;

  if (run.status === 'paused' || run.status === 'cancelled') {
    return { progress, runStatus };
  }

  if (progress.done) {
    runStatus = progress.failed + progress.partial > 0 ? 'completed_with_errors' : 'completed';

    await store.updateRun(runId, {
      status: runStatus,
      completed_at: new Date().toISOString(),
    });
  } else {
    runStatus = 'running';

    if (run.status !== 'running') {
      await store.updateRun(runId, {
        status: 'running',
        completed_at: null,
      });
    }
  }

  return { progress, runStatus };
}

/**
 * Processes one queued job for a run. One HTTP request handles one article so
 * a browser close or serverless timeout cannot lose the whole batch. The queue
 * row is claimed atomically and can be resumed later.
 */
export async function processNextBrainJob(options: ProcessNextOptions): Promise<ProcessNextResult> {
  const { store, runId } = options;
  const run = await store.getRun(runId);

  if (!run) throw new Error('brain_run_not_found');

  await store.reclaimStaleJobs(runId);

  let jobs = await store.getJobs(runId);
  let progress = computeBrainProgress(jobs);

  if (run.status === 'paused' || run.status === 'cancelled') {
    return { state: 'paused', progress, runStatus: run.status };
  }

  const workerId = options.workerId || `brain-${Date.now()}`;
  const job = await store.claimNextJob(runId, workerId);

  if (!job) {
    jobs = await store.getJobs(runId);
    progress = computeBrainProgress(jobs);

    if (progress.done) {
      const finalized = await finalizeRun(store, runId, jobs);
      return { state: 'done', ...finalized };
    }

    const nextRetryAt =
      jobs
        .filter((entry) => entry.status === 'queued' && entry.retry_after)
        .map((entry) => entry.retry_after as string)
        .sort()[0] ?? null;

    return {
      state: 'waiting',
      progress,
      runStatus: run.status,
      nextRetryAt,
    };
  }

  const fetchArticle =
    options.fetchArticle ??
    ((url: string) =>
      defaultFetchHtmlSafely(url, {
        timeoutMs: 20_000,
        maxBytes: 3_000_000,
        maxRedirects: 5,
      }));

  const extract = options.extractArticle ?? defaultExtractArticle;

  const setStage = async (stage: string): Promise<void> => {
    job.extraction_metadata = { ...job.extraction_metadata, stage };
    await store.updateJob(job.id, { extraction_metadata: job.extraction_metadata });
    await store.heartbeatJob?.(job.id, workerId)?.catch(() => undefined);
  };

  const sourceType: BrainSourceType =
    job.source_type === 'media_coverage' ||
    job.source_type === 'pdf' ||
    job.source_type === 'txt' ||
    job.source_type === 'text'
      ? job.source_type
      : 'article';
  let mediaRecord: MediaArchiveRecord | null = options.mediaRecord ?? null;
  let mediaDocumentId: string | null = null;
  let extractedArticle: ExtractedArticle | null = null;
  let linkedExisting = false;

  try {
    let known: Awaited<ReturnType<BrainStore['findDuplicate']>> = null;
    let existingMedia: MediaCoverageMatch | null = null;

    if (sourceType === 'media_coverage') {
      if (!job.media_record_id) throw new Error('media_record_missing');
      if (!mediaRecord) mediaRecord = await store.getMediaRecord(job.media_record_id);
      if (!mediaRecord) throw new Error('media_record_not_found');
      if (mediaRecord.status === 'archived') throw new Error('media_record_archived');
      if (!mediaRecord.canonical_url) {
        throw new Error('media_record_url_missing');
      }

      // Keep the archive canonical URL exactly as stored: it is the
      // bibliographic source of truth. The job's normalized URL is only used
      // for duplicate detection.
      const archiveCanonical = mediaRecord.canonical_url.trim();

      if (!archiveCanonical || archiveCanonical.length > 2048) {
        throw new Error('media_record_url_missing');
      }

      existingMedia = await store.findMediaCoverageDocument({
        mediaRecordId: mediaRecord.id,
        normalizedUrl: job.normalized_url,
        canonicalUrl: archiveCanonical,
      });

      if (
        existingMedia &&
        existingMedia.sourceType !== 'media_coverage' &&
        !(job.storage_path && job.source_sha256)
      ) {
        // Legacy URL jobs may reuse the article document. New source-based
        // jobs (captured HTML, manual text, PDF, TXT) must re-index the
        // existing document instead of silently keeping its old content.
        const linked = await store.linkArticleDocumentToMedia(
          existingMedia.documentId,
          mediaRecord
        );

        if (!linked) throw new Error('media_document_conflict');

        const now = new Date().toISOString();
        await store.updateJob(job.id, {
          status: 'completed',
          document_id: existingMedia.documentId,
          title: mediaRecord.title,
          canonical_url: mediaRecord.canonical_url,
          content_hash: existingMedia.contentHash,
          extraction_status: existingMedia.extractionStatus || 'complete',
          extraction_metadata: {
            stage: 'done',
            linked_existing_article: true,
          },
          error_code: null,
          error_detail: 'Linked existing article document; no duplicate created.',
          retry_after: null,
          processed_at: now,
          locked_at: null,
          worker_id: null,
        });
        linkedExisting = true;
      }

      if (existingMedia) {
        mediaDocumentId = existingMedia.documentId;
        await setStage('processing');
        await store.setMediaCoverageStatus(mediaDocumentId, {
          media_coverage_status: 'processing',
          extraction_status:
            existingMedia.ingestionStatus === 'completed' ? 'complete' : 'processing',
          media_coverage_error_code: null,
          media_coverage_error_detail: null,
          media_coverage_diagnostics: { stage: 'processing' },
        });
      } else {
        const documentId = deriveMediaCoverageDocumentId(mediaRecord.id);
        const placeholder = buildMediaPlaceholderDocument({
          job,
          mediaRecord,
          documentId,
          embeddingClient: options.embeddingClient,
          status: 'processing',
          errorCode: null,
          diagnostics: { stage: 'processing' },
        });
        const inserted = await store.insertMediaCoverageDocument(placeholder);

        if (inserted.status === 'duplicate') {
          const match = await store.findMediaCoverageDocument({
            mediaRecordId: mediaRecord.id,
            normalizedUrl: job.normalized_url,
            canonicalUrl: archiveCanonical,
          });

          if (!match || match.sourceType !== 'media_coverage') {
            throw new Error('media_document_conflict');
          }

          existingMedia = match;
          mediaDocumentId = match.documentId;
        } else {
          mediaDocumentId = documentId;
        }
      }
    } else {
      known = await store.findDuplicate({ normalizedUrl: job.normalized_url });
    }

    if (linkedExisting) {
      jobs = await store.getJobs(runId);
      const finalized = await finalizeRun(store, runId, jobs);
      const processed = jobs.find((entry) => entry.id === job.id) || job;

      return {
        state: 'processed',
        job: processed,
        progress: finalized.progress,
        runStatus: finalized.runStatus,
      };
    }

    let fetched: SafeFetchResult | null = null;
    let article: ExtractedArticle;
    let canonicalUrl: string;

    if (
      sourceType === 'article' ||
      (sourceType === 'media_coverage' && !job.storage_path)
    ) {
      // Legacy media jobs may not have a stored source yet. New URL jobs use
      // the HTML captured by preview and never download the page again.
      await setStage('fetching');
      fetched = await fetchArticle(
        (sourceType === 'media_coverage' ? mediaRecord?.url : null) ||
          job.input_url ||
          job.normalized_url
      );

      await setStage('extracting');
      article = extract(fetched.html, fetched.url);
      extractedArticle = article;
      canonicalUrl = article.canonicalUrl;

      try {
        canonicalUrl = normalizeSourceUrl(canonicalUrl);
      } catch {
        canonicalUrl = job.normalized_url;
      }

      article.canonicalUrl = canonicalUrl;
      applySourceOverrides(article, job);
    } else {
      await setStage('reading');
      const storage = options.storage ?? createBrainStorage();

      if (!storage) {
        throw new BrainSourceError('storage_not_configured', undefined, { status: 503 });
      }

      if (!job.storage_path || !job.source_sha256) {
        throw new Error('brain_source_storage_missing');
      }

      const buffer = await storage.downloadSource(job.storage_path);
      const actualSha256 = sha256Hex(buffer);

      if (actualSha256 !== job.source_sha256) {
        throw new BrainSourceError('storage_hash_mismatch');
      }

      await setStage('extracting');
      const storedFormat =
        sourceType === 'media_coverage' ? job.source_format || 'url' : sourceType;

      if (storedFormat === 'url') {
        const html = decodeUtf8Strict(buffer);
        const finalUrl =
          (sourceType === 'media_coverage' ? mediaRecord?.url : null) ||
          job.input_url ||
          job.normalized_url;
        fetched = {
          url: finalUrl,
          html,
          status: 200,
          contentType: 'text/html',
          bytes: buffer.length,
        };
        article = extract(html, finalUrl);
        extractedArticle = article;
        canonicalUrl =
          (sourceType === 'media_coverage' ? mediaRecord?.canonical_url : null) ||
          article.canonicalUrl ||
          job.normalized_url;
        article.canonicalUrl = canonicalUrl;
      } else if (storedFormat === 'pdf') {
        validatePdfBuffer(buffer, job.mime_type);
        article = await extractPdfDocument(buffer, {
          sourceSha256: job.source_sha256,
          filename: job.original_filename,
          mimeType: job.mime_type,
          byteSize: job.byte_size,
          title: job.title_override,
          author: job.author_override,
          publishedAt: job.published_at_override,
          language: job.language_override,
        });
        canonicalUrl =
          (sourceType === 'media_coverage' ? mediaRecord?.canonical_url : null) ||
          article.canonicalUrl ||
          job.normalized_url;
        article.canonicalUrl = canonicalUrl;
      } else {
        const rawText =
          storedFormat === 'txt'
            ? validateTxtBuffer(buffer, job.mime_type).text
            : decodeUtf8Strict(buffer);

        if (storedFormat === 'text' && rawText.includes('\u0000')) {
          throw new BrainSourceError('source_text_invalid');
        }

        article = extractPlainTextDocument({
          kind: storedFormat === 'txt' ? 'txt' : 'text',
          rawText,
          sourceSha256: job.source_sha256,
          filename: job.original_filename,
          mimeType: job.mime_type,
          byteSize: job.byte_size ?? buffer.length,
          title: job.title_override,
          author: job.author_override,
          publishedAt: job.published_at_override,
          language: job.language_override,
        });
        canonicalUrl =
          (sourceType === 'media_coverage' ? mediaRecord?.canonical_url : null) ||
          article.canonicalUrl ||
          job.normalized_url;
        article.canonicalUrl = canonicalUrl;
      }

      extractedArticle = article;
      applySourceOverrides(article, job);
    }

    if (sourceType === 'media_coverage') {
      if (!mediaRecord) throw new Error('media_record_not_found');

      const quality = evaluateMediaTextQuality(article);
      const shouldClassify =
        mediaRecord.ai_metadata?.import_pending === true ||
        mediaRecord.ai_metadata?.reviewed !== true;
      const classification = shouldClassify
        ? await classifyMediaPublication({
            title: article.title,
            outlet: article.siteName || mediaRecord.outlet,
            summary: article.description || mediaRecord.summary,
            url: article.canonicalUrl,
            detectedLanguage: article.language,
          })
        : null;

      const hydrated = await hydrateMediaRecord({
        store,
        mediaRecord,
        article,
        quality,
        classification,
      });
      mediaRecord = hydrated.mediaRecord;
      const canonicalConflictId = hydrated.canonicalConflictId;
      const archiveCanonical = mediaRecord.canonical_url;
      const failure =
        quality.quality === 'full_text' || quality.quality === 'partial_text' ? null : quality;

      const refreshed = await store.findMediaCoverageDocument({
        mediaRecordId: mediaRecord.id,
        normalizedUrl: job.normalized_url,
        canonicalUrl: archiveCanonical,
      });

      if (
        refreshed &&
        refreshed.sourceType !== 'media_coverage' &&
        !(job.storage_path && job.source_sha256)
      ) {
        throw new Error('media_document_conflict');
      }

      const active = refreshed ?? existingMedia;
      const documentId = active?.documentId ?? mediaDocumentId;

      if (!documentId) throw new Error('media_document_conflict');

      mediaDocumentId = documentId;
      const preserveExisting = Boolean(
        active &&
        active.ingestionStatus === 'completed' &&
        (active.chunkCount ?? 0) > 0 &&
        (active.textQuality === 'full_text' || active.textQuality === null) &&
        quality.quality !== 'full_text'
      );

      if (preserveExisting) {
        // Keep the previously indexed full text and record the latest check
        // outcome without replacing it with a shorter/paywalled version.
        await markMediaNotIndexed({
          store,
          job,
          mediaRecord,
          article,
          documentId,
          failure: quality,
          preserveExisting: true,
        });
      } else if (failure) {
        await markMediaNotIndexed({
          store,
          job,
          mediaRecord,
          article,
          documentId,
          failure,
          preserveExisting: false,
        });
      } else {
        const sameContent =
          Boolean(active) &&
          active?.contentHash === article.contentHash &&
          active?.ingestionStatus === 'completed';

        if (sameContent && active) {
          await markMediaDuplicate({
            store,
            job,
            mediaRecord,
            article,
            documentId,
            quality,
            existingQuality: active.textQuality,
          });
        } else {
          const change: 'inserted' | 'updated' = active ? 'updated' : 'inserted';
          const previousContentHash = active?.contentHash ?? null;
          const chunking = chunkArticle(article, documentId, {
            sourceType: 'media_coverage',
            mediaRecordId: mediaRecord.id,
          });

          if (chunking.chunks.length === 0) {
            await markMediaNotIndexed({
              store,
              job,
              mediaRecord,
              article,
              documentId,
              failure: evaluateMediaFailure('no_chunks'),
              preserveExisting,
            });
          } else {
            const embeddingInputs = chunking.chunks.map((chunk) => {
              const path = chunk.sectionPath.join(' / ');
              return path ? `${path}\n\n${chunk.content}` : chunk.content;
            });

            await setStage('embedding');
            const embeddings = await options.embeddingClient.embed(embeddingInputs);

            if (embeddings.length !== chunking.chunks.length) {
              throw new Error('embedding_count_mismatch');
            }

            const document = buildMediaCoverageDocument({
              article,
              job,
              mediaRecord,
              documentId,
              embeddingClient: options.embeddingClient,
              chunkCount: chunking.chunks.length,
              sourceCharCount: chunking.documentText.length,
              previousContentHash,
              change,
              quality,
            });

            await setStage('storing');

            const insertResult = active
              ? (active.sourceType === 'media_coverage'
                  ? (await store.updateMediaCoverageDocument(document),
                    { status: 'inserted' as const })
                  : (await store.updateLinkedArticleMediaDocument(document),
                    { status: 'inserted' as const }))
              : await store.insertMediaCoverageDocument(document);

            if (insertResult.status === 'duplicate') {
              throw new Error('brain_document_race_retry');
            }

            const chunkRows: KnowledgeChunkWithEmbedding[] = chunking.chunks.map(
              (chunk, index) => ({
                id: chunk.id,
                document_id: documentId,
                chunk_index: chunk.chunkIndex,
                content: chunk.content,
                content_hash: chunk.contentHash,
                heading: chunk.heading,
                section_path: chunk.sectionPath,
                section_index: chunk.sectionIndex,
                char_start: chunk.charStart,
                char_end: chunk.charEnd,
                line_start: chunk.lineStart,
                line_end: chunk.lineEnd,
                embedding_model: options.embeddingClient.modelId,
                embedding_dimensions: options.embeddingClient.dimensions,
                access_class: 'owner',
                metadata: chunk.metadata,
                embedding: embeddings[index],
              })
            );

            await store.insertArticleChunks(chunkRows);
            await store.deleteArticleChunksExcept(
              documentId,
              chunking.chunks.map((chunk) => chunk.id)
            );
            await store.setMediaCoverageStatus(documentId, {
              media_coverage_status: quality.coverageStatus,
              media_text_quality: quality.quality,
              extraction_status: quality.extractionStatus,
              ingestion_status: 'completed',
              media_coverage_method: ARTICLE_EXTRACTION_VERSION,
              media_coverage_error_code: quality.errorCode,
              media_coverage_error_detail: quality.errorCode
                ? safeErrorDetail(quality.errorCode)
                : null,
              media_coverage_diagnostics: mediaDiagnostics(article, {
                stage: 'done',
                chunks: chunking.chunks.length,
                change,
                previous_content_hash: previousContentHash,
                text_quality: quality.quality,
              }),
              content_hash: article.contentHash,
              chunk_count: chunking.chunks.length,
              source_char_count: chunking.documentText.length,
              processed_at: new Date().toISOString(),
            });

            await store.updateJob(job.id, {
              status: quality.jobStatus,
              canonical_url: archiveCanonical,
              final_url: (fetched?.url || job.input_url).slice(0, 2048),
              document_id: documentId,
              title: mediaRecord.title,
              language: article.language,
              content_hash: article.contentHash,
              extraction_status: quality.extractionStatus,
              extraction_metadata: mediaDiagnostics(article, {
                stage: 'done',
                chunks: chunking.chunks.length,
                change,
                previous_content_hash: previousContentHash,
                text_quality: quality.quality,
              }),
              error_code: quality.errorCode,
              error_detail: quality.errorCode
                ? safeErrorDetail(quality.errorCode)
                : change === 'updated'
                  ? 'Existing media coverage document updated because its content changed.'
                  : null,
              retry_after: null,
              processed_at: new Date().toISOString(),
              locked_at: null,
              worker_id: null,
            });

            try {
              const candidates = await store.findReprintCandidates(
                mediaRecord.id,
                article.contentHash
              );

              for (const candidate of candidates) {
                await store.upsertMediaRelation({
                  sourceMediaRecordId: mediaRecord.id,
                  targetMediaRecordId: candidate.mediaRecordId,
                  relationType: 'reprint',
                  detectedBy: 'content_hash',
                  confidence: 1,
                  evidence: {
                    content_hash: article.contentHash,
                    source_document_id: documentId,
                    target_document_id: candidate.documentId,
                  },
                });
              }

              if (canonicalConflictId) {
                await store.upsertMediaRelation({
                  sourceMediaRecordId: mediaRecord.id,
                  targetMediaRecordId: canonicalConflictId,
                  relationType: 'syndication',
                  detectedBy: 'canonical_url',
                  confidence: 0.95,
                  evidence: { canonical_url: article.canonicalUrl },
                });
              }
            } catch {
              // Relations are useful provenance, but must not invalidate a
              // successfully indexed article.
            }
          }
        }
      }
    } else if (sourceType === 'article') {
      await setStage('validating');
      const canonicalDuplicate = await store.findDuplicate({
        normalizedUrl: job.normalized_url,
        canonicalUrl,
      });
      const existing = canonicalDuplicate ?? known;

      if (article.status !== 'complete') {
        await markNotIndexed(store, job, article, existing?.documentId ?? null);
      } else {
        const sameContent =
          Boolean(existing) &&
          existing?.contentHash === article.contentHash &&
          existing?.ingestionStatus === 'completed';

        if (sameContent && existing) {
          await markDuplicate(
            store,
            job,
            existing.documentId,
            article.title,
            canonicalUrl,
            article.contentHash,
            { reason: 'same_url', article }
          );
        } else {
          const contentDuplicate = await store.findDuplicate({
            contentHash: article.contentHash,
          });
          const duplicateAtOtherUrl =
            Boolean(contentDuplicate) &&
            contentDuplicate?.documentId !== existing?.documentId &&
            contentDuplicate?.ingestionStatus === 'completed';

          if (duplicateAtOtherUrl && contentDuplicate) {
            await markDuplicate(
              store,
              job,
              contentDuplicate.documentId,
              article.title,
              canonicalUrl,
              article.contentHash,
              { reason: 'same_content', article }
            );
          } else {
            const updateExisting =
              existing ??
              (contentDuplicate &&
              contentDuplicate.ingestionStatus !== 'completed' &&
              contentDuplicate.sourceType === 'article'
                ? contentDuplicate
                : null);
            const documentId =
              updateExisting?.documentId ?? deriveArticleDocumentId(canonicalUrl);

            await indexExtractedDocument({
              store,
              job,
              article,
              documentId,
              existing: updateExisting,
              source: {
                sourceType: 'article',
                sourceFormat: 'url',
                sourcePath:
                  canonicalUrl.length <= 500 ? canonicalUrl : `brain/article/${documentId}`,
                sourceSha256: article.contentHash,
                sourceUrl: job.input_url,
                canonicalUrl,
                normalizedUrl: job.normalized_url,
              },
              embeddingClient: options.embeddingClient,
              setStage,
            });
          }
        }
      }
    } else {
      await setStage('validating');
      const storagePath = job.storage_path;
      const sourceSha256 = job.source_sha256;

      if (!storagePath || !sourceSha256) {
        throw new Error('brain_source_storage_missing');
      }

      const fileDuplicate = await store.findSourceDuplicate({
        sourceSha256,
        sourceTypes: [sourceType],
      });
      known = fileDuplicate;

      if (
        fileDuplicate &&
        fileDuplicate.ingestionStatus === 'completed' &&
        fileDuplicate.contentHash === article.contentHash
      ) {
        await markDuplicate(
          store,
          job,
          fileDuplicate.documentId,
          article.title,
          null,
          article.contentHash,
          { reason: 'same_file', article }
        );
      } else {
        const contentDuplicate = await store.findContentDuplicate({
          contentHash: article.contentHash,
          sourceTypes: ['article', 'pdf', 'txt', 'text'],
          excludeDocumentId: fileDuplicate?.documentId ?? null,
        });

        if (
          contentDuplicate &&
          contentDuplicate.documentId !== fileDuplicate?.documentId &&
          contentDuplicate.ingestionStatus === 'completed'
        ) {
          await markDuplicate(
            store,
            job,
            contentDuplicate.documentId,
            article.title,
            null,
            article.contentHash,
            { reason: 'same_content', article }
          );
        } else {
          const documentId =
            fileDuplicate?.documentId ?? deriveFileDocumentId(sourceType, sourceSha256);

          await indexExtractedDocument({
            store,
            job,
            article,
            documentId,
            existing: fileDuplicate,
            source: {
              sourceType,
              sourceFormat: sourceType,
              sourcePath: storagePath,
              sourceSha256,
              sourceUrl: null,
              canonicalUrl: null,
              normalizedUrl: job.normalized_url,
              originalFilename: job.original_filename,
              mimeType: job.mime_type,
              pageCount: job.page_count ?? article.diagnostics.file?.pageCount ?? null,
              byteSize: job.byte_size,
            },
            embeddingClient: options.embeddingClient,
            setStage,
          });
        }
      }
    }
  } catch (error) {
    const code = errorCode(error);
    const retryable = isRetryable(error);
    const canRetry = retryable && job.attempts < job.max_attempts;
    const retryAfter =
      error instanceof BrainUrlError || error instanceof EmbeddingProviderError
        ? error.retryAfterSeconds
        : null;
    const delaySeconds = retryAfter ?? retryDelaySeconds(job.attempts);

    const extractedQuality = extractedArticle ? evaluateMediaTextQuality(extractedArticle) : null;
    const failure = extractedQuality
      ? {
          ...extractedQuality,
          coverageStatus: canRetry ? ('pending' as const) : ('failed' as const),
        }
      : evaluateMediaFailure(code);

    if (sourceType === 'media_coverage' && mediaRecord) {
      try {
        await store.updateMediaRecord(mediaRecord.id, {
          ai_metadata: {
            ...(mediaRecord.ai_metadata || {}),
            last_processed_at: canRetry ? null : new Date().toISOString(),
            extraction_status: failure.extractionStatus,
            text_quality: failure.quality,
            coverage_status: failure.coverageStatus,
            error_code: code,
          },
        });
      } catch {
        // The job error remains authoritative if the archive update fails.
      }
    }

    if (sourceType === 'media_coverage' && mediaDocumentId && mediaRecord && extractedArticle) {
      try {
        await store.updateMediaCoverageMetadata(
          mediaDocumentId,
          mediaMetadataPatch(mediaRecord, job, extractedArticle)
        );
      } catch {
        // Keep the original ingestion failure.
      }
    }

    if (sourceType === 'media_coverage' && mediaDocumentId) {
      try {
        await store.setMediaCoverageStatus(mediaDocumentId, {
          media_coverage_status: canRetry ? 'pending' : failure.coverageStatus,
          ...(canRetry ? {} : { media_text_quality: failure.quality }),
          ...(extractedArticle ? { source_char_count: extractedArticle.charCount } : {}),
          extraction_status: canRetry ? null : failure.extractionStatus,
          media_coverage_error_code: code,
          media_coverage_error_detail: safeErrorDetail(code),
          media_coverage_diagnostics: {
            stage: canRetry ? 'retry_queued' : 'failed',
            error_code: code,
            text_quality: canRetry ? null : failure.quality,
          },
          processed_at: canRetry ? null : new Date().toISOString(),
        });
      } catch {
        // Preserve the original job failure; a later run can reconcile status.
      }
    }

    await store.updateJob(job.id, {
      status: canRetry ? 'queued' : 'failed',
      retry_after: canRetry ? new Date(Date.now() + delaySeconds * 1000).toISOString() : null,
      error_code: code,
      error_detail: safeErrorDetail(code),
      extraction_metadata: { ...job.extraction_metadata, stage: 'failed' },
      processed_at: canRetry ? null : new Date().toISOString(),
      locked_at: null,
      worker_id: null,
    });
  }

  jobs = await store.getJobs(runId);
  const finalized = await finalizeRun(store, runId, jobs);
  const processed = jobs.find((entry) => entry.id === job.id) || job;

  return {
    state: 'processed',
    job: processed,
    progress: finalized.progress,
    runStatus: finalized.runStatus,
  };
}
