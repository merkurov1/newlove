/** @jest-environment node */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

import type { MediaAnalysisEligibleInput, MediaAnalysisRun } from '../analysisStore';
import { MEDIA_ANALYZER_VERSION } from '../intelligence';

const mockStore: any = {};
const mockRunMediaAnalysis: any = jest.fn();

import { enqueueMediaAnalyses, processMediaAnalysisBatch } from '../analysisQueue';

const candidate: MediaAnalysisEligibleInput = {
  mediaRecordId: '11111111-1111-4111-8111-111111111111',
  documentId: 'doc_media_11111111111141118111111111111111',
  contentHash: 'a'.repeat(64),
  chunkCount: 4,
  textQuality: 'full_text',
  title: 'Publication',
  outlet: 'Outlet',
  kind: 'interview',
  topic: 'AI & Tech',
  publishedDate: '2026-10-29',
  lang: 'EN',
};

function run(overrides: Partial<MediaAnalysisRun> = {}): MediaAnalysisRun {
  return {
    id: 'run-1',
    media_record_id: candidate.mediaRecordId,
    document_id: candidate.documentId,
    content_hash: candidate.contentHash,
    analyzer_version: MEDIA_ANALYZER_VERSION,
    model: 'deepseek-chat',
    status: 'processing',
    quote_count: 0,
    relation_count: 0,
    topic_count: 0,
    rejected_candidate_count: 0,
    error_code: null,
    error_detail: null,
    metadata: {},
    attempt: 1,
    max_attempts: 3,
    retry_after: null,
    lease_expires_at: null,
    worker_id: 'test-worker',
    requested_by: null,
    requested_via: 'bulk',
    force_refresh: false,
    started_at: new Date().toISOString(),
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function claimOnce(value: MediaAnalysisRun) {
  const fn: any = jest.fn();
  fn.mockResolvedValueOnce(value).mockResolvedValueOnce(null);
  return fn;
}

beforeEach(() => {
  for (const key of Object.keys(mockStore)) delete mockStore[key];
  mockRunMediaAnalysis.mockReset();
});

describe('Media analysis queue', () => {
  it('skips a record whose content hash and analyzer version are unchanged', async () => {
    mockStore.listEligibleInputs = jest.fn(async () => [candidate]);
    mockStore.latestCompletedByRecord = jest.fn(
      async () =>
        new Map([
          [
            candidate.mediaRecordId,
            run({ status: 'completed', content_hash: candidate.contentHash }),
          ],
        ])
    );
    mockStore.findActiveRun = jest.fn(async () => null);
    mockStore.createRun = jest.fn();

    const result = await enqueueMediaAnalyses({ mode: 'all', store: mockStore });

    expect(result.eligible).toBe(1);
    expect(result.queued).toBe(0);
    expect(result.upToDate).toBe(1);
    expect(mockStore.createRun).not.toHaveBeenCalled();
  });

  it('queues changed content and does not duplicate an active run', async () => {
    const second = {
      ...candidate,
      mediaRecordId: '22222222-2222-4222-8222-222222222222',
      contentHash: 'b'.repeat(64),
    };

    mockStore.listEligibleInputs = jest.fn(async () => [candidate, second]);
    mockStore.latestCompletedByRecord = jest.fn(
      async () =>
        new Map([
          [
            candidate.mediaRecordId,
            run({ status: 'completed', content_hash: 'c'.repeat(64) }),
          ],
        ])
    );
    mockStore.findActiveRun = jest.fn(async (id: string) =>
      id === second.mediaRecordId ? run({ status: 'pending', media_record_id: id }) : null
    );
    mockStore.createRun = jest.fn(async () => run({ status: 'pending' }));

    const result = await enqueueMediaAnalyses({ mode: 'all', store: mockStore });

    expect(result.queued).toBe(1);
    expect(result.alreadyQueued).toBe(1);
    expect(result.upToDate).toBe(0);
    expect(mockStore.createRun).toHaveBeenCalledTimes(1);
  });

  it('force refresh bypasses the up-to-date check', async () => {
    mockStore.listEligibleInputs = jest.fn(async () => [candidate]);
    mockStore.latestCompletedByRecord = jest.fn(
      async () =>
        new Map([
          [
            candidate.mediaRecordId,
            run({ status: 'completed', content_hash: candidate.contentHash }),
          ],
        ])
    );
    mockStore.findActiveRun = jest.fn(async () => null);
    mockStore.createRun = jest.fn(async () => run({ status: 'pending', force_refresh: true }));

    const result = await enqueueMediaAnalyses({
      mode: 'selected',
      recordIds: [candidate.mediaRecordId],
      force: true,
      store: mockStore,
    });

    expect(result.queued).toBe(1);
    expect(result.upToDate).toBe(0);
  });

  it('counts selected records without eligible text as not eligible', async () => {
    mockStore.listEligibleInputs = jest.fn(async () => [candidate]);
    mockStore.latestCompletedByRecord = jest.fn(async () => new Map());
    mockStore.findActiveRun = jest.fn(async () => null);
    mockStore.createRun = jest.fn(async () => run({ status: 'pending' }));

    const result = await enqueueMediaAnalyses({
      mode: 'selected',
      recordIds: [candidate.mediaRecordId, '33333333-3333-4333-8333-333333333333'],
      store: mockStore,
    });

    expect(result.queued).toBe(1);
    expect(result.notEligible).toBe(1);
  });

  it('processes a claimed run and reports completion', async () => {
    const claimed = run();
    mockStore.claimNextRun = claimOnce(claimed);
    mockStore.heartbeatRun = jest.fn(async () => true);
    mockStore.failRun = jest.fn(async () => 'failed');
    mockRunMediaAnalysis.mockResolvedValue({
      runId: claimed.id,
      skipped: false,
      quoteCount: 2,
      topicCount: 1,
      relationCount: 1,
      rejectedCandidateCount: 0,
    });

    const result = await processMediaAnalysisBatch({
      limit: 1,
      store: mockStore,
      runAnalysis: mockRunMediaAnalysis,
    });

    expect(result.claimed).toBe(1);
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results[0]?.status).toBe('completed');
  });

  it('retries a transient model error within the attempt budget', async () => {
    const claimed = run({ attempt: 1, max_attempts: 3 });
    mockStore.claimNextRun = claimOnce(claimed);
    mockStore.heartbeatRun = jest.fn(async () => true);
    mockStore.failRun = jest.fn(async () => 'retried');
    mockRunMediaAnalysis.mockRejectedValue(new Error('deepseek_timeout'));

    const result = await processMediaAnalysisBatch({
      limit: 1,
      store: mockStore,
      runAnalysis: mockRunMediaAnalysis,
    });

    expect(result.retried).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockStore.failRun).toHaveBeenCalledWith(
      claimed.id,
      'deepseek_timeout',
      expect.any(String),
      { retryable: true }
    );
  });

  it('does not retry a permanent input error', async () => {
    const claimed = run({ attempt: 3, max_attempts: 3 });
    mockStore.claimNextRun = claimOnce(claimed);
    mockStore.heartbeatRun = jest.fn(async () => true);
    mockStore.failRun = jest.fn(async () => 'failed');
    mockRunMediaAnalysis.mockRejectedValue(new Error('media_analysis_no_chunks'));

    const result = await processMediaAnalysisBatch({
      limit: 1,
      store: mockStore,
      runAnalysis: mockRunMediaAnalysis,
    });

    expect(result.failed).toBe(1);
    expect(result.retried).toBe(0);
    expect(mockStore.failRun).toHaveBeenCalledWith(
      claimed.id,
      'media_analysis_no_chunks',
      expect.any(String),
      { retryable: false }
    );
  });

  it('re-enqueues a failed rerun even when an older successful run has the same hash', async () => {
    mockStore.listRecentRuns = jest.fn(async () => [
      run({ id: 'run-failed', status: 'failed' }),
      run({ id: 'run-old', status: 'completed', content_hash: candidate.contentHash }),
    ]);
    mockStore.listEligibleInputs = jest.fn(async () => [candidate]);
    mockStore.latestCompletedByRecord = jest.fn(
      async () =>
        new Map([
          [
            candidate.mediaRecordId,
            run({ id: 'run-old', status: 'completed', content_hash: candidate.contentHash }),
          ],
        ])
    );
    mockStore.findActiveRun = jest.fn(async () => null);
    mockStore.createRun = jest.fn(async () => run({ status: 'pending' }));

    const result = await enqueueMediaAnalyses({
      mode: 'retry_failed',
      store: mockStore,
    });

    expect(result.queued).toBe(1);
    expect(result.upToDate).toBe(0);
    expect(mockStore.createRun).toHaveBeenCalledWith(
      expect.objectContaining({ requestedVia: 'retry' })
    );
  });
});
