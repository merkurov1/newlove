/**
 * Item-by-item triage for failed and partial Brain ingestion jobs.
 *
 * This module is deliberately pure: it never talks to the database, the
 * network or a queue. The operator CLI loads one snapshot per job (job row,
 * Media Archive record, linked document and chunk statistics) and this module
 * returns an explicit, auditable decision for every failed/partial job.
 *
 * Hard rules encoded here:
 *   * only a proven transient error with retry budget left can be retried;
 *   * an unclassified or generic `ingestion_failed` is never auto-retried;
 *   * access restrictions (401/403/407/451), paywalls, robots and authentication
 *     are never bypassed and never retried;
 *   * `metadata_only` is reported as metadata-only, never as full text;
 *   * `partial` rows are kept as partial unless they need operator review;
 *   * an already-indexed document is never re-created or duplicated;
 *   * contradictory document/chunk state always goes to manual review.
 */

import { normalizeArchiveUrl, urlDate } from '@/lib/knowledge/media/archiveAudit';

import { classifyFailedJobRetry } from './queueReport';

export type TriageJobSnapshot = {
  id: string;
  run_id: string;
  status: string;
  source_type: string;
  media_record_id: string | null;
  normalized_url: string | null;
  input_url?: string | null;
  canonical_url?: string | null;
  final_url?: string | null;
  attempts: number;
  max_attempts: number;
  error_code: string | null;
  error_detail: string | null;
  extraction_status?: string | null;
  extraction_metadata?: Record<string, unknown> | null;
  title?: string | null;
  created_at: string;
  processed_at?: string | null;
};

export type TriageMediaSnapshot = {
  id: string;
  status: string | null;
  url: string | null;
  canonical_url: string | null;
  published_date: string | null;
  outlet: string | null;
  kind: string | null;
  indexing_status: string | null;
  indexing_error: string | null;
  ai_metadata: Record<string, unknown> | null;
};

export type TriageDocumentSnapshot = {
  id: string;
  ingestion_status: string | null;
  extraction_status: string | null;
  media_coverage_status: string | null;
  media_text_quality: string | null;
  media_coverage_error_code: string | null;
  chunk_count: number;
  source_char_count: number;
  content_origin: string | null;
  updated_at: string | null;
};

export type TriageChunkStats = {
  count: number;
  minChars: number | null;
  maxChars: number | null;
  firstIndex: number | null;
  lastIndex: number | null;
};

export type TriageJobInput = {
  job: TriageJobSnapshot;
  media: TriageMediaSnapshot | null;
  document: TriageDocumentSnapshot | null;
  chunks: TriageChunkStats | null;
  /** Queued/processing jobs for the same media record or URL. */
  activeDuplicateJobIds?: string[];
};

export type TriageDecision =
  | 'retry_transient'
  | 'manual_review'
  | 'keep_partial'
  | 'close_unavailable';

export type TriageReasonCode =
  | 'not_a_failure_status'
  | 'transient_error_with_budget'
  | 'retry_budget_exhausted'
  | 'active_duplicate_job'
  | 'access_blocked'
  | 'authentication_required'
  | 'paywall'
  | 'source_gone'
  | 'unsupported_source'
  | 'metadata_only'
  | 'needs_review'
  | 'partial_text_kept'
  | 'document_already_indexed'
  | 'media_record_missing'
  | 'media_record_archived'
  | 'media_url_missing'
  | 'document_chunk_contradiction'
  | 'chunk_count_mismatch'
  | 'blocked_with_indexed_chunks'
  | 'embedding_configuration'
  | 'extraction_quality'
  | 'unclassified_error'
  | 'missing_error_code';

export type TriageEvidence = {
  url: string | null;
  validHttpUrl: boolean;
  urlMatchesMedia: boolean | null;
  urlDate: string | null;
  mediaStatus: string | null;
  mediaIndexingStatus: string | null;
  mediaIndexingError: string | null;
  documentId: string | null;
  documentIngestionStatus: string | null;
  documentExtractionStatus: string | null;
  documentCoverageStatus: string | null;
  documentTextQuality: string | null;
  documentChunkCount: number;
  actualChunkRows: number;
  sourceCharCount: number;
  contentOrigin: string | null;
  activeDuplicateJobIds: string[];
  extractionStage: string | null;
  extractionReason: string | null;
  errorDebugName: string | null;
  errorDebugMessage: string | null;
  extractionDiagnostics: {
    paywallDetected: boolean | null;
    truncated: boolean | null;
    wordCount: number | null;
    charCount: number | null;
    paragraphCount: number | null;
    canonicalMismatch: boolean | null;
  } | null;
};

