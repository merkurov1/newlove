/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';
import { retrieveBrainEvidence } from '../brainRetrieval';
import type { BrainSearch, BrainSearchRow } from '../types';

const env = {
  UNFRAMED_EMBEDDING_MODEL: 'baai/bge-m3',
  PIERROT_RAG_ENABLED: 'true',
  BRAIN_RAG_MIN_SIMILARITY: '0.32',
};

function embeddingClient() {
  return {
    modelId: 'baai/bge-m3',
    dimensions: 1024,
    embed: jest.fn(async () => [Array.from({ length: 1024 }, () => 0.01)]),
  };
}

function row(): BrainSearchRow {
  return {
    chunk_id: 'chk_profile',
    document_id: 'doc_profile',
    document_title: 'Weekly Review',
    source_type: 'text',
    source_domain: null,
    author: null,
    language: 'en',
    published_at: null,
    content: 'A passage.',
    heading: 'General',
    section_path: [],
    section_index: 0,
    line_start: 1,
    line_end: 2,
    similarity: 0.9,
    lexical_score: 0.2,
  };
}

describe('Brain retrieval profiling', () => {
  it('records embedding, search and ranking timings separately', async () => {
    const search: BrainSearch = jest.fn(
      async () => new Promise<BrainSearchRow[]>((resolve) => setTimeout(() => resolve([row()]), 5))
    );
    const result = await retrieveBrainEvidence({
      query: 'weekly review',
      scope: 'owner',
      ownerAuthorized: true,
      enabled: true,
      env,
      embeddingClient: embeddingClient(),
      search,
    });

    expect(result.outcome).toBe('relevant_results');
    expect(result.timings).toBeDefined();
    expect(result.timings?.embeddingMs).toBeGreaterThanOrEqual(0);
    expect(result.timings?.searchMs).toBeGreaterThanOrEqual(0);
    expect(result.timings?.rankingMs).toBeGreaterThanOrEqual(0);
  });

  it('attributes a stalled SQL search to the search stage', async () => {
    const result = await retrieveBrainEvidence({
      query: 'weekly review',
      scope: 'owner',
      ownerAuthorized: true,
      enabled: true,
      timeoutMs: 60,
      env,
      embeddingClient: embeddingClient(),
      search: jest.fn(
        () =>
          new Promise<BrainSearchRow[]>(() => {
            // Intentionally never resolves; the search-stage abort is the exit.
          })
      ),
    });

    expect(result.outcome).toBe('unavailable');
    expect(result.code).toBe('timeout');
    expect(result.timeoutStage).toBe('search');
    expect(result.timings?.searchMs).toBeGreaterThanOrEqual(10);
  });

  it('records the embedding stage when the overall timeout aborts it', async () => {
    const search: BrainSearch = jest.fn(async () => [row()]);
    const result = await retrieveBrainEvidence({
      query: 'weekly review',
      scope: 'owner',
      ownerAuthorized: true,
      enabled: true,
      timeoutMs: 20,
      env,
      embeddingClient: {
        modelId: 'baai/bge-m3',
        dimensions: 1024,
        embed: jest.fn(
          () =>
            new Promise<number[][]>(() => {
              // Intentionally never resolves; the abort signal is the only exit.
            })
        ),
      },
      search,
    });

    expect(result.outcome).toBe('unavailable');
    expect(result.code).toBe('timeout');
    expect(result.timings?.embeddingMs).toBeGreaterThanOrEqual(10);
    expect(result.timeoutStage).toBe('embedding');
    expect(search).not.toHaveBeenCalled();
  });
});
