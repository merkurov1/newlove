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
    return error.status === null || error.status === 408 || error.status === 429 || error.status >= 500;
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
  if (article.wordCount < 80) return 'word_count_below_threshold';
  if (article.diagnostics.paragraphCount < 2) return 'too_few_paragraphs';
  if (article.charCount < 500) return 'text_too_short';
  return 'extraction_incomplete';
}

function extractionMetadata(article: ExtractedArticle): Record<string, unknown> {
  return {
    canonical_url: article.canonicalUrl,
    site_name: article.siteName,
    language: article.language,
    diagnostics: article.diagnostics,
  };
}

function buildDocument(
  article: ExtractedArticle,
  job: BrainJobRow,
  documentId: string,
  embeddingClient: EmbeddingClient,
  chunkCount: number,
  sourceCharCount: number
): BrainArticleDocumentRow {
  const sourcePath =
    article.canonicalUrl.length <= 500 ? article.canonicalUrl : `brain/article/${documentId}`;

  const manifestHash = sha256(
    JSON.stringify({
      canonicalUrl: article.canonicalUrl,
      contentHash: article.contentHash,
      parserVersion: ARTICLE_PARSER_VERSION,
      chunkerVersion: ARTICLE_CHUNKER_VERSION,
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
      source_type: 'article',
      site_name: article.siteName,
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
    extraction_status: 'ok',
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
  contentHash: string | null
): Promise<void> {
  await store.updateJob(job.id, {
    status: 'duplicate',
    document_id: documentId,
    title,
    canonical_url: canonicalUrl,
    content_hash: contentHash,
    error_code: null,
    error_detail: 'An existing Brain document already contains this article.',
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
  }

  return { progress, runStatus };
}

/**
 * Processes one queued job for a run. One HTTP request handles one article so
 * a browser close or serverless timeout cannot lose the whole batch. The queue
 * row is claimed atomically and can be resumed later.
 */
export async function processNextBrainJob(
  options: ProcessNextOptions
): Promise<ProcessNextResult> {
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

  try {
    // Fast path: a completed document with the same normalized URL needs no
    // network request at all.
    const known = await store.findDuplicate({ normalizedUrl: job.normalized_url });

    if (known && known.ingestionStatus === 'completed') {
      await markDuplicate(store, job, known.documentId, known.title, null, null);
    } else {
      const fetched = await fetchArticle(job.input_url || job.normalized_url);
      const article = extract(fetched.html, fetched.url);

      let canonicalUrl = article.canonicalUrl;

      try {
        canonicalUrl = normalizeSourceUrl(canonicalUrl);
      } catch {
        canonicalUrl = job.normalized_url;
      }

      const canonicalDuplicate = await store.findDuplicate({
        normalizedUrl: job.normalized_url,
        canonicalUrl,
      });

      if (canonicalDuplicate && canonicalDuplicate.ingestionStatus === 'completed') {
        await markDuplicate(
          store,
          job,
          canonicalDuplicate.documentId,
          article.title,
          canonicalUrl,
          article.contentHash
        );
      } else if (article.status !== 'ok') {
        const reason = article.status === 'failed' ? 'extraction_failed' : partialReason(article);

        await store.updateJob(job.id, {
          status: article.status === 'failed' ? 'failed' : 'partial',
          canonical_url: canonicalUrl,
          final_url: fetched.url.slice(0, 2048),
          title: article.title,
          language: article.language,
          content_hash: article.contentHash,
          extraction_status: article.status,
          extraction_metadata: extractionMetadata(article),
          error_code: reason,
          error_detail:
            article.status === 'failed'
              ? 'No usable article text could be extracted.'
              : 'The extracted text looks incomplete and was not indexed.',
          processed_at: new Date().toISOString(),
          locked_at: null,
          worker_id: null,
        });
      } else {
        const contentDuplicate = await store.findDuplicate({
          normalizedUrl: job.normalized_url,
          canonicalUrl,
          contentHash: article.contentHash,
        });

        if (contentDuplicate && contentDuplicate.ingestionStatus === 'completed') {
          await markDuplicate(
            store,
            job,
            contentDuplicate.documentId,
            article.title,
            canonicalUrl,
            article.contentHash
          );
        } else {
          const documentId =
            contentDuplicate && contentDuplicate.ingestionStatus !== 'completed'
              ? contentDuplicate.documentId
              : deriveArticleDocumentId(canonicalUrl);

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
              extraction_metadata: extractionMetadata(article),
              error_code: 'no_chunks',
              error_detail: 'The article produced no indexable chunks.',
              processed_at: new Date().toISOString(),
              locked_at: null,
              worker_id: null,
            });
          } else {
            const embeddingInputs = chunking.chunks.map((chunk) => {
              const path = chunk.sectionPath.join(' / ');
              return path ? `${path}\n\n${chunk.content}` : chunk.content;
            });

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
              chunking.documentText.length
            );

            let insertResult: { status: 'inserted' | 'duplicate' };

            if (contentDuplicate && contentDuplicate.ingestionStatus !== 'completed') {
              await store.updateArticleDocument(document);
              insertResult = { status: 'inserted' };
            } else {
              insertResult = await store.insertArticleDocument(document);
            }

            if (insertResult.status === 'duplicate') {
              await markDuplicate(
                store,
                job,
                documentId,
                article.title,
                canonicalUrl,
                article.contentHash
              );
            } else {
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
                  embedding: embeddings[index],
                })
              );

              await store.insertArticleChunks(chunkRows);
              await store.completeArticleDocument(documentId);

              await store.updateJob(job.id, {
                status: 'completed',
                canonical_url: canonicalUrl,
                final_url: fetched.url.slice(0, 2048),
                document_id: documentId,
                title: article.title,
                language: article.language,
                content_hash: article.contentHash,
                extraction_status: 'ok',
                extraction_metadata: extractionMetadata(article),
                error_code: null,
                error_detail: null,
                processed_at: new Date().toISOString(),
                locked_at: null,
                worker_id: null,
              });
            }
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
      retry_after: canRetry
        ? new Date(Date.now() + delaySeconds * 1000).toISOString()
        : null,
      error_code: code,
      error_detail: safeErrorDetail(code),
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