export type TriageJobDecision = {
  jobId: string;
  runId: string;
  status: string;
  sourceType: string;
  mediaRecordId: string | null;
  title: string | null;
  errorCode: string | null;
  errorDetail: string | null;
  attempts: number;
  maxAttempts: number;
  attemptsLeft: number;
  decision: TriageDecision;
  reasonCode: TriageReasonCode;
  reason: string;
  /** Retry is never pre-approved; the operator must pass the job id explicitly. */
  requiresExplicitApproval: boolean;
  /** True only when indexed chunks exist and may be presented as full text. */
  indexedAsFullText: boolean;
  evidence: TriageEvidence;
};

export type TriageGroup = {
  status: string;
  errorCode: string | null;
  count: number;
  decisions: Record<TriageDecision, number>;
  retryableCount: number;
  jobIds: string[];
};

export type TriageIntegrityIssue = {
  jobId: string;
  mediaRecordId: string | null;
  reasonCode: TriageReasonCode;
  message: string;
};

export type TriageReport = {
  scope: {
    runId: string | null;
    analysed: number;
    failed: number;
    partial: number;
  };
  decisions: Record<TriageDecision, number>;
  groups: TriageGroup[];
  integrityIssues: TriageIntegrityIssue[];
  retryCandidates: Array<{
    jobId: string;
    mediaRecordId: string | null;
    errorCode: string | null;
    attemptsLeft: number;
    url: string | null;
    note: string;
  }>;
  jobs: TriageJobDecision[];
  warnings: string[];
};

const ACCESS_BLOCKED_CODES = new Set(['http_status_401', 'http_status_403', 'http_status_451']);
const AUTHENTICATION_CODES = new Set(['http_status_407']);
const SOURCE_GONE_CODES = new Set(['http_status_404', 'http_status_410']);
const UNSUPPORTED_CODES = new Set([
  'unsupported_content_type',
  'response_too_large',
  'pdf_password_protected',
  'pdf_signature_invalid',
  'pdf_mime_invalid',
  'txt_mime_invalid',
  'txt_binary_content',
  'txt_encoding_invalid',
]);
const EMBEDDING_CONFIGURATION_CODES = new Set([
  'embedding_auth_failed',
  'embedding_payment_required',
  'embedding_not_configured',
  'embedding_configuration_invalid',
  'embedding_dimension_mismatch',
  'embedding_model_mismatch',
]);

function lower(value: string | null | undefined): string | null {
  const normalized = (value || '').trim().toLowerCase();
  return normalized || null;
}

