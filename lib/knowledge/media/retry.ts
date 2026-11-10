import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/knowledge/media/retry');

import { createBrainStore } from '@/lib/knowledge/brain/store';
import { normalizeSourceUrl } from '@/lib/knowledge/brain/url';
import { processBrainRunInline } from '@/lib/knowledge/brain/inline';
import { enqueueMediaCoverageJob } from '@/lib/knowledge/media/queue';
import { mediaQuery } from '@/lib/knowledge/media/database';
import { classifyMediaFailure, type MediaFailureAssessment } from '@/lib/knowledge/media/catalog';

export type MediaRetryPlanRow = {
  mediaRecordId: string;
  jobId: string | null;
  title: string;
  outlet: string;
  publishedDate: string | null;
  errorCode: string | null;
  attempts: number;
  maxAttempts: number;
  failure: MediaFailureAssessment;
  action: 'retry' | 'skip';
  reason: string;
};

type JobRow = Record<string, unknown>;

function asInt(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

/**
 * Read-only plan. It never mutates the database. A retry is offered only when
 * the existing failure classifier says it is retryable AND the job still has
 * attempts left. Access restrictions, paywalls, missing documents and
 * metadata-only records are never retried.
 */
export async function planMediaIngestionRetries(input: {
  limit?: number;
  mediaRecordId?: string;
} = {}): Promise<MediaRetryPlanRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 500);
  const params: unknown[] = [];
  let filter = '';

  if (input.mediaRecordId) {
    params.push(input.mediaRecordId);
    filter = `AND m.id = $1::uuid`;
  }

  const jobs = await mediaQuery<JobRow>(
    `SELECT DISTINCT ON (j.media_record_id)
       j.id AS job_id,
       j.media_record_id,
       j.status,
       j.attempts,
       j.max_attempts,
       j.error_code,
       j.error_detail,
       m.title,
       m.outlet,
       m.published_date::text AS published_date,
       m.status AS archive_status,
       d.id AS document_id,
       d.media_coverage_status,
       d.media_text_quality,
       d.ingestion_status,
       coalesce(d.chunk_count, 0)::int AS chunk_count
     FROM public.brain_ingestion_jobs j
     JOIN public.media_archive_records m ON m.id = j.media_record_id
     LEFT JOIN public.knowledge_documents d ON d.media_record_id = m.id
     WHERE j.media_record_id IS NOT NULL
       AND j.status IN ('failed', 'partial')
       ${filter}
     ORDER BY j.media_record_id, j.created_at DESC`,
    params
  );

  return jobs.slice(0, limit).map((job) => {
    const failure = classifyMediaFailure({
      coverageStatus: job.media_coverage_status
        ? String(job.media_coverage_status)
        : null,
      textQuality: job.media_text_quality ? String(job.media_text_quality) : null,
      ingestionStatus: job.ingestion_status ? String(job.ingestion_status) : null,
      errorCode: job.error_code ? String(job.error_code) : null,
      errorDetail: job.error_detail ? String(job.error_detail) : null,
      hasDocument: Boolean(job.document_id),
      chunkCount: asInt(job.chunk_count),
    });
    const attempts = asInt(job.attempts);
    const maxAttempts = asInt(job.max_attempts, 3);
    const archiveStatus = String(job.archive_status || '');
    const canRetry =
      failure.retryable &&
      attempts < maxAttempts &&
      archiveStatus !== 'archived' &&
      Boolean(job.media_record_id);

    return {
      mediaRecordId: String(job.media_record_id),
      jobId: job.job_id ? String(job.job_id) : null,
      title: String(job.title || ''),
      outlet: String(job.outlet || ''),
      publishedDate: job.published_date ? String(job.published_date) : null,
      errorCode: job.error_code ? String(job.error_code) : null,
      attempts,
      maxAttempts,
      failure,
      action: canRetry ? 'retry' : 'skip',
      reason: canRetry
        ? `Retryable ${failure.class}; attempt ${attempts}/${maxAttempts}.`
        : failure.retryable
          ? `Retry budget exhausted (${attempts}/${maxAttempts}) or archive is archived.`
          : failure.recommendedAction,
    };
  });
}

