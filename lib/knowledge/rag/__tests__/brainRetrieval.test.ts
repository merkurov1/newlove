/** @jest-environment node */

import {
  classifyBrainDocument,
  buildBrainQueryPlan,
  resolveBrainSourceFilters,
} from '../queryRouting';
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

function row(overrides: Partial<BrainSearchRow> = {}): BrainSearchRow {
  return {
    chunk_id: 'chk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    document_id: 'doc_article_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    document_title: 'An article',
    source_type: 'article',
    source_domain: 'novayagazeta.ru',
    author: 'Новая газета',
    language: 'ru',
    published_at: '2025-04-26T00:00:00.000Z',
    content: 'A relevant passage about the subject.',
    heading: 'A heading',
    section_path: ['An article', 'A heading'],
    section_index: 0,
    line_start: 1,
    line_end: 2,
    similarity: 0.8,
    lexical_score: 0.2,
    ...overrides,
  };
}

function searchWith(rows: BrainSearchRow[]): BrainSearch {
  return jest.fn(async () => rows);
}

async function retrieve(rows: BrainSearchRow[], query: string) {
  return retrieveBrainEvidence({
    query,
    scope: 'owner',
    ownerAuthorized: true,
    enabled: true,
    env,
    embeddingClient: embeddingClient(),
    search: searchWith(rows),
  });
}

describe('Brain query understanding', () => {
  it('routes Novaya Gazeta questions to articles and removes source words from the lexical query', () => {
    const plan = buildBrainQueryPlan('What have I written in Novaya Gazeta about AI?');

    expect(plan.requestedSources).toContain('article');
    expect(plan.requestedDomains).toContain('novayagazeta.ru');
    expect(plan.lexicalQuery).toBe('ai');
    expect(plan.intent).toBe('thematic_overview');
    expect(plan.wantsOverview).toBe(true);
  });

  it('routes UNFRAMED questions to the manuscript', () => {
    const plan = buildBrainQueryPlan('What does UNFRAMED say about autonomy?');

    expect(plan.requestedSources).toEqual(['manuscript']);
    expect(plan.lexicalQuery).toBe('autonomy');
    expect(plan.intent).toBe('document_lookup');
    expect(plan.specificDocument).toBe(true);
  });

  it('removes Russian source words from the lexical query', () => {
    const plan = buildBrainQueryPlan('Что я писал в Новой газете про ИИ?');

    expect(plan.requestedSources).toContain('article');
    expect(plan.lexicalQuery).toBe('ии');
    expect(plan.language).toBe('ru');
  });

  it('routes Heart & Angel questions to the art project corpus', () => {
    const plan = buildBrainQueryPlan('Explain Heart & Angel.');

    expect(plan.requestedSources).toEqual(['art_project']);
    expect(plan.lexicalQuery).toContain('heart');
    expect(plan.intent).toBe('project');
  });

  it('extracts explicit time ranges and overview intent', () => {
    const plan = buildBrainQueryPlan('What did I write about in 2024?');

    expect(plan.wantsOverview).toBe(true);
    expect(plan.publishedFrom).toBe('2024-01-01T00:00:00.000Z');
    expect(plan.publishedTo).toBe('2024-12-31T23:59:59.999Z');
  });

  it('classifies existing documents without new storage fields', () => {
    expect(
      classifyBrainDocument({
        source_type: 'article',
        source_domain: 'novayagazeta.ru',
        author: 'Новая газета',
      })
    ).toBe('article');

    expect(
      classifyBrainDocument({
        source_type: 'article',
        source_domain: 'merkurov.substack.com',
        author: 'Anton Merkurov',
      })
    ).toBe('personal_writing');

    expect(
      classifyBrainDocument({
        source_type: 'manuscript',
        source_domain: null,
      })
    ).toBe('manuscript');

    expect(
      classifyBrainDocument({
        source_type: 'research',
        metadata: {},
      })
    ).toBe('research');
  });

  it('maps biography to the memoir and research to articles', () => {
    const biography = buildBrainQueryPlan('What does my biography say?');
    const biographyFilters = resolveBrainSourceFilters(biography);

    expect(biographyFilters.sourceClasses).toEqual(
      expect.arrayContaining(['biography', 'manuscript'])
    );

    const research = buildBrainQueryPlan('Show my research on AI');
    const researchFilters = resolveBrainSourceFilters(research);

    expect(researchFilters.sourceClasses).toEqual(expect.arrayContaining(['research', 'article']));
  });
});

