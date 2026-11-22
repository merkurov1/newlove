/**
 * Read-only reporting and retry planning for an existing Brain ingestion queue.
 *
 * This module never talks to the database and never creates jobs. The operator
 * CLI uses it to turn a job snapshot into a status/error/cost report and to
 * decide which already-failed rows are safe to requeue in place.
 */

export type BrainQueueJobSnapshot = {
  id: string;
  run_id: string;
  status: string;
  source_type: string;
  media_record_id: string | null;
  normalized_url?: string | null;
  attempts: number;
  max_attempts: number;
  error_code: string | null;
  error_detail: string | null;
  created_at: string;
};

export const FINAL_BRAIN_JOB_STATUSES = [
  'completed',
  'duplicate',
  'partial',
  'failed',
  'cancelled',
] as const;

const FINAL_STATUS_SET = new Set<string>(FINAL_BRAIN_JOB_STATUSES);
const ACTIVE_STATUS_SET = new Set(['queued', 'processing']);

/**
 * Codes that the existing worker treats as transient and retries with bounded
 * backoff. The list mirrors `isRetryable()` in process.ts plus the explicit
 * retryable source-storage errors. Anything not listed here is left alone:
 * "unknown" is not the same as "safe to retry".
 */
const RETRYABLE_ERROR_CODES = new Set([
  'fetch_timeout',
  'fetch_failed',
  'dns_failed',
  'http_status_408',
  'http_status_425',
  'http_status_429',
  'embedding_timeout',
  'embedding_rate_limited',
  'database_failed',
  'storage_download_failed',
  'storage_upload_failed',
  'storage_upload_url_failed',
  'brain_document_race_retry',
]);

/**
 * Failures that must be fixed at the source, not retried. The list is
 * deliberately explicit so a new error code does not become retryable by
 * accident.
 */
const PERMANENT_ERROR_CODES = new Set([
  'embedding_auth_failed',
  'embedding_payment_required',
  'embedding_not_configured',
  'embedding_configuration_invalid',
  'embedding_dimension_mismatch',
  'embedding_model_mismatch',
  'embedding_input_too_large',
  'embedding_failed',
  'paywall_detected',
  'metadata_only',
  'truncated_content',
  'needs_review',
  'no_chunks',
  'word_count_below_threshold',
  'too_few_paragraphs',
  'text_too_short',
  'extraction_incomplete',
  'extraction_failed',
  'unsupported_content_type',
  'response_too_large',
  'media_record_missing',
  'media_record_not_found',
  'media_record_archived',
  'media_record_url_missing',
  'media_document_conflict',
  'pdf_signature_invalid',
  'pdf_mime_invalid',
  'pdf_empty',
  'pdf_no_text',
  'pdf_ocr_required',
  'pdf_password_protected',
  'pdf_parse_failed',
  'pdf_text_too_large',
  'txt_mime_invalid',
  'txt_empty',
  'txt_encoding_invalid',
  'txt_binary_content',
  'source_text_missing',
  'source_text_empty',
  'source_text_invalid',
  'source_text_too_large',
  'source_title_too_long',
  'source_author_too_long',
  'source_language_invalid',
  'source_date_invalid',
  'source_empty',
  'storage_not_configured',
  'storage_path_invalid',
  'storage_incoming_path_invalid',
  'storage_incoming_missing',
  'storage_hash_mismatch',
  'brain_source_storage_missing',
]);

export type FailedJobRetryDecision = {
  retryable: boolean;
  reason: string;
  errorCode: string | null;
  attemptsLeft: number;
};

function normalizedCode(value: string | null): string | null {
  const code = (value || '').trim().toLowerCase();
  return code || null;
}

