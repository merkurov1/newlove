import { createHash } from 'node:crypto';

import type { EmbeddingClient } from '@/lib/knowledge/rag/embeddings';
import {
  EmbeddingProviderError,
  EmbeddingTimeoutError,
  KnowledgeDatabaseError,
} from '@/lib/knowledge/rag/errors';
import type { KnowledgeChunkWithEmbedding } from '@/lib/knowledge/rag/types';

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
import type {
  BrainArticleDocumentRow,
  BrainJobRow,
  BrainJobStatus,
  BrainRunStatus,
  BrainStore,
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
};

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function deriveArticleDocumentId(canonicalUrl: string): string {
  return `doc_article_${sha256(canonicalUrl).slice(0, 32)}`;
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

function isRetryable(error: unknown): boolean {
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
  if (error instanceof BrainUrlError) return error.code;

  if (error instanceof EmbeddingTimeoutError) return 'embedding_timeout';

  if (error instanceof EmbeddingProviderError) {
    return error.status === 429 ? 'embedding_rate_limited' : 'embedding_failed';
  }

  if (error instanceof KnowledgeDatabaseError) return 'database_failed';

  const message = error instanceof Error ? error.message : '';

  if (message.startsWith('brain_')) return message;

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
    case 'brain_document_race_retry':
      return 'A concurrent import updated the same document; the job was queued for a safe retry.';
    case 'embedding_rate_limited':
      return 'The embedding provider rate-limited the request.';
    case 'embedding_failed':
      return 'The embedding request failed.';
    case 'database_failed':
      return 'The knowledge database write failed.';
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
    extraction_version: ARTICLE_EXTRACTION_VERSION,
    parser_version: ARTICLE_PARSER_VERSION,
    chunker_version: ARTICLE_CHUNKER_VERSION,
    extraction_status: article.status,
    diagnostics: article.diagnostics,
    ...extra,
  };
}

function buildDocument(
  article: ExtractedArticle,
  job: BrainJobRow,
  documentId: string,
  embeddingClient: EmbeddingClient,
  chunkCount: number,
  sourceCharCount: number,
  previousContentHash: string | null,
  change: 'inserted' | 'updated'
): BrainArticleDocumentRow {
  const sourcePath =
    article.canonicalUrl.length <= 500 ? article.canonicalUrl : `brain/article/${documentId}`;

  const manifestHash = sha256(
    JSON.stringify({
      canonicalUrl: article.canonicalUrl,
      contentHash: article.contentHash,
      parserVersion: ARTICLE_PARSER_VERSION,
      chunkerVersion: ARTICLE_CHUNKER_VERSION,
      extractionVersion: ARTICLE_EXTRACTION_VERSION,
      chunkCount,
    })
  );

  return {
    id: documentId,
    title: article.title.slice(0, 200) || 'Untitled article',
    source_path: sourcePath,
    source_sha256: article.contentHash,
    manifest_hash: manifestHash,
    parser_version: ARTICLE_PARSER_VERSION,
    chunker_version: ARTICLE_CHUNKER_VERSION,
    ingestion_version: BRAIN_INGESTION_VERSION,
    embedding_model: embeddingClient.modelId,
    embedding_dimensions: embeddingClient.dimensions,
    access_class: 'owner',
    chunk_count: chunkCount,
    source_char_count: sourceCharCount,
    metadata: {
      ingestion_version: BRAIN_INGESTION_VERSION,
      extraction_version: ARTICLE_EXTRACTION_VERSION,
      parser_version: ARTICLE_PARSER_VERSION,
      chunker_version: ARTICLE_CHUNKER_VERSION,
      source_type: 'article',
      source_domain: article.sourceDomain,
      site_name: article.siteName,
      language: article.language,
      published_at: article.publishedAt,
      published_at_source: article.publishedAtSource,
      change,
      previous_content_hash: previousContentHash,
      extraction: article.diagnostics,
    },
    source_type: 'article',
    source_url: job.input_url.slice(0, 2048),
    canonical_url: article.canonicalUrl,
    normalized_url: job.normalized_url,
    content_hash: article.contentHash,
    language: article.language,
    author: article.author,
    published_at: article.publishedAt,
    extraction_status: article.status,
    ingestion_status: 'pending',
    processed_at: null,
  };
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
  };

  try {
    const known = await store.findDuplicate({ normalizedUrl: job.normalized_url });

    // A known URL is not skipped. Re-fetching is the only reliable way to
    // detect that an article changed after it was first indexed.
    await setStage('fetching');
    const fetched = await fetchArticle(job.input_url || job.normalized_url);

    await setStage('extracting');
    const article = extract(fetched.html, fetched.url);

    let canonicalUrl = article.canonicalUrl;

    try {
      canonicalUrl = normalizeSourceUrl(canonicalUrl);
    } catch {
      canonicalUrl = job.normalized_url;
    }

    article.canonicalUrl = canonicalUrl;

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
            (contentDuplicate && contentDuplicate.ingestionStatus !== 'completed'
              ? contentDuplicate
              : null);
          const documentId =
            updateExisting?.documentId ??
            contentDuplicate?.documentId ??
            deriveArticleDocumentId(canonicalUrl);
          const change: 'inserted' | 'updated' = updateExisting ? 'updated' : 'inserted';
          const previousContentHash = updateExisting?.contentHash ?? null;
          const chunking = chunkArticle(article, documentId);

          if (chunking.chunks.length === 0) {
            await store.updateJob(job.id, {
              status: 'failed',
              canonical_url: canonicalUrl,
              final_url: fetched.url.slice(0, 2048),
              title: article.title,
              language: article.language,
              content_hash: article.contentHash,
              extraction_status: article.status,
              extraction_metadata: extractionMetadata(article, {
                stage: 'done',
                reason: 'no_chunks',
                existing_document_preserved: Boolean(updateExisting),
              }),
              error_code: 'no_chunks',
              error_detail: 'The article produced no indexable chunks.',
              retry_after: null,
              processed_at: new Date().toISOString(),
              locked_at: null,
              worker_id: null,
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

            const document = buildDocument(
              article,
              job,
              documentId,
              options.embeddingClient,
              chunking.chunks.length,
              chunking.documentText.length,
              previousContentHash,
              change
            );

            await setStage('storing');

            const insertResult = updateExisting
              ? (await store.updateArticleDocument(document), { status: 'inserted' as const })
              : await store.insertArticleDocument(document);

            if (insertResult.status === 'duplicate') {
              // A concurrent worker won the insert race. Retry: the next pass
              // will find the existing logical document and update it safely.
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
            await store.completeArticleDocument(documentId, article.status);

            await store.updateJob(job.id, {
              status: 'completed',
              canonical_url: canonicalUrl,
              final_url: fetched.url.slice(0, 2048),
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
          }
        }
      }
    }
  } catch (error) {
    const code = errorCode(error);
    const retryable = isRetryable(error);
    const canRetry = retryable && job.attempts < job.max_attempts;
    const delaySeconds = Math.min(120, Math.max(10, job.attempts * 15));

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