describe('Source-aware hybrid retrieval', () => {
  it('does not let manuscript chunks dominate a Novaya article query', async () => {
    const result = await retrieve(
      [
        row({ chunk_id: 'chk_article', similarity: 0.71 }),
        row({
          chunk_id: 'chk_manuscript',
          document_id: 'doc_unframed_manuscript',
          document_title: 'UNFRAMED',
          source_type: 'manuscript',
          source_domain: null,
          author: null,
          similarity: 0.98,
          lexical_score: 0.5,
        }),
        row({
          chunk_id: 'chk_personal',
          document_id: 'doc_article_personal',
          document_title: 'A personal essay',
          source_domain: 'merkurov.substack.com',
          author: 'Anton Merkurov',
          similarity: 0.95,
        }),
      ],
      'What have I written in Novaya Gazeta about AI?'
    );

    expect(result.outcome).toBe('relevant_results');
    expect(result.hits.every((hit) => hit.sourceClass === 'article')).toBe(true);
    expect(result.hits.some((hit) => hit.documentId === 'doc_unframed_manuscript')).toBe(false);
    expect(result.plan.requestedSources).toContain('article');
  });

  it('prioritizes the manuscript for UNFRAMED questions', async () => {
    const result = await retrieve(
      [
        row({
          chunk_id: 'chk_manuscript',
          document_id: 'doc_unframed_manuscript',
          document_title: 'UNFRAMED',
          source_type: 'manuscript',
          source_domain: null,
          author: null,
          similarity: 0.45,
        }),
        row({
          chunk_id: 'chk_article',
          similarity: 0.99,
        }),
      ],
      'What does UNFRAMED say about autonomy?'
    );

    expect(result.outcome).toBe('relevant_results');
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits.every((hit) => hit.documentId === 'doc_unframed_manuscript')).toBe(true);
    expect(result.selectedSourceClasses).toEqual(['manuscript']);
  });

  it('returns no_match when an explicit art-project corpus has no documents', async () => {
    const result = await retrieve([row({ similarity: 0.99 })], 'Explain Heart & Angel.');

    expect(result.outcome).toBe('no_match');
    expect(result.hits).toEqual([]);
    expect(result.plan.requestedSources).toEqual(['art_project']);
  });

  it('limits repeated chunks from one document and includes other documents', async () => {
    const result = await retrieve(
      [
        row({ chunk_id: 'chk_a1', document_id: 'doc_a', similarity: 0.9 }),
        row({ chunk_id: 'chk_a2', document_id: 'doc_a', similarity: 0.89 }),
        row({ chunk_id: 'chk_a3', document_id: 'doc_a', similarity: 0.88 }),
        row({ chunk_id: 'chk_b1', document_id: 'doc_b', similarity: 0.7 }),
        row({
          chunk_id: 'chk_m1',
          document_id: 'doc_unframed_manuscript',
          document_title: 'UNFRAMED',
          source_type: 'manuscript',
          source_domain: null,
          similarity: 0.6,
        }),
      ],
      'What do I write about?'
    );

    expect(result.outcome).toBe('relevant_results');
    expect(result.hits.filter((hit) => hit.documentId === 'doc_a')).toHaveLength(2);
    expect(result.hits.some((hit) => hit.documentId === 'doc_b')).toBe(true);
    expect(result.hits.filter((hit) => hit.documentId === 'doc_unframed_manuscript')).toHaveLength(
      1
    );
  });

  it('returns weak_match when candidates are below the threshold', async () => {
    const result = await retrieve(
      [row({ similarity: 0.05, lexical_score: 0 })],
      'Something with no strong match'
    );

    expect(result.outcome).toBe('weak_match');
    expect(result.hits).toEqual([]);
  });

  it('exposes an owner-only observability trace without query text', async () => {
    const result = await retrieve(
      [row({ similarity: 0.8, lexical_score: 0.1 })],
      'What have I written in Novaya Gazeta about AI?'
    );

    expect(result.method).toBe('hybrid_v2');
    expect(result.plan.intent).toBe('thematic_overview');
    expect(result.documentIds).toContain('doc_article_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(result.chunkIds).toContain('chk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(result.ranking[0].similarity).toBeCloseTo(0.8);
    expect(result.plan.subject).toBe('ai');
  });

  it('understands "last two months" and the Novaya Gazeta source filter', () => {
    const plan = buildBrainQueryPlan('Что писал в Новой газете за последние два месяца?');

    expect(plan.requestedDomains).toContain('novayagazeta.ru');
    expect(plan.requestedSources).toContain('article');
    expect(plan.wantsRecent).toBe(true);
    expect(plan.publishedFrom).toBeTruthy();
    expect(plan.signals).toContain('time:last_two_months');
  });
});
