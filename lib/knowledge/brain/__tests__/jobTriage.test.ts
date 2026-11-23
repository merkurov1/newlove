/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { buildTriageReport, type TriageJobInput, type TriageMediaSnapshot } from '../jobTriage';

function media(overrides: Partial<TriageMediaSnapshot> = {}): TriageMediaSnapshot {
  return {
    id: 'media-1',
    status: 'published',
    url: 'https://example.com/story',
    canonical_url: 'https://example.com/story',
    published_date: '2026-11-22',
    outlet: 'Example',
    kind: 'mention',
    indexing_status: 'failed',
    indexing_error: 'http_status_403',
    ai_metadata: null,
    ...overrides,
  };
}

function input(overrides: Partial<TriageJobInput> = {}): TriageJobInput {
  return {
    job: {
      id: 'job-1',
      run_id: 'run-1',
      status: 'failed',
      source_type: 'media_coverage',
      media_record_id: 'media-1',
      normalized_url: 'https://example.com/story',
      input_url: 'https://example.com/story',
      canonical_url: 'https://example.com/story',
      final_url: null,
      attempts: 1,
      max_attempts: 3,
      error_code: 'fetch_timeout',
      error_detail: 'The page took too long to load.',
      extraction_status: null,
      extraction_metadata: {
        stage: 'failed',
        error_debug: { name: 'BrainUrlError', message: 'ETIMEDOUT' },
      },
      title: 'Story',
      created_at: '2026-11-22T00:00:00.000Z',
      processed_at: '2026-11-22T00:01:00.000Z',
      ...(overrides.job || {}),
    },
    media: overrides.media === undefined ? media() : overrides.media,
    document: overrides.document ?? null,
    chunks: overrides.chunks ?? null,
    activeDuplicateJobIds: overrides.activeDuplicateJobIds ?? [],
  };
}