function isHttpUrl(value: string | null): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function pickUrl(input: TriageJobInput): string | null {
  return (
    input.media?.canonical_url ||
    input.media?.url ||
    input.job.canonical_url ||
    input.job.final_url ||
    input.job.normalized_url ||
    input.job.input_url ||
    null
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function metadataErrorDebug(metadata: Record<string, unknown> | null | undefined): {
  name: string | null;
  message: string | null;
} {
  const debug = asRecord(asRecord(metadata)?.error_debug);

  return {
    name: asString(debug?.name)?.slice(0, 80) || null,
    message: asString(debug?.message)?.replace(/\s+/g, ' ').slice(0, 300) || null,
  };
}

function activeDuplicateIds(input: TriageJobInput): string[] {
  return (input.activeDuplicateJobIds || []).filter((id) => id !== input.job.id);
}

function actualChunkCount(input: TriageJobInput): number {
  if (input.chunks) return Math.max(0, Number(input.chunks.count) || 0);
  return Math.max(0, Number(input.document?.chunk_count) || 0);
}

function hasIndexedChunks(input: TriageJobInput): boolean {
  return actualChunkCount(input) > 0;
}

function indexedAsFullText(input: TriageJobInput): boolean {
  const quality = lower(input.document?.media_text_quality);
  return hasIndexedChunks(input) && quality === 'full_text';
}

function evidenceFor(input: TriageJobInput): TriageEvidence {
  const url = pickUrl(input);
  const mediaUrl = input.media?.canonical_url || input.media?.url || null;
  const debug = metadataErrorDebug(input.job.extraction_metadata);
  const extractionMetadata = asRecord(input.job.extraction_metadata);
  const diagnostics = asRecord(extractionMetadata?.diagnostics);
  const actualRows = actualChunkCount(input);

  return {
    url,
    validHttpUrl: isHttpUrl(url),
    urlMatchesMedia:
      mediaUrl && url ? normalizeArchiveUrl(mediaUrl) === normalizeArchiveUrl(url) : null,
    urlDate: urlDate(url),
    mediaStatus: input.media?.status ?? null,
    mediaIndexingStatus: input.media?.indexing_status ?? null,
    mediaIndexingError: input.media?.indexing_error ?? null,
    documentId: input.document?.id ?? null,
    documentIngestionStatus: input.document?.ingestion_status ?? null,
    documentExtractionStatus: input.document?.extraction_status ?? null,
    documentCoverageStatus: input.document?.media_coverage_status ?? null,
    documentTextQuality: input.document?.media_text_quality ?? null,
    documentChunkCount: Math.max(0, Number(input.document?.chunk_count) || 0),
    actualChunkRows: actualRows,
    sourceCharCount: Math.max(0, Number(input.document?.source_char_count) || 0),
    contentOrigin: input.document?.content_origin ?? null,
    activeDuplicateJobIds: activeDuplicateIds(input),
    extractionStage: asString(extractionMetadata?.stage),
    extractionReason: asString(extractionMetadata?.reason),
    errorDebugName: debug.name,
    errorDebugMessage: debug.message,
    extractionDiagnostics: diagnostics
      ? {
          paywallDetected: asBoolean(diagnostics.paywallDetected),
          truncated: asBoolean(diagnostics.truncated),
          wordCount: asNumber(diagnostics.wordCount),
          charCount: asNumber(diagnostics.charCount),
          paragraphCount: asNumber(diagnostics.paragraphCount),
          canonicalMismatch: asBoolean(extractionMetadata?.canonical_mismatch),
        }
      : null,
  };
}

/**
 * A document/chunk contradiction must be reviewed before any retry. Retrying a
 * job whose document already holds chunks would replace or duplicate content
 * that the owner may already rely on.
 */
function integrityReason(
  input: TriageJobInput
): { code: TriageReasonCode; message: string } | null {
  const document = input.document;
  if (!document) return null;

  const declared = Math.max(0, Number(document.chunk_count) || 0);
  const actual = input.chunks ? Math.max(0, Number(input.chunks.count) || 0) : declared;
  const quality = lower(document.media_text_quality);

  if (input.chunks && declared !== actual) {
    return {
      code: 'chunk_count_mismatch',
      message: `Document declares ${declared} chunk(s) but ${actual} row(s) exist.`,
    };
  }

  if (quality === 'full_text' && actual === 0) {
    return {
      code: 'document_chunk_contradiction',
      message: 'Document is labelled full_text but has no chunk rows.',
    };
  }

  if ((quality === 'metadata_only' || quality === 'blocked') && actual > 0) {
    return {
      code: 'blocked_with_indexed_chunks',
      message: `Document is labelled ${quality} but ${actual} chunk row(s) exist; old content may be preserved.`,
    };
  }

  if (lower(document.ingestion_status) === 'completed' && actual === 0) {
    return {
      code: 'document_chunk_contradiction',
      message: 'Document ingestion_status is completed but it has no chunk rows.',
    };
  }

  return null;
}

function buildDecision(input: TriageJobInput): TriageJobDecision {
  const { job } = input;
  const status = lower(job.status) || job.status;
  const errorCode = lower(job.error_code);
  const attempts = Math.max(0, Number(job.attempts) || 0);
  const maxAttempts = Math.max(0, Number(job.max_attempts) || 0);
  const attemptsLeft = Math.max(0, maxAttempts - attempts);
  const chunks = actualChunkCount(input);
  const quality = lower(input.document?.media_text_quality);
  const mediaStatus = lower(input.media?.status);
  const duplicates = activeDuplicateIds(input);

  const result = (
    decision: TriageDecision,
    reasonCode: TriageReasonCode,
    reason: string
  ): TriageJobDecision => ({
    jobId: job.id,
    runId: job.run_id,
    status: job.status,
    sourceType: job.source_type,
    mediaRecordId: job.media_record_id,
    title: job.title || asString(input.media?.ai_metadata?.title) || input.media?.id || null,
    errorCode: job.error_code,
    errorDetail: job.error_detail,
    attempts,
    maxAttempts,
    attemptsLeft,
    decision,
    reasonCode,
    reason,
    requiresExplicitApproval: decision === 'retry_transient',
    indexedAsFullText: indexedAsFullText(input),
    evidence: evidenceFor(input),
  });

  if (status !== 'failed' && status !== 'partial') {
    return result(
      'manual_review',
      'not_a_failure_status',
      `Job status is ${job.status}; this report only accepts failed or partial rows.`
    );
  }

  if (!input.media && job.source_type === 'media_coverage') {
    return result(
      'close_unavailable',
      'media_record_missing',
      'The Media Archive record is missing. Keep bibliographic metadata; do not re-create it automatically.'
    );
  }

  if (mediaStatus === 'archived') {
    return result(
      'close_unavailable',
      'media_record_archived',
      'The Media Archive record is archived. Do not re-index it without an owner decision.'
    );
  }

  if (input.media && !input.media.url && !input.media.canonical_url) {
    return result(
      'close_unavailable',
      'media_url_missing',
      'The Media Archive record has no usable publication URL. Keep metadata-only state.'
    );
  }

  const contradiction = integrityReason(input);
  if (contradiction) {
    return result('manual_review', contradiction.code, contradiction.message);
  }

  if (errorCode && ACCESS_BLOCKED_CODES.has(errorCode)) {
    return result(
      'close_unavailable',
      'access_blocked',
      'The source returned an access restriction. Do not bypass authentication or robots; keep metadata and mark the text unavailable.'
    );
  }

  if (errorCode && AUTHENTICATION_CODES.has(errorCode)) {
    return result(
      'close_unavailable',
      'authentication_required',
      'The source requires authentication. Do not bypass it; keep metadata and mark the text unavailable.'
    );
  }

  if (errorCode === 'http_status_402' || (errorCode && errorCode.includes('paywall'))) {
    return chunks > 0
      ? result(
          'keep_partial',
          'paywall',
          'Only a paywalled preview is available. Existing partial chunks are kept; the paywall is not bypassed.'
        )
      : result(
          'close_unavailable',
          'paywall',
          'The source is paywalled and no article text is available. Keep metadata; do not bypass the paywall.'
        );
  }

  if (errorCode && SOURCE_GONE_CODES.has(errorCode)) {
    return result(
      'close_unavailable',
      'source_gone',
      'The source URL is gone. Verify the canonical URL manually; do not retry the dead URL.'
    );
  }

  if (errorCode && UNSUPPORTED_CODES.has(errorCode)) {
    return result(
      'close_unavailable',
      'unsupported_source',
      'The source type cannot be indexed by this pipeline. Keep metadata; a manual source conversion is required.'
    );
  }

  if (errorCode === 'metadata_only') {
    if (chunks > 0) {
      return result(
        'manual_review',
        'blocked_with_indexed_chunks',
        'The job is metadata_only but indexed chunks exist. Review before presenting any text as full content.'
      );
    }

    return result(
      'keep_partial',
      'metadata_only',
      'Only title and description were available. Keep the record as metadata-only; never label it as full text.'
    );
  }

  if (errorCode === 'needs_review') {
    return result(
      'manual_review',
      'needs_review',
      'Extraction quality requires operator review before the text can be indexed or presented as complete.'
    );
  }

  if (errorCode && EMBEDDING_CONFIGURATION_CODES.has(errorCode)) {
    return result(
      'manual_review',
      'embedding_configuration',
      'Embedding configuration or credentials must be fixed first; retrying the job cannot help.'
    );
  }

  if (
    errorCode === 'pdf_ocr_required' ||
    errorCode === 'pdf_no_text' ||
    errorCode === 'pdf_empty'
  ) {
    return result(
      'manual_review',
      'extraction_quality',
      'The PDF has no usable text layer. OCR or a different source is an explicit operator decision.'
    );
  }

  if (status === 'partial') {
    if (chunks > 0) {
      return result(
        'keep_partial',
        quality === 'metadata_only' ? 'metadata_only' : 'partial_text_kept',
        'The document already has partial indexed chunks. Keep it partial; do not replace or duplicate it.'
      );
    }

    return result(
      'manual_review',
      'extraction_quality',
      'The job is partial but has no chunk rows. Operator review is required before any retry.'
    );
  }

  if (!errorCode) {
    return result(
      'manual_review',
      'missing_error_code',
      'The failed job has no error code or debug message. Manual review is required before any retry.'
    );
  }

  const classification = classifyFailedJobRetry(job);
  if (!classification.retryable) {
    if (classification.reason === 'Retry budget is exhausted.' || attemptsLeft <= 0) {
      return result(
        'manual_review',
        'retry_budget_exhausted',
        `The transient error (${errorCode}) exhausted its retry budget (${attempts}/${maxAttempts}).`
      );
    }

    return result(
      'manual_review',
      'unclassified_error',
      `Error ${errorCode} is not on the proven-transient list. Automatic retry is not authorized.`
    );
  }

  if (duplicates.length > 0) {
    return result(
      'manual_review',
      'active_duplicate_job',
      `Another queued/processing job exists for the same record or URL (${duplicates.length}). Resolve it before retrying.`
    );
  }

  if (chunks > 0) {
    return result(
      'keep_partial',
      'document_already_indexed',
      'The linked document already has indexed chunks. Keep the existing document; a retry could duplicate content.'
    );
  }

  return result(
    'retry_transient',
    'transient_error_with_budget',
    `Transient error ${errorCode} with ${attemptsLeft} attempt(s) left. Retry only this explicit job id after approval.`
  );
}

function emptyDecisionCounts(): Record<TriageDecision, number> {
  return {
    retry_transient: 0,
    manual_review: 0,
    keep_partial: 0,
    close_unavailable: 0,
  };
}

export function buildTriageReport(
  inputs: TriageJobInput[],
  options: { runId?: string | null } = {}
): TriageReport {
  const jobs = inputs.map(buildDecision);
  const decisions = emptyDecisionCounts();
  const groups = new Map<string, TriageGroup>();
  const integrityIssues: TriageIntegrityIssue[] = [];
  const retryCandidates: TriageReport['retryCandidates'] = [];
  const warnings: string[] = [];

  for (const decision of jobs) {
    decisions[decision.decision] += 1;

    const key = `${decision.status}|${decision.errorCode || ''}`;
    const group =
      groups.get(key) ||
      ({
        status: decision.status,
        errorCode: decision.errorCode,
        count: 0,
        decisions: emptyDecisionCounts(),
        retryableCount: 0,
        jobIds: [],
      } satisfies TriageGroup);

    group.count += 1;
    group.decisions[decision.decision] += 1;
    if (decision.decision === 'retry_transient') group.retryableCount += 1;
    group.jobIds.push(decision.jobId);
    groups.set(key, group);

    if (
      decision.reasonCode === 'chunk_count_mismatch' ||
      decision.reasonCode === 'document_chunk_contradiction' ||
      decision.reasonCode === 'blocked_with_indexed_chunks'
    ) {
      integrityIssues.push({
        jobId: decision.jobId,
        mediaRecordId: decision.mediaRecordId,
        reasonCode: decision.reasonCode,
        message: decision.reason,
      });
    }

    if (decision.decision === 'retry_transient') {
      retryCandidates.push({
        jobId: decision.jobId,
        mediaRecordId: decision.mediaRecordId,
        errorCode: decision.errorCode,
        attemptsLeft: decision.attemptsLeft,
        url: decision.evidence.url,
        note: 'Retry only after explicit approval; pass this exact job id to --retry-job.',
      });
    }

    if (!decision.evidence.validHttpUrl) {
      warnings.push(`Job ${decision.jobId} has no valid HTTP URL in media/job evidence.`);
    }
    if (decision.evidence.urlMatchesMedia === false) {
      warnings.push(
        `Job ${decision.jobId} URL does not match the Media Archive canonical URL; verify before retrying.`
      );
    }
    if (decision.evidence.activeDuplicateJobIds.length > 0) {
      warnings.push(
        `Job ${decision.jobId} has ${decision.evidence.activeDuplicateJobIds.length} active duplicate job(s).`
      );
    }
  }

  if (retryCandidates.length > 0) {
    warnings.push(
      `${retryCandidates.length} job(s) are eligible for a bounded retry, but no row was changed. Production writes require an approved plan and explicit --retry-job ids.`
    );
  }
  if (integrityIssues.length > 0) {
    warnings.push(
      `${integrityIssues.length} job(s) have contradictory document/chunk state and must be reviewed manually.`
    );
  }
  const missingEvidence = jobs.filter(
    (job) => job.decision === 'manual_review' && job.reasonCode === 'missing_error_code'
  ).length;
  if (missingEvidence > 0) {
    warnings.push(
      `${missingEvidence} failed job(s) have no error code; logs must be inspected manually.`
    );
  }

  return {
    scope: {
      runId: options.runId ?? null,
      analysed: jobs.length,
      failed: jobs.filter((job) => job.status === 'failed').length,
      partial: jobs.filter((job) => job.status === 'partial').length,
    },
    decisions,
    groups: Array.from(groups.values()).sort(
      (left, right) =>
        right.count - left.count ||
        left.status.localeCompare(right.status) ||
        (left.errorCode || '').localeCompare(right.errorCode || '')
    ),
    integrityIssues,
    retryCandidates,
    jobs,
    warnings,
  };
}