function isRetryableHttpStatus(code: string): boolean {
  const match = /^http_status_(\d{3})$/.exec(code);
  if (!match) return false;

  const status = Number(match[1]);
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

/**
 * A failed job is safe to requeue only when:
 *   - it is already `failed` (partial/duplicate/completed are not errors);
 *   - it still has attempts left;
 *   - its error code is a known transient one.
 *
 * The caller must additionally verify that no other active job exists for the
 * same media record or URL before writing the queue row.
 */
export function classifyFailedJobRetry(
  job: Pick<BrainQueueJobSnapshot, 'status' | 'attempts' | 'max_attempts' | 'error_code'>
): FailedJobRetryDecision {
  const attemptsLeft = Math.max(0, Number(job.max_attempts || 0) - Number(job.attempts || 0));
  const errorCode = normalizedCode(job.error_code);

  if (job.status !== 'failed') {
    return {
      retryable: false,
      reason: `Only failed jobs are retried; current status is ${job.status}.`,
      errorCode,
      attemptsLeft,
    };
  }

  if (attemptsLeft <= 0) {
    return {
      retryable: false,
      reason: 'Retry budget is exhausted.',
      errorCode,
      attemptsLeft,
    };
  }

  if (!errorCode) {
    return {
      retryable: false,
      reason: 'No error code; manual review is required before a retry.',
      errorCode,
      attemptsLeft,
    };
  }

  if (PERMANENT_ERROR_CODES.has(errorCode)) {
    return {
      retryable: false,
      reason: 'Permanent failure; fix the source or metadata first.',
      errorCode,
      attemptsLeft,
    };
  }

  if (RETRYABLE_ERROR_CODES.has(errorCode) || isRetryableHttpStatus(errorCode)) {
    return {
      retryable: true,
      reason: `Transient failure (${errorCode}) with ${attemptsLeft} attempt(s) left.`,
      errorCode,
      attemptsLeft,
    };
  }

  return {
    retryable: false,
    reason: 'Unclassified error; automatic retry is not authorized.',
    errorCode,
    attemptsLeft,
  };
}

export function isFinalBrainJobStatus(status: string): boolean {
  return FINAL_STATUS_SET.has(status);
}

export type BrainQueueCostInput = {
  documents: number;
  sourceChars: number;
  chunks: number;
  /** Optional verified embedding input price. Null keeps the USD cost unknown. */
  inputUsdPerMillion?: number | null;
};

export type BrainQueueCost = {
  documents: number;
  sourceChars: number;
  chunks: number;
  estimatedEmbeddingTokens: number;
  estimatedCostUsd: number | null;
  pricingSource: string;
  note: string;
};

/**
 * Conservative embedding-only estimate. bge-m3 tokenization is not the same as
 * a whitespace count, so four characters per token is used only as a planning
 * number. Classification/LLM calls are outside this estimate.
 */
export function estimateBrainQueueCost(input: BrainQueueCostInput): BrainQueueCost {
  const sourceChars = Math.max(0, Math.trunc(Number(input.sourceChars) || 0));
  const chunks = Math.max(0, Math.trunc(Number(input.chunks) || 0));
  const documents = Math.max(0, Math.trunc(Number(input.documents) || 0));
  const estimatedEmbeddingTokens = sourceChars > 0 ? Math.ceil(sourceChars / 4) : 0;
  const price =
    typeof input.inputUsdPerMillion === 'number' &&
    Number.isFinite(input.inputUsdPerMillion) &&
    input.inputUsdPerMillion >= 0
      ? input.inputUsdPerMillion
      : null;

  return {
    documents,
    sourceChars,
    chunks,
    estimatedEmbeddingTokens,
    estimatedCostUsd:
      price === null ? null : Number(((estimatedEmbeddingTokens * price) / 1_000_000).toFixed(8)),
    pricingSource:
      price === null
        ? 'No verified embedding input price is configured.'
        : 'Operator-configured embedding input price per million tokens.',
    note:
      'Embedding-only planning estimate; media classification/LLM calls and retries are excluded. ' +
      'A null USD value is unknown, not zero.',
  };
}

export type BrainQueueStatusRow = {
  status: string;
  count: number;
};

export type BrainQueueSourceTypeRow = {
  sourceType: string;
  total: number;
  counts: Record<string, number>;
};

export type BrainQueueErrorGroup = {
  status: string;
  errorCode: string | null;
  count: number;
  retryable: boolean;
  sampleDetail: string | null;
};

export type DuplicateMediaJobGroup = {
  mediaRecordId: string;
  sourceType: string;
  jobCount: number;
  hasActiveJob: boolean;
  statuses: Record<string, number>;
  jobIds: string[];
};

export type BrainQueueRetryPlanRow = {
  jobId: string;
  runId: string;
  sourceType: string;
  mediaRecordId: string | null;
  errorCode: string | null;
  attempts: number;
  maxAttempts: number;
  action: 'retry' | 'skip';
  reason: string;
};

export type BrainQueueSummary = {
  total: number;
  final: number;
  unresolved: number;
  unresolvedStatuses: Record<string, number>;
  status: BrainQueueStatusRow[];
  bySourceType: BrainQueueSourceTypeRow[];
  errors: BrainQueueErrorGroup[];
  retryPlan: BrainQueueRetryPlanRow[];
  retryableFailedJobs: number;
  duplicateMediaJobs: DuplicateMediaJobGroup[];
  cost: BrainQueueCost;
};

function sortedStatusCounts(counts: Record<string, number>): BrainQueueStatusRow[] {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => ({ status, count }));
}