export type MediaRetryExecution = {
  mediaRecordId: string;
  title: string;
  status: 'queued' | 'processed' | 'failed' | 'skipped';
  runId: string | null;
  jobId: string | null;
  error: string | null;
};

/**
 * Executes only the jobs explicitly marked retryable by the plan. Ingestion is
 * idempotent at the media_record_id level, so a retry never creates a second
 * linked document. Previous successful content is preserved by the existing
 * pipeline (`existing_document_preserved`).
 */
export async function executeMediaIngestionRetries(input: {
  limit?: number;
  mediaRecordId?: string;
  dryRun?: boolean;
} = {}): Promise<{ plan: MediaRetryPlanRow[]; executed: MediaRetryExecution[] }> {
  const plan = await planMediaIngestionRetries({
    limit: input.limit,
    mediaRecordId: input.mediaRecordId,
  });

  if (input.dryRun !== false) return { plan, executed: [] };

  const store = createBrainStore();
  if (!store) throw new Error('media_retry_database_unavailable');

  const executed: MediaRetryExecution[] = [];
  const retryRows = plan.filter((row) => row.action === 'retry');

  for (const row of retryRows) {
    try {
      const record = await store.getMediaRecord(row.mediaRecordId);
      if (!record) {
        executed.push({
          mediaRecordId: row.mediaRecordId,
          title: row.title,
          status: 'skipped',
          runId: null,
          jobId: null,
          error: 'media_record_not_found',
        });
        continue;
      }

      const inputUrl = record.url || record.canonical_url;
      const normalizedUrl = normalizeSourceUrl(inputUrl);
      const storedSourcePath =
        typeof record.source_path === 'string' &&
        /^brain-sources\/[a-f0-9]{2}\/[a-f0-9]{64}\.(pdf|txt|html)$/.test(record.source_path)
          ? record.source_path
          : null;
      const storedSourceSha =
        typeof record.source_sha256 === 'string' && /^[a-f0-9]{64}$/.test(record.source_sha256)
          ? record.source_sha256
          : null;
      const sourceFormat =
        storedSourcePath && ['url', 'pdf', 'txt', 'text'].includes(String(record.source_format))
          ? (record.source_format as 'url' | 'pdf' | 'txt' | 'text')
          : 'url';

      const queued = await enqueueMediaCoverageJob({
        store,
        mediaRecordId: row.mediaRecordId,
        inputUrl,
        normalizedUrl,
        requestedBy: 'media-retry-tool',
        source: 'media_coverage_retry',
        sourceFormat,
        storagePath: storedSourcePath,
        sourceSha256: storedSourceSha,
        authorOverride: record.author || null,
        publishedAtOverride: record.published_date || null,
        languageOverride: record.lang || null,
      });

      if (queued.status === 'already_queued') {
        executed.push({
          mediaRecordId: row.mediaRecordId,
          title: row.title,
          status: 'queued',
          runId: queued.runId,
          jobId: queued.job.id,
          error: null,
        });
        continue;
      }

      const processed = await processBrainRunInline({
        store,
        runId: queued.runId,
        maxJobs: 1,
        budgetMs: 90_000,
        workerId: 'media-retry-tool',
      });

      const latest = await store.getLatestMediaJob(row.mediaRecordId);
      executed.push({
        mediaRecordId: row.mediaRecordId,
        title: row.title,
        status:
          latest?.status === 'completed'
            ? 'processed'
            : processed.ok
              ? 'queued'
              : 'failed',
        runId: queued.runId,
        jobId: queued.job.id,
        error: processed.error || latest?.error_code || null,
      });
    } catch (error) {
      executed.push({
        mediaRecordId: row.mediaRecordId,
        title: row.title,
        status: 'failed',
        runId: null,
        jobId: null,
        error: error instanceof Error ? error.message.slice(0, 200) : 'retry_failed',
      });
    }
  }

  return { plan, executed };
}
