/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { buildPierrotRetrievalPayload } from '../brainAnalytics';

describe('Pierrot retrieval analytics privacy', () => {
  it('stores counts, IDs and latency without query text or passages', () => {
    const payload = buildPierrotRetrievalPayload({
      conversationId: 'conversation-1',
      sessionId: 'session-1',
      userMessageId: 'message-1',
      mode: 'brain_v2',
      outcome: 'relevant_results',
      selectedSources: ['article', 'manuscript'],
      documentIds: ['doc-1', 'doc-2'],
      chunkIds: ['chk-1', 'chk-2', 'chk-3'],
      latencyMs: 42,
      usedContext: true,
      generationOk: true,
      candidateCount: 5,
      topSimilarity: 0.81,
      refined: true,
      attempts: 2,
    });

    expect(payload).toMatchObject({
      mode: 'brain_v2',
      outcome: 'relevant_results',
      document_count: 2,
      chunk_count: 3,
      latency_ms: 42,
      used_context: true,
      generation_ok: true,
      attempts: 2,
    });
    expect(payload).not.toHaveProperty('query');
    expect(payload).not.toHaveProperty('content');
    expect(payload).not.toHaveProperty('passage');
  });
});