describe('Brain job triage decisions', () => {
  it('closes an access-restricted source without retrying or bypassing it', () => {
    const report = buildTriageReport([
      input({ job: { ...input().job, error_code: 'http_status_403' } }),
    ]);
    const decision = report.jobs[0];

    expect(decision.decision).toBe('close_unavailable');
    expect(decision.reasonCode).toBe('access_blocked');
    expect(decision.requiresExplicitApproval).toBe(false);
    expect(report.retryCandidates).toHaveLength(0);
  });

  it('keeps metadata-only jobs metadata-only and never marks them as full text', () => {
    const report = buildTriageReport([
      input({
        job: { ...input().job, error_code: 'metadata_only' },
        document: {
          id: 'doc-1',
          ingestion_status: 'pending',
          extraction_status: 'failed',
          media_coverage_status: 'failed',
          media_text_quality: 'metadata_only',
          media_coverage_error_code: 'metadata_only',
          chunk_count: 0,
          source_char_count: 0,
          content_origin: 'none',
          updated_at: '2026-11-22T00:00:00.000Z',
        },
        chunks: { count: 0, minChars: null, maxChars: null, firstIndex: null, lastIndex: null },
      }),
    ]);
    const decision = report.jobs[0];

    expect(decision.decision).toBe('keep_partial');
    expect(decision.reasonCode).toBe('metadata_only');
    expect(decision.indexedAsFullText).toBe(false);
  });

  it('sends needs_review and generic ingestion_failed to manual review', () => {
    const report = buildTriageReport([
      input({
        job: { ...input().job, id: 'job-review', status: 'partial', error_code: 'needs_review' },
        document: {
          id: 'doc-2',
          ingestion_status: 'pending',
          extraction_status: 'needs_review',
          media_coverage_status: 'partial',
          media_text_quality: 'partial_text',
          media_coverage_error_code: 'needs_review',
          chunk_count: 0,
          source_char_count: 900,
          content_origin: 'partial_text',
          updated_at: null,
        },
        chunks: { count: 0, minChars: null, maxChars: null, firstIndex: null, lastIndex: null },
      }),
      input({
        job: { ...input().job, id: 'job-generic', error_code: 'ingestion_failed' },
      }),
    ]);

    expect(report.jobs.find((job) => job.jobId === 'job-review')).toMatchObject({
      decision: 'manual_review',
      reasonCode: 'needs_review',
    });
    expect(report.jobs.find((job) => job.jobId === 'job-generic')).toMatchObject({
      decision: 'manual_review',
      reasonCode: 'unclassified_error',
    });
    expect(report.retryCandidates).toHaveLength(0);
  });

  it('allows only a proven transient error with retry budget left', () => {
    const report = buildTriageReport([input()]);
    const decision = report.jobs[0];

    expect(decision.decision).toBe('retry_transient');
    expect(decision.reasonCode).toBe('transient_error_with_budget');
    expect(decision.requiresExplicitApproval).toBe(true);
    expect(report.retryCandidates).toEqual([
      expect.objectContaining({ jobId: 'job-1', errorCode: 'fetch_timeout', attemptsLeft: 2 }),
    ]);
  });

  it('does not retry an exhausted transient job or a job with an active duplicate', () => {
    const report = buildTriageReport([
      input({
        job: { ...input().job, id: 'job-exhausted', attempts: 3, max_attempts: 3 },
      }),
      input({
        job: { ...input().job, id: 'job-active' },
        activeDuplicateJobIds: ['job-queued'],
      }),
    ]);

    expect(report.jobs.find((job) => job.jobId === 'job-exhausted')).toMatchObject({
      decision: 'manual_review',
      reasonCode: 'retry_budget_exhausted',
    });
    expect(report.jobs.find((job) => job.jobId === 'job-active')).toMatchObject({
      decision: 'manual_review',
      reasonCode: 'active_duplicate_job',
    });
  });

  it('keeps an already-indexed document instead of retrying and duplicating it', () => {
    const report = buildTriageReport([
      input({
        document: {
          id: 'doc-3',
          ingestion_status: 'completed',
          extraction_status: 'complete',
          media_coverage_status: 'completed',
          media_text_quality: 'full_text',
          media_coverage_error_code: null,
          chunk_count: 4,
          source_char_count: 4000,
          content_origin: 'full_text',
          updated_at: null,
        },
        chunks: { count: 4, minChars: 800, maxChars: 1200, firstIndex: 0, lastIndex: 3 },
      }),
    ]);

    expect(report.jobs[0]).toMatchObject({
      decision: 'keep_partial',
      reasonCode: 'document_already_indexed',
      indexedAsFullText: true,
    });
    expect(report.retryCandidates).toHaveLength(0);
  });

  it('flags contradictory document and chunk states for manual review', () => {
    const report = buildTriageReport([
      input({
        job: { ...input().job, id: 'job-meta-chunks', error_code: 'metadata_only' },
        document: {
          id: 'doc-4',
          ingestion_status: 'pending',
          extraction_status: 'failed',
          media_coverage_status: 'failed',
          media_text_quality: 'metadata_only',
          media_coverage_error_code: 'metadata_only',
          chunk_count: 2,
          source_char_count: 200,
          content_origin: 'none',
          updated_at: null,
        },
        chunks: { count: 2, minChars: 100, maxChars: 100, firstIndex: 0, lastIndex: 1 },
      }),
      input({
        job: { ...input().job, id: 'job-full-no-chunks' },
        document: {
          id: 'doc-5',
          ingestion_status: 'completed',
          extraction_status: 'complete',
          media_coverage_status: 'completed',
          media_text_quality: 'full_text',
          media_coverage_error_code: null,
          chunk_count: 0,
          source_char_count: 4000,
          content_origin: 'full_text',
          updated_at: null,
        },
        chunks: { count: 0, minChars: null, maxChars: null, firstIndex: null, lastIndex: null },
      }),
      input({
        job: { ...input().job, id: 'job-count-mismatch' },
        document: {
          id: 'doc-6',
          ingestion_status: 'pending',
          extraction_status: 'partial',
          media_coverage_status: 'partial',
          media_text_quality: 'partial_text',
          media_coverage_error_code: 'extraction_incomplete',
          chunk_count: 5,
          source_char_count: 1200,
          content_origin: 'partial_text',
          updated_at: null,
        },
        chunks: { count: 3, minChars: 300, maxChars: 500, firstIndex: 0, lastIndex: 2 },
      }),
    ]);

    expect(report.jobs.every((job) => job.decision === 'manual_review')).toBe(true);
    expect(report.integrityIssues.map((issue) => issue.reasonCode)).toEqual([
      'blocked_with_indexed_chunks',
      'document_chunk_contradiction',
      'chunk_count_mismatch',
    ]);
  });

  it('keeps partial paywall text but closes a paywall without text', () => {
    const partial = buildTriageReport([
      input({
        job: {
          ...input().job,
          id: 'job-paywall-partial',
          status: 'partial',
          error_code: 'paywall_detected',
        },
        document: {
          id: 'doc-7',
          ingestion_status: 'pending',
          extraction_status: 'partial',
          media_coverage_status: 'partial',
          media_text_quality: 'partial_text',
          media_coverage_error_code: 'paywall_detected',
          chunk_count: 2,
          source_char_count: 900,
          content_origin: 'partial_text',
          updated_at: null,
        },
        chunks: { count: 2, minChars: 400, maxChars: 500, firstIndex: 0, lastIndex: 1 },
      }),
    ]);
    const blocked = buildTriageReport([
      input({
        job: { ...input().job, id: 'job-paywall-empty', error_code: 'paywall_detected' },
      }),
    ]);

    expect(partial.jobs[0]).toMatchObject({ decision: 'keep_partial', reasonCode: 'paywall' });
    expect(blocked.jobs[0]).toMatchObject({
      decision: 'close_unavailable',
      reasonCode: 'paywall',
    });
  });

  it('closes missing or archived media records without touching the archive', () => {
    const missing = buildTriageReport([input({ media: null })]);
    const archived = buildTriageReport([input({ media: media({ status: 'archived' }) })]);

    expect(missing.jobs[0]).toMatchObject({
      decision: 'close_unavailable',
      reasonCode: 'media_record_missing',
    });
    expect(archived.jobs[0]).toMatchObject({
      decision: 'close_unavailable',
      reasonCode: 'media_record_archived',
    });
  });

  it('closes a gone source and records URL evidence', () => {
    const report = buildTriageReport([
      input({
        job: {
          ...input().job,
          error_code: 'http_status_404',
          final_url: 'https://example.com/story-old',
        },
      }),
    ]);

    expect(report.jobs[0]).toMatchObject({
      decision: 'close_unavailable',
      reasonCode: 'source_gone',
    });
    expect(report.jobs[0].evidence).toMatchObject({
      url: 'https://example.com/story',
      validHttpUrl: true,
      urlMatchesMedia: true,
    });
  });

  it('groups every job, counts decisions, and never auto-approves a write', () => {
    const report = buildTriageReport(
      [
        input({ job: { ...input().job, id: 'job-1', error_code: 'fetch_timeout' } }),
        input({
          job: { ...input().job, id: 'job-2', error_code: 'http_status_403' },
        }),
        input({
          job: { ...input().job, id: 'job-3', status: 'partial', error_code: 'needs_review' },
        }),
      ],
      { runId: 'run-1' }
    );

    expect(report.scope).toEqual({ runId: 'run-1', analysed: 3, failed: 2, partial: 1 });
    expect(report.decisions).toEqual({
      retry_transient: 1,
      manual_review: 1,
      keep_partial: 0,
      close_unavailable: 1,
    });
    expect(report.groups.map((group) => [group.errorCode, group.count])).toEqual(
      expect.arrayContaining([
        ['fetch_timeout', 1],
        ['http_status_403', 1],
        ['needs_review', 1],
      ])
    );
    expect(report.warnings.join(' ')).toContain('Production writes require an approved plan');
    expect(
      report.jobs.every(
        (job) => job.requiresExplicitApproval === (job.decision === 'retry_transient')
      )
    ).toBe(true);
  });
});
