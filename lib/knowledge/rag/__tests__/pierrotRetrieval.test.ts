/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';

import type { BrainRetrievalResult } from '../brainRetrieval';
import { retrieveBrainEvidenceWithRefinement } from '../pierrotRetrieval';
import { buildBrainQueryPlan } from '../queryRouting';
import type { RetrievedChunk } from '../types';

function hit(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    chunkId: 'chk_1',
    documentId: 'doc_article_1',
    documentTitle: 'An article',
    sourceType: 'article',
    sourceClass: 'article',
    sourceDomain: 'novayagazeta.ru',
    author: 'Новая газета',
    language: 'ru',
    publishedAt: '2025-04-26T00:00:00.000Z',
    content: 'A relevant passage.',
    heading: 'A heading',
    sectionPath: ['An article'],
    sectionIndex: 0,
    lineStart: 1,
    lineEnd: 2,
    similarity: 0.8,
    lexicalScore: 0.2,
    combinedScore: 0.8,
    ...overrides,
  };
}

function result(
  outcome: BrainRetrievalResult['outcome'],
  hits: RetrievedChunk[],
  overrides: Partial<BrainRetrievalResult> = {}
): BrainRetrievalResult {
  return {
    outcome,
    hits,
    latencyMs: 10,
    topSimilarity: hits[0]?.similarity ?? null,
    plan: buildBrainQueryPlan('test'),
    method: 'hybrid_v2',
    selectedSourceClasses: [],
    selectedSourceDomains: [],
    candidateCount: hits.length,
    documentIds: hits.map((item) => item.documentId),
    chunkIds: hits.map((item) => item.chunkId),
    ranking: [],
    ...overrides,
  };
}

describe('Pierrot Brain retrieval refinement', () => {
  it('broadens a narrow date filter instead of claiming the archive has nothing', async () => {
    const plan = buildBrainQueryPlan('What did I write about AI in 2024?');
    const retrieve: any = jest.fn();
    retrieve.mockResolvedValueOnce(result('no_match', [], { plan }));
    retrieve.mockResolvedValueOnce(result('relevant_results', [hit()], { plan }));

    const refined = await retrieveBrainEvidenceWithRefinement({
      query: 'What did I write about AI in 2024?',
      plan,
      retrieve,
    });

    expect(refined.outcome).toBe('relevant_results');
    expect(refined.refined).toBe(true);
    expect(refined.hits).toHaveLength(1);
    expect(refined.attemptLog.map((attempt) => attempt.label)).toEqual([
      'original',
      'broaden_time',
    ]);
    expect(retrieve.mock.calls[1]?.[0].plan.publishedFrom).toBeNull();
    expect(retrieve.mock.calls[1]?.[0].plan.publishedTo).toBeNull();
  });

  it('retries with the lexical query and merges results', async () => {
    const plan = buildBrainQueryPlan('What have I written in Novaya Gazeta about AI?');
    const retrieve: any = jest.fn();
    retrieve.mockResolvedValueOnce(result('weak_match', [hit({ chunkId: 'chk_weak' })], { plan }));
    retrieve.mockResolvedValueOnce(
      result('relevant_results', [hit({ chunkId: 'chk_lexical', similarity: 0.9 })], { plan })
    );

    const refined = await retrieveBrainEvidenceWithRefinement({
      query: plan.originalQuery,
      plan,
      retrieve,
    });

    expect(refined.outcome).toBe('relevant_results');
    expect(refined.hits.map((item) => item.chunkId)).toEqual(
      expect.arrayContaining(['chk_weak', 'chk_lexical'])
    );
    expect(refined.attemptLog.some((attempt) => attempt.label === 'lexical')).toBe(true);
  });

  it('returns an honest no-match when every deterministic attempt is empty', async () => {
    const plan = buildBrainQueryPlan('Something with no match at all');
    const retrieve: any = jest.fn(async () => result('no_match', [], { plan }));

    const refined = await retrieveBrainEvidenceWithRefinement({
      query: plan.originalQuery,
      plan,
      retrieve,
      maxAttempts: 3,
    });

    expect(refined.outcome).toBe('no_match');
    expect(refined.hits).toEqual([]);
    expect(refined.refined).toBe(true);
    expect(retrieve.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('does not retry an unavailable retrieval', async () => {
    const plan = buildBrainQueryPlan('What is in the archive?');
    const retrieve: any = jest.fn(async () =>
      result('unavailable', [], { plan, code: 'missing_configuration' })
    );

    const refined = await retrieveBrainEvidenceWithRefinement({
      query: plan.originalQuery,
      plan,
      retrieve,
    });

    expect(refined.outcome).toBe('unavailable');
    expect(retrieve).toHaveBeenCalledTimes(1);
  });
});
