/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  classifyFailedJobRetry,
  estimateBrainQueueCost,
  isFinalBrainJobStatus,
  summarizeBrainQueue,
  type BrainQueueJobSnapshot,
} from '../queueReport';

function job(
  overrides: Partial<BrainQueueJobSnapshot> & Pick<BrainQueueJobSnapshot, 'id' | 'status'>
): BrainQueueJobSnapshot {
  return {
    id: overrides.id,
    run_id: overrides.run_id || 'run-1',
    status: overrides.status,
    source_type: overrides.source_type || 'media_coverage',
    media_record_id: overrides.media_record_id ?? null,
    normalized_url: overrides.normalized_url ?? 'https://example.com/a',
    attempts: overrides.attempts ?? 1,
    max_attempts: overrides.max_attempts ?? 3,
    error_code: overrides.error_code ?? null,
    error_detail: overrides.error_detail ?? null,
    created_at: overrides.created_at || '2026-11-22T00:00:00.000Z',
  };
}

describe('Brain queue retry safety', () => {
  it('retries only an already-failed job with a known transient error and budget left', () => {
    expect(
      classifyFailedJobRetry({
        status: 'failed',
        attempts: 1,
        max_attempts: 3,
        error_code: 'fetch_timeout',
      })
    ).toMatchObject({ retryable: true, errorCode: 'fetch_timeout', attemptsLeft: 2 });
  });

  it('treats 5xx, 429 and 408 as transient but other 4xx as permanent', () => {
    expect(
      classifyFailedJobRetry({
        status: 'failed',
        attempts: 0,
        max_attempts: 3,
        error_code: 'http_status_503',
      }).retryable
    ).toBe(true);
    expect(
      classifyFailedJobRetry({
        status: 'failed',
        attempts: 0,
        max_attempts: 3,
        error_code: 'http_status_429',
      }).retryable
    ).toBe(true);
    expect(
      classifyFailedJobRetry({
        status: 'failed',
        attempts: 0,
        max_attempts: 3,
        error_code: 'http_status_408',
      }).retryable
    ).toBe(true);
    expect(
      classifyFailedJobRetry({
        status: 'failed',
        attempts: 0,
        max_attempts: 3,
        error_code: 'http_status_403',
      }).retryable
    ).toBe(false);
  });

  it('never retries partial, completed, unknown or exhausted rows', () => {
    expect(
      classifyFailedJobRetry({
        status: 'partial',
        attempts: 0,
        max_attempts: 3,
        error_code: 'fetch_timeout',
      }).retryable
    ).toBe(false);
    expect(
      classifyFailedJobRetry({
        status: 'failed',
        attempts: 3,
        max_attempts: 3,
        error_code: 'fetch_timeout',
      }).retryable
    ).toBe(false);
    expect(
      classifyFailedJobRetry({
        status: 'failed',
        attempts: 1,
        max_attempts: 3,
        error_code: 'brand_new_error',
      }).retryable
    ).toBe(false);
    expect(
      classifyFailedJobRetry({
        status: 'failed',
        attempts: 1,
        max_attempts: 3,
        error_code: null,
      }).retryable
    ).toBe(false);
  });

  it('keeps access, paywall, metadata-only and OCR failures permanent', () => {
    for (const code of [
      'embedding_auth_failed',
      'embedding_payment_required',
      'embedding_failed',
      'paywall_detected',
      'metadata_only',
      'pdf_ocr_required',
      'media_record_archived',
    ]) {
      expect(
        classifyFailedJobRetry({
          status: 'failed',
          attempts: 0,
          max_attempts: 3,
          error_code: code,
        }).retryable
      ).toBe(false);
    }
  });
});

describe('Brain queue report', () => {
  it('accounts for every status and reports unresolved work separately', () => {
    const summary = summarizeBrainQueue(
      [
        job({ id: '1', status: 'completed', media_record_id: 'm-1' }),
        job({ id: '2', status: 'failed', media_record_id: 'm-2', error_code: 'fetch_timeout' }),
        job({
          id: '3',
          status: 'partial',
          media_record_id: 'm-3',
          error_code: 'truncated_content',
        }),
        job({ id: '4', status: 'queued', media_record_id: 'm-4' }),
        job({ id: '5', status: 'processing', media_record_id: 'm-5' }),
      ],
      { documents: 3, sourceChars: 4000, chunks: 6 }
    );

    expect(summary.total).toBe(5);
    expect(summary.final).toBe(3);
    expect(summary.unresolved).toBe(2);
    expect(summary.unresolvedStatuses).toEqual({ queued: 1, processing: 1 });
    expect(summary.status).toEqual([
      { status: 'completed', count: 1 },
      { status: 'failed', count: 1 },
      { status: 'partial', count: 1 },
      { status: 'processing', count: 1 },
      { status: 'queued', count: 1 },
    ]);
    expect(summary.retryPlan).toHaveLength(1);
    expect(summary.retryPlan[0]).toMatchObject({ jobId: '2', action: 'retry' });
    expect(summary.retryableFailedJobs).toBe(1);
    expect(summary.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'failed', errorCode: 'fetch_timeout', retryable: true }),
        expect.objectContaining({
          status: 'partial',
          errorCode: 'truncated_content',
          retryable: false,
        }),
      ])
    );
  });

  it('detects repeated jobs for the same media record and source type', () => {
    const summary = summarizeBrainQueue(
      [
        job({ id: '1', status: 'failed', media_record_id: 'm-1' }),
        job({ id: '2', status: 'queued', media_record_id: 'm-1' }),
        job({ id: '3', status: 'completed', media_record_id: 'm-1', source_type: 'article' }),
      ],
      { documents: 1, sourceChars: 10, chunks: 1 }
    );

    expect(summary.duplicateMediaJobs).toHaveLength(1);
    expect(summary.duplicateMediaJobs[0]).toMatchObject({
      mediaRecordId: 'm-1',
      sourceType: 'media_coverage',
      jobCount: 2,
      hasActiveJob: true,
    });
  });

  it('keeps cost unknown instead of zero when no verified price exists', () => {
    const unknown = estimateBrainQueueCost({
      documents: 2,
      sourceChars: 8000,
      chunks: 12,
      inputUsdPerMillion: null,
    });
    expect(unknown.estimatedEmbeddingTokens).toBe(2000);
    expect(unknown.estimatedCostUsd).toBeNull();

    const priced = estimateBrainQueueCost({
      documents: 2,
      sourceChars: 8000,
      chunks: 12,
      inputUsdPerMillion: 0.1,
    });
    expect(priced.estimatedCostUsd).toBe(0.0002);
  });

  it('recognises the existing final status set', () => {
    expect(isFinalBrainJobStatus('completed')).toBe(true);
    expect(isFinalBrainJobStatus('duplicate')).toBe(true);
    expect(isFinalBrainJobStatus('partial')).toBe(true);
    expect(isFinalBrainJobStatus('failed')).toBe(true);
    expect(isFinalBrainJobStatus('cancelled')).toBe(true);
    expect(isFinalBrainJobStatus('queued')).toBe(false);
    expect(isFinalBrainJobStatus('processing')).toBe(false);
  });
});