export function summarizeBrainQueue(
  jobs: BrainQueueJobSnapshot[],
  costInput: BrainQueueCostInput
): BrainQueueSummary {
  const statusCounts: Record<string, number> = {};
  const sourceTypeCounts = new Map<string, Record<string, number>>();
  const errorGroups = new Map<
    string,
    { status: string; errorCode: string | null; count: number; sampleDetail: string | null }
  >();
  const mediaGroups = new Map<
    string,
    { mediaRecordId: string; sourceType: string; jobIds: string[]; statuses: string[] }
  >();
  const retryPlan: BrainQueueRetryPlanRow[] = [];
  let unresolved = 0;

  for (const job of jobs) {
    const status = String(job.status || 'unknown');
    const sourceType = String(job.source_type || 'unknown');

    statusCounts[status] = (statusCounts[status] || 0) + 1;

    const sourceCounts = sourceTypeCounts.get(sourceType) || {};
    sourceCounts[status] = (sourceCounts[status] || 0) + 1;
    sourceTypeCounts.set(sourceType, sourceCounts);

    if (ACTIVE_STATUS_SET.has(status)) unresolved += 1;

    if (status === 'failed' || status === 'partial') {
      const key = `${status}|${job.error_code || ''}`;
      const existing = errorGroups.get(key);

      if (existing) {
        existing.count += 1;
      } else {
        errorGroups.set(key, {
          status,
          errorCode: job.error_code || null,
          count: 1,
          sampleDetail: job.error_detail ? job.error_detail.slice(0, 300) : null,
        });
      }
    }

    if (job.media_record_id) {
      const key = `${job.media_record_id}|${sourceType}`;
      const group = mediaGroups.get(key) || {
        mediaRecordId: job.media_record_id,
        sourceType,
        jobIds: [],
        statuses: [],
      };
      group.jobIds.push(job.id);
      group.statuses.push(status);
      mediaGroups.set(key, group);
    }

    const decision = classifyFailedJobRetry(job);

    if (status === 'failed') {
      retryPlan.push({
        jobId: job.id,
        runId: job.run_id,
        sourceType,
        mediaRecordId: job.media_record_id,
        errorCode: decision.errorCode,
        attempts: Number(job.attempts || 0),
        maxAttempts: Number(job.max_attempts || 0),
        action: decision.retryable ? 'retry' : 'skip',
        reason: decision.reason,
      });
    }
  }

  const errors = Array.from(errorGroups.values())
    .map((group) => ({
      ...group,
      retryable:
        group.status === 'failed'
          ? classifyFailedJobRetry({
              status: group.status,
              attempts: 0,
              max_attempts: 1,
              error_code: group.errorCode,
            }).retryable
          : false,
    }))
    .sort((left, right) => {
      if (left.status !== right.status) return left.status.localeCompare(right.status);
      return (left.errorCode || '').localeCompare(right.errorCode || '');
    });

  const duplicateMediaJobs = Array.from(mediaGroups.values())
    .filter((group) => group.jobIds.length > 1)
    .map((group) => {
      const statuses: Record<string, number> = {};

      for (const status of group.statuses) {
        statuses[status] = (statuses[status] || 0) + 1;
      }

      return {
        mediaRecordId: group.mediaRecordId,
        sourceType: group.sourceType,
        jobCount: group.jobIds.length,
        hasActiveJob: group.statuses.some((status) => ACTIVE_STATUS_SET.has(status)),
        statuses,
        jobIds: group.jobIds,
      };
    })
    .sort((left, right) => {
      if (left.mediaRecordId !== right.mediaRecordId) {
        return left.mediaRecordId.localeCompare(right.mediaRecordId);
      }
      return left.sourceType.localeCompare(right.sourceType);
    });

  const final = jobs.filter((job) => isFinalBrainJobStatus(job.status)).length;
  const unresolvedStatuses: Record<string, number> = {};

  for (const status of ACTIVE_STATUS_SET) {
    const count = statusCounts[status] || 0;
    if (count > 0) unresolvedStatuses[status] = count;
  }

  return {
    total: jobs.length,
    final,
    unresolved,
    unresolvedStatuses,
    status: sortedStatusCounts(statusCounts),
    bySourceType: Array.from(sourceTypeCounts.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sourceType, counts]) => ({
        sourceType,
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
        counts,
      })),
    errors,
    retryPlan,
    retryableFailedJobs: retryPlan.filter((row) => row.action === 'retry').length,
    duplicateMediaJobs,
    cost: estimateBrainQueueCost(costInput),
  };
}
