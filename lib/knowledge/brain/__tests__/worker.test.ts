/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';

import type { EmbeddingClient } from '@/lib/knowledge/rag/embeddings';
import type { BrainStore } from '../store';
import type { BrainGraphStore } from '@/lib/knowledge/graph/store';
import { graphRetryDelaySeconds, isPermanentGraphError } from '@/lib/knowledge/graph/pipeline';
import { retryDelaySeconds } from '../process';
import { runBrainWorker, runGraphWorker } from '../worker';

function embeddingClient(): EmbeddingClient {
  return {
    modelId: 'baai/bge-m3',
    dimensions: 1024,
    embed: jest.fn(async (texts: string[]) =>
      texts.map(() => Array.from({ length: 1024 }, () => 0.01))
    ),
  };
}

function brainRun(id = 'run-1') {
  return {
    id,
    status: 'running',
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
  };
}

function processed(status: 'completed' | 'failed' = 'completed') {
  return {
    state: 'processed',
    job: {
      id: 'job-1',
      status,
      error_code: status === 'failed' ? 'embedding_failed' : null,
      error_detail: status === 'failed' ? 'provider rejected request' : null,
    },
    progress: {
      total: 1,
      queued: 0,
      processing: 0,
      completed: 1,
      duplicate: 0,
      partial: 0,
      failed: 0,
      cancelled: 0,
      done: true,
    },
    runStatus: 'completed',
  };
}

describe('autonomous worker', () => {
  it('recovers leases, processes a bounded batch and queues graph once', async () => {
    const store = {
      recoverStaleJobs: jest.fn(async () => 1),
      listRunningRuns: jest.fn(async () => [brainRun()]),
    } as unknown as BrainStore;
    const processNext = jest.fn() as jest.Mock;
    processNext
      .mockResolvedValueOnce(processed('completed') as never)
      .mockResolvedValueOnce(({
        state: 'done',
        progress: {
          total: 1,
          queued: 0,
          processing: 0,
          completed: 1,
          duplicate: 0,
          partial: 0,
          failed: 0,
          cancelled: 0,
          done: true,
        },
        runStatus: 'completed',
      }) as never);
    const queueGraph = jest.fn(async () => ({
      status: 'queued' as const,
      runId: 'graph-run-1',
      jobs: 1,
    }));

    const result = await runBrainWorker({
      store,
      embeddingClient: embeddingClient(),
      processNext: processNext as never,
      queueGraph: queueGraph as never,
      telemetry: null,
      maxJobs: 2,
      maxDurationMs: 60_000,
    });

    expect(store.recoverStaleJobs).toHaveBeenCalledWith(900);
    expect(processNext).toHaveBeenCalledTimes(2);
    expect(queueGraph).toHaveBeenCalledTimes(1);
    expect(result.processed).toBe(1);
    expect(result.graphRunsQueued).toBe(1);
    expect(result.status).toBe('completed');
    expect(result.stoppedBy).toBe('drained');
  });

  it('stops at maxJobs instead of running forever', async () => {
    const store = {
      recoverStaleJobs: jest.fn(async () => 0),
      listRunningRuns: jest.fn(async () => [brainRun()]),
    } as unknown as BrainStore;
    const processNext = jest.fn(async () => processed('completed'));

    const result = await runBrainWorker({
      store,
      embeddingClient: embeddingClient(),
      processNext: processNext as never,
      queueGraph: jest.fn() as never,
      telemetry: null,
      maxJobs: 2,
      maxDurationMs: 60_000,
    });

    expect(processNext).toHaveBeenCalledTimes(2);
    expect(result.processed).toBe(2);
    expect(result.stoppedBy).toBe('max_jobs');
  });

  it('counts failed jobs and preserves the error summary', async () => {
    const store = {
      recoverStaleJobs: jest.fn(async () => 0),
      listRunningRuns: jest.fn(async () => [brainRun()]),
    } as unknown as BrainStore;
    const processNext = jest.fn() as jest.Mock;
    processNext
      .mockResolvedValueOnce(processed('failed') as never)
      .mockResolvedValueOnce(({
        state: 'done',
        progress: { done: true },
        runStatus: 'completed_with_errors',
      }) as never);

    const result = await runBrainWorker({
      store,
      embeddingClient: embeddingClient(),
      processNext: processNext as never,
      queueGraph: (async () => ({ status: 'skipped', reason: 'test' })) as never,
      telemetry: null,
      maxJobs: 2,
      maxDurationMs: 60_000,
    });

    expect(result.failed).toBe(1);
    expect(result.status).toBe('completed_with_errors');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('stops graph worker at its bounded batch', async () => {
    const store = {
      recoverStaleJobs: jest.fn(async () => 0),
      listRunningRuns: jest.fn(async () => [
        {
          id: 'graph-run-1',
          status: 'running',
          extractor_version: 'brain-graph-v1',
          model: 'deepseek-chat',
          total_documents: 3,
          completed_documents: 0,
          failed_documents: 0,
          skipped_documents: 0,
          metadata: {},
          created_at: '',
          updated_at: '',
          completed_at: null,
        },
      ]),
    } as unknown as BrainGraphStore;
    const processNext = jest.fn(async () => ({
      state: 'processed' as const,
      job: { id: 'graph-job-1', status: 'completed' },
      progress: {
        total: 1,
        queued: 0,
        processing: 0,
        completed: 1,
        skipped: 0,
        failed: 0,
        cancelled: 0,
        done: true,
      },
      runStatus: 'completed',
      documentId: 'doc-1',
      skipped: false,
      entityCount: 1,
      relationshipCount: 0,
    }));

    const result = await runGraphWorker({
      store,
      processNext: processNext as never,
      graphConfigured: true,
      telemetry: null,
      maxJobs: 2,
      maxDurationMs: 60_000,
    });

    expect(processNext).toHaveBeenCalledTimes(2);
    expect(result.processed).toBe(2);
    expect(result.stoppedBy).toBe('max_jobs');
  });
});

describe('retry policy', () => {
  it('uses exponential backoff with a cap', () => {
    expect(retryDelaySeconds(1)).toBe(15);
    expect(retryDelaySeconds(2)).toBe(30);
    expect(retryDelaySeconds(3)).toBe(60);
    expect(retryDelaySeconds(10)).toBe(900);
    expect(graphRetryDelaySeconds(2)).toBe(30);
  });

  it('classifies auth, payment and deterministic graph errors as permanent', () => {
    expect(isPermanentGraphError({ status: 401 }, 'graph_extraction_failed')).toBe(true);
    expect(isPermanentGraphError({ status: 402 }, 'graph_extraction_failed')).toBe(true);
    expect(isPermanentGraphError(new Error('document_has_no_chunks'), 'document_has_no_chunks')).toBe(
      true
    );
    expect(isPermanentGraphError({ status: 500 }, 'graph_extraction_failed')).toBe(false);
  });
});
