/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';

import type { EmbeddingClient } from '@/lib/knowledge/rag/embeddings';
import {
  buildFlowRetrievalQuery,
  filterFlowPublicHits,
  isFlowPublicSourceType,
  retrieveFlowPublicEvidence,
  type FlowPublicDocument,
} from '@/lib/knowledge/rag/flowRetrieval';
import type { BrainSearch, BrainSearchRow } from '@/lib/knowledge/rag/types';
import { buildEnhancedAnalysisPrompt, generateFlowContext, type FlowAIItem } from '../ai';
import {
  FLOW_AI_CONTEXT_PUBLIC_COLUMNS,
  flowAiContextReadyPayload,
} from '../aiContext';

const env = {
  UNFRAMED_EMBEDDING_MODEL: 'baai/bge-m3',
  FLOW_AI_RAG_ENABLED: 'true',
  FLOW_AI_RAG_MIN_SIMILARITY: '0.3',
};

const item: FlowAIItem = {
  id: 'item-1',
  type: 'article',
  title: 'Digital sovereignty and the new network',
  body_md: 'A new essay about digital sovereignty, memory and network architecture.',
  source_url: 'https://example.com/new-essay',
  metadata: { description: 'Essay about digital sovereignty.' },
  lang: 'en',
  rag_allowed: true,
};

function document(overrides: Partial<FlowPublicDocument> = {}): FlowPublicDocument {
  return {
    id: 'doc_article_public',
    title: 'A public essay on networks',
    source_type: 'article',
    canonical_url: 'https://example.com/public-essay',
    source_url: null,
    published_at: '2025-04-26T00:00:00.000Z',
    author: 'Anton Merkurov',
    language: 'en',
    public_retrieval_allowed: true,
    ingestion_status: 'completed',
    ...overrides,
  };
}

function row(overrides: Partial<BrainSearchRow> = {}): BrainSearchRow {
  return {
    chunk_id: 'chk_public_1',
    document_id: 'doc_article_public',
    document_title: 'A public essay on networks',
    source_type: 'article',
    source_domain: 'example.com',
    author: 'Anton Merkurov',
    language: 'en',
    published_at: '2025-04-26T00:00:00.000Z',
    content: 'Networks become memory when infrastructure turns into culture.',
    heading: 'Networks',
    section_path: ['A public essay on networks'],
    section_index: 0,
    line_start: 1,
    line_end: 2,
    similarity: 0.82,
    lexical_score: 0.2,
    ...overrides,
  };
}

function embeddingClient(): EmbeddingClient {
  return {
    modelId: 'baai/bge-m3',
    dimensions: 1024,
    embed: jest.fn(async () => [Array.from({ length: 1024 }, () => 0.01)]),
  };
}

function searchWith(rows: BrainSearchRow[]): BrainSearch {
  return jest.fn(async () => rows);
}

