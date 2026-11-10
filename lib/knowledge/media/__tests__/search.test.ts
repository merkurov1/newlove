/** @jest-environment node */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { EmbeddingClient } from '@/lib/knowledge/rag/embeddings';

jest.mock('@/lib/knowledge/graph/deepseek', () => ({
  isGraphLlmConfigured: () => false,
  graphChatJson: jest.fn(),
}));

import { searchMediaIntelligence } from '../search';

const filters = {
  from: null,
  to: null,
  topic: null,
  language: null,
  outlet: null,
  status: null,
  kind: null,
  role: null,
  page: 1,
  pageSize: 20,
};

function embeddingClient(): EmbeddingClient {
  return {
    modelId: 'baai/bge-m3',
    dimensions: 1024,
    embed: jest.fn(async () => [Array.from({ length: 1024 }, () => 0.01)]),
  };
}

function fakeClient(rows: unknown[]): SupabaseClient {
  const quotesChain = {
    select: () => ({
      in: () => ({
        eq: () => ({
          limit: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  };

  return {
    rpc: jest.fn(async () => ({ data: rows, error: null })),
    from: jest.fn(() => quotesChain),
  } as unknown as SupabaseClient;
}

const hit = {
  chunk_id: 'chk_1',
  document_id: 'doc_media_1',
  media_record_id: '11111111-1111-4111-8111-111111111111',
  title: 'Digital control',
  outlet: 'Le Monde',
  canonical_url: 'https://example.com/article',
  published_date: '2026-10-13',
  language: 'fr',
  content: 'Anton Merkurov said that hardware control is the next frontier.',
  heading: 'Digital control',
  section_path: ['Digital control'],
  similarity: 0.82,
  text_quality: 'full_text',
  topic: 'Internet & Censorship',
};

describe('Media semantic search', () => {
  it('returns insufficient state when no chunks match', async () => {
    const result = await searchMediaIntelligence({
      query: 'What did Anton say?',
      filters,
      embeddingClient: embeddingClient(),
      client: fakeClient([]),
    });

    expect(result.insufficient).toBe(true);
    expect(result.results).toHaveLength(0);
    expect(result.facts).toHaveLength(0);
  });

  it('keeps only citations that exist in retrieved evidence', async () => {
    const result = await searchMediaIntelligence({
      query: 'What did Anton say about hardware control?',
      filters,
      embeddingClient: embeddingClient(),
      client: fakeClient([hit]),
      chatJson: async () => ({
        summary: 'Merkurov connects internet control with hardware control.',
        facts: [
          {
            text: 'Hardware control is the next frontier.',
            document_id: 'doc_media_1',
            chunk_id: 'chk_1',
          },
          {
            text: 'Invented citation.',
            document_id: 'doc_missing',
            chunk_id: 'chk_missing',
          },
        ],
        interpretation: ['This is an interpretation, not a direct quote.'],
        insufficient: false,
      }),
    });

    expect(result.count).toBe(1);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].documentId).toBe('doc_media_1');
    expect(result.interpretation).toHaveLength(1);
    expect(result.results[0].canonicalUrl).toBe('https://example.com/article');
  });

  it('returns one best chunk per publication and marks the sample incomplete', async () => {
    const secondHit = {
      ...hit,
      chunk_id: 'chk_2',
      content: 'Another fragment from the same publication.',
      similarity: 0.7,
    };
    const otherDoc = {
      ...hit,
      chunk_id: 'chk_3',
      document_id: 'doc_media_2',
      media_record_id: '22222222-2222-4222-8222-222222222222',
      title: 'Second publication',
      similarity: 0.65,
    };

    const result = await searchMediaIntelligence({
      query: 'hardware control',
      filters,
      embeddingClient: embeddingClient(),
      client: fakeClient([hit, secondHit, otherDoc]),
    });

    expect(result.results).toHaveLength(2);
    expect(result.count).toBe(2);
    expect(result.scannedChunks).toBe(3);
    expect(result.semantic).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.caveats.join(' ')).toContain('не полный каталог');
  });

  it('rejects an empty or zero query embedding instead of returning arbitrary chunks', async () => {
    const zeroEmbedding = {
      modelId: 'baai/bge-m3',
      dimensions: 1024,
      embed: jest.fn(async () => [Array.from({ length: 1024 }, () => 0)]),
    } as EmbeddingClient;

    await expect(
      searchMediaIntelligence({
        query: 'anything',
        filters,
        embeddingClient: zeroEmbedding,
        client: fakeClient([hit]),
      })
    ).rejects.toThrow('media_search_embedding_invalid');
  });

  it('falls back to a deterministic summary without an LLM', async () => {
    const result = await searchMediaIntelligence({
      query: 'hardware control',
      filters,
      embeddingClient: embeddingClient(),
      client: fakeClient([hit]),
    });

    expect(result.summary).toContain('Найдено 1');
    expect(result.facts[0].chunkId).toBe('chk_1');
    expect(result.interpretation).toEqual([]);
  });
});
