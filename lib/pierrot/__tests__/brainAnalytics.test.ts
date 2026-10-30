/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../serverStore', () => ({
  recordPierrotEvent: jest.fn(async () => true),
}));

const serverStore = require('../serverStore') as {
  recordPierrotEvent: jest.Mock;
};
const { recordBrainRetrieval } = require('../brainAnalytics') as typeof import('../brainAnalytics');

const result = {
  outcome: 'relevant_results',
  hits: [
    {
      chunkId: 'chk_1',
      documentId: 'doc_1',
      content: 'private passage',
      heading: 'Heading',
      sectionPath: ['Section'],
      sectionIndex: 0,
      lineStart: 1,
      lineEnd: 2,
      similarity: 0.8,
      sourceClass: 'article',
    },
  ],
  latencyMs: 10,
  topSimilarity: 0.8,
  plan: {
    originalQuery: 'What have I written about AI?',
    normalizedQuery: 'what have i written about ai?',
    lexicalQuery: 'ai',
    subject: 'ai',
    language: 'en',
    intent: 'thematic_overview',
    requestedSources: ['article'],
    requestedDomains: ['novayagazeta.ru'],
    requestedAuthors: [],
    publishedFrom: null,
    publishedTo: null,
    wantsOverview: true,
    wantsRecent: false,
    specificDocument: false,
    confidence: 0.8,
    signals: [],
  },
  method: 'hybrid_v2',
  selectedSourceClasses: ['article'],
  selectedSourceDomains: ['novayagazeta.ru'],
  candidateCount: 1,
  documentIds: ['doc_1'],
  chunkIds: ['chk_1'],
  ranking: [
    {
      chunkId: 'chk_1',
      documentId: 'doc_1',
      documentTitle: 'An article',
      sourceClass: 'article',
      similarity: 0.8,
      lexicalScore: 0.1,
      combinedScore: 0.6,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Brain retrieval observability', () => {
  it('stores classification and ranking but not query or passage text', async () => {
    await recordBrainRetrieval({} as never, {
      conversationId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
      userMessageId: '33333333-3333-4333-8333-333333333333',
      result: result as never,
      usedContext: true,
      generationOk: true,
    });

    const [, event] = serverStore.recordPierrotEvent.mock.calls[0] as [
      unknown,
      { eventName: string; payload: Record<string, unknown> },
    ];
    const serialized = JSON.stringify(event.payload);

    expect(event.eventName).toBe('brain_retrieval');
    expect(event.payload.query_hash).toMatch(/^[a-f0-9]{16}$/);
    expect(event.payload.used_context).toBe(true);
    expect(event.payload.generation_ok).toBe(true);
    expect(event.payload.document_ids).toEqual(['doc_1']);
    expect(event.payload.chunk_ids).toEqual(['chk_1']);
    expect(serialized).not.toContain('What have I written');
    expect(serialized).not.toContain('private passage');
  });
});