describe('Flow public retrieval safety', () => {
  it('drops an owner-only document that is not in the verified allowlist', () => {
    const hits = filterFlowPublicHits({
      rows: [
        row(),
        row({
          chunk_id: 'chk_owner',
          document_id: 'doc_owner_private',
          document_title: 'Private owner document',
        }),
      ],
      allowedDocuments: [document()],
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.document_id).toBe('doc_article_public');
  });

  it('drops a document whose public flag is false even if it appears in the allowlist', () => {
    const hits = filterFlowPublicHits({
      rows: [row()],
      allowedDocuments: [document({ public_retrieval_allowed: false })],
    });

    expect(hits).toEqual([]);
  });

  it('drops manuscripts and private columns even if a broken allowlist includes them', () => {
    const hits = filterFlowPublicHits({
      rows: [
        row({
          chunk_id: 'chk_manuscript',
          document_id: 'doc_manuscript',
          document_title: 'UNFRAMED manuscript',
          source_type: 'manuscript',
        }),
        row({
          chunk_id: 'chk_private',
          document_id: 'doc_private_column',
          document_title: 'Private column',
          source_type: 'personal_writing',
        }),
      ],
      allowedDocuments: [
        document({
          id: 'doc_manuscript',
          title: 'UNFRAMED manuscript',
          source_type: 'manuscript',
        }),
        document({
          id: 'doc_private_column',
          title: 'Private column',
          source_type: 'personal_writing',
        }),
      ],
    });

    expect(hits).toEqual([]);
  });

  it('limits repeated chunks from one document', () => {
    const hits = filterFlowPublicHits({
      rows: [
        row({ chunk_id: 'a1' }),
        row({ chunk_id: 'a2' }),
        row({ chunk_id: 'a3' }),
      ],
      allowedDocuments: [document()],
      maxPerDocument: 2,
    });

    expect(hits.map((hit) => hit.chunk_id)).toEqual(['a1', 'a2']);
  });

  it('recognizes only the explicit public source classes', () => {
    expect(isFlowPublicSourceType('article')).toBe(true);
    expect(isFlowPublicSourceType('media_coverage')).toBe(true);
    expect(isFlowPublicSourceType('manuscript')).toBe(false);
    expect(isFlowPublicSourceType('personal_writing')).toBe(false);
    expect(isFlowPublicSourceType('unknown')).toBe(false);
  });

  it('does not query the model when the allowlist is empty', async () => {
    const search = jest.fn() as unknown as BrainSearch;
    const embed = jest.fn();
    const result = await retrieveFlowPublicEvidence(item, {
      env,
      loadPublicDocuments: async () => [],
      search,
      embeddingClient: { modelId: 'baai/bge-m3', dimensions: 1024, embed } as never,
    });

    expect(result.status).toBe('no_match');
    expect(result.hits).toEqual([]);
    expect(search).not.toHaveBeenCalled();
    expect(embed).not.toHaveBeenCalled();
  });

  it('returns relevant public hits with source references', async () => {
    const result = await retrieveFlowPublicEvidence(item, {
      env,
      loadPublicDocuments: async () => [document()],
      search: searchWith([row()]),
      embeddingClient: embeddingClient(),
    });

    expect(result.status).toBe('relevant');
    expect(result.hits).toHaveLength(1);
    expect(result.sourceRefs[0]).toMatchObject({
      documentId: 'doc_article_public',
      chunkId: 'chk_public_1',
      sourceUrl: 'https://example.com/public-essay',
    });
    expect(result.sourceRefs[0]?.excerpt).toContain('Networks become memory');
  });

  it('fails closed when post-retrieval scope verification returns no documents', async () => {
    const loadPublicDocuments = jest
      .fn<() => Promise<FlowPublicDocument[]>>()
      .mockResolvedValueOnce([document()])
      .mockResolvedValueOnce([]);

    const result = await retrieveFlowPublicEvidence(item, {
      env,
      loadPublicDocuments,
      search: searchWith([row()]),
      embeddingClient: embeddingClient(),
    });

    expect(result.status).toBe('unavailable');
    expect(result.hits).toEqual([]);
    expect(result.diagnostics.reason).toBe('scope_verification_failed');
  });

  it('falls back safely when retrieval throws', async () => {
    const result = await retrieveFlowPublicEvidence(item, {
      env,
      loadPublicDocuments: async () => {
        throw new Error('database down');
      },
      search: searchWith([]),
      embeddingClient: embeddingClient(),
    });

    expect(result.status).toBe('error');
    expect(result.hits).toEqual([]);
  });

  it('reports disabled without making embedding or search calls', async () => {
    const search = jest.fn() as unknown as BrainSearch;
    const result = await retrieveFlowPublicEvidence(item, {
      env: { ...env, FLOW_AI_RAG_ENABLED: 'false' },
      search,
      loadPublicDocuments: async () => [document()],
      embeddingClient: embeddingClient(),
    });

    expect(result.status).toBe('disabled');
    expect(search).not.toHaveBeenCalled();
  });
});

describe('Flow AI RAG prompt and result metadata', () => {
  it('keeps the old prompt when no evidence is available', () => {
    const prompt = buildEnhancedAnalysisPrompt(item);

    expect(prompt).not.toContain('PUBLIC BRAIN EVIDENCE');
    expect(prompt).not.toContain('RAG CONTEXT INSTRUCTIONS');
  });

  it('adds public evidence and anti-retelling instructions when evidence exists', () => {
    const prompt = buildEnhancedAnalysisPrompt(item, [row()]);

    expect(prompt).toContain('PUBLIC BRAIN EVIDENCE');
    expect(prompt).toContain('Do NOT summarize, retell');
    expect(prompt).toContain('untrusted data');
    expect(prompt).toContain('Do not add a source list');
  });

  it('builds a bounded retrieval query from the public item', () => {
    const query = buildFlowRetrievalQuery({
      ...item,
      body_md: 'x'.repeat(5000),
    });

    expect(query).toContain('Digital sovereignty');
    expect(query.length).toBeLessThanOrEqual(2000);
  });

  it('skips retrieval when RAG is disabled for the item', async () => {
    const retrieve = jest.fn();
    const complete = jest.fn(async (_prompt: string) => ({
      content: 'ok',
      model: 'm',
      provider: 'p',
    }));

    const result = await generateFlowContext(
      { ...item, rag_allowed: false },
      { retrieve: retrieve as never, complete }
    );

    expect(retrieve).not.toHaveBeenCalled();
    expect(result?.ragEnabled).toBe(false);
    expect(result?.retrievalStatus).toBe('disabled');
    expect(result?.generationVersion).toBe('flow-ai-v1');
  });

  it('uses the old pipeline when retrieval finds nothing', async () => {
    const complete = jest.fn(async (_prompt: string) => ({
      content: 'ok',
      model: 'm',
      provider: 'p',
    }));

    const result = await generateFlowContext(item, {
      retrieve: (async () => ({
        status: 'no_match',
        method: 'brain_hybrid_public',
        latencyMs: 12,
        hits: [],
        sourceRefs: [],
        documentIds: [],
        titles: [],
        topSimilarity: null,
        plan: null,
        diagnostics: { reason: 'no_candidates' },
      })) as never,
      complete,
    });

    expect(result?.retrievalStatus).toBe('no_match');
    expect(result?.sourceRefs).toEqual([]);
    expect(result?.generationVersion).toBe('flow-ai-v1');
    expect(complete).toHaveBeenCalledTimes(1);
    expect(String(complete.mock.calls[0]?.[0])).not.toContain('PUBLIC BRAIN EVIDENCE');
  });

  it('stores public source refs and the RAG generation version', async () => {
    const complete = jest.fn(async (_prompt: string) => ({
      content: 'ok',
      model: 'm',
      provider: 'p',
    }));

    const result = await generateFlowContext(item, {
      retrieve: (async () => ({
        status: 'relevant',
        method: 'brain_hybrid_public',
        latencyMs: 15,
        hits: [row()],
        sourceRefs: [
          {
            documentId: 'doc_article_public',
            documentTitle: 'A public essay on networks',
            chunkId: 'chk_public_1',
            excerpt: 'Networks become memory.',
            similarity: 0.82,
            sourceUrl: 'https://example.com/public-essay',
            sourceType: 'article',
            publishedAt: '2025-04-26T00:00:00.000Z',
          },
        ],
        documentIds: ['doc_article_public'],
        titles: ['A public essay on networks'],
        topSimilarity: 0.82,
        plan: null,
        diagnostics: { intent: 'general' },
      })) as never,
      complete,
    });

    expect(result?.retrievalStatus).toBe('relevant');
    expect(result?.generationVersion).toBe('flow-ai-rag-v1');
    expect(result?.sourceDocumentIds).toEqual(['doc_article_public']);
    expect(result?.sourceTitles).toEqual(['A public essay on networks']);
    expect(String(complete.mock.calls[0]?.[0])).toContain('PUBLIC BRAIN EVIDENCE');
  });

  it('writes only sanitized public source refs into flow_ai_context', () => {
    const payload = flowAiContextReadyPayload('item-1', {
      content: 'ok',
      model: 'm',
      provider: 'p',
      ragEnabled: true,
      retrievalStatus: 'relevant',
      retrievalMethod: 'brain_hybrid_public',
      sourceRefs: [
        {
          documentId: 'doc_article_public',
          documentTitle: 'A public essay',
          chunkId: 'chk_public_1',
          excerpt: 'Public excerpt.',
          similarity: 0.82,
          sourceUrl: 'https://example.com/public',
          sourceType: 'article',
          publishedAt: null,
          ownerSecret: 'must not be stored',
        } as never,
      ],
      sourceDocumentIds: ['doc_article_public'],
      sourceTitles: ['A public essay'],
      generationVersion: 'flow-ai-rag-v1',
      retrievalLatencyMs: 20,
      retrievalDiagnostics: { intent: 'general' },
    });

    expect(payload.source_refs).toEqual([
      {
        documentId: 'doc_article_public',
        documentTitle: 'A public essay',
        chunkId: 'chk_public_1',
        excerpt: 'Public excerpt.',
        similarity: 0.82,
        sourceUrl: 'https://example.com/public',
        sourceType: 'article',
        publishedAt: null,
      },
    ]);
  });

  it('does not persist non-http source URLs', () => {
    const payload = flowAiContextReadyPayload('item-1', {
      content: 'ok',
      model: 'm',
      provider: 'p',
      ragEnabled: true,
      retrievalStatus: 'relevant',
      retrievalMethod: 'brain_hybrid_public',
      sourceRefs: [
        {
          documentId: 'doc_article_public',
          documentTitle: 'A public essay',
          chunkId: 'chk_public_1',
          excerpt: 'Public excerpt.',
          similarity: 0.8,
          sourceUrl: 'javascript:alert(1)',
          sourceType: 'article',
          publishedAt: null,
        },
      ],
      sourceDocumentIds: ['doc_article_public'],
      sourceTitles: ['A public essay'],
      generationVersion: 'flow-ai-rag-v1',
      retrievalLatencyMs: 20,
      retrievalDiagnostics: {},
    });

    const refs = payload.source_refs as Array<{ sourceUrl: string | null }>;
    expect(refs[0]?.sourceUrl).toBeNull();
  });

  it('does not expose retrieval provenance columns to public pages', () => {
    expect(FLOW_AI_CONTEXT_PUBLIC_COLUMNS).not.toContain('source_refs');
    expect(FLOW_AI_CONTEXT_PUBLIC_COLUMNS).not.toContain('source_document_ids');
    expect(FLOW_AI_CONTEXT_PUBLIC_COLUMNS).not.toContain('retrieval_diagnostics');
  });
});
