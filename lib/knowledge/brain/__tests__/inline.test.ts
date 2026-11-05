import type { EmbeddingClient } from '@/lib/knowledge/rag/embeddings';

import { processBrainRunInline } from '../inline';

jest.mock('../process', () => ({
  processNextBrainJob: jest.fn(),
}));

const { processNextBrainJob } = jest.requireMock('../process') as {
  processNextBrainJob: jest.Mock;
};

const fakeEmbeddingClient: EmbeddingClient = {
  modelId: 'baai/bge-m3',
  dimensions: 1024,
  embed: async () => [[0]],
};

describe('processBrainRunInline', () => {
  beforeEach(() => {
    processNextBrainJob.mockReset();
  });

  it('reports a truthful error when embeddings are not configured', async () => {
    const result = await processBrainRunInline({
      store: {} as never,
      runId: 'run-1',
      embeddingClient: null,
    });
    expect(result).toEqual({
      ok: false,
      processed: 0,
      failed: 0,
      done: false,
      error: 'embedding_not_configured',
    });
    expect(processNextBrainJob).not.toHaveBeenCalled();
  });

  it('processes at most the requested number of jobs', async () => {
    processNextBrainJob.mockResolvedValue({
      state: 'processed',
      job: { status: 'completed' },
    });

    const result = await processBrainRunInline({
      store: {} as never,
      runId: 'run-1',
      maxJobs: 2,
      budgetMs: 10_000,
      embeddingClient: fakeEmbeddingClient,
    });

    expect(processNextBrainJob).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.processed).toBe(2);
    expect(result.done).toBe(false);
  });

  it('stops when the run is done', async () => {
    processNextBrainJob.mockResolvedValue({
      state: 'done',
      progress: {},
      runStatus: 'completed',
    });

    const result = await processBrainRunInline({
      store: {} as never,
      runId: 'run-1',
      embeddingClient: fakeEmbeddingClient,
    });
    expect(result).toEqual({ ok: true, processed: 0, failed: 0, done: true, error: null });
  });
});
