/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';

import { retrieveFoodChunks } from '../foodRetrieval';
import { buildBrainQueryPlan, isFoodQuery } from '../queryRouting';

function fakeClient(rows: Array<Record<string, unknown>>) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    or: jest.fn(() => query),
    limit: jest.fn(async () => ({ data: rows, error: null })),
  };

  return { from: jest.fn(() => query) };
}

function row(input: {
  id: string;
  documentId: string;
  title: string;
  content: string;
  sourceType?: string;
}) {
  return {
    id: input.id,
    document_id: input.documentId,
    content: input.content,
    heading: '',
    section_path: [],
    section_index: 0,
    line_start: 0,
    line_end: 0,
    access_class: 'owner',
    knowledge_documents: {
      id: input.documentId,
      title: input.title,
      source_type: input.sourceType || 'txt',
      access_class: 'owner',
      public_retrieval_allowed: false,
      language: 'ru',
      published_at: null,
      ingestion_status: 'completed',
    },
  };
}

describe('food retrieval', () => {
  it('marks food and recipe queries without narrowing the whole RAG corpus', () => {
    const plan = buildBrainQueryPlan('найди все рецепты еды');
    expect(isFoodQuery(plan)).toBe(true);
    expect(plan.requestedSources).toEqual([]);
  });

  it('prefers real recipe steps over one-line markers and false positives', async () => {
    const client = fakeClient([
      row({
        id: 'chk_recipe',
        documentId: 'doc_2018',
        title: '2018',
        content:
          'Курицу режем на кусочки и обжариваем. Добавляем лук, помидоры и перец, тушим двадцать минут. Добавляем кинзу. Готово.',
      }),
      row({
        id: 'chk_marker',
        documentId: 'doc_2018',
        title: '2018',
        content: 'Рецепт недели:',
      }),
      row({
        id: 'chk_false_positive',
        documentId: 'doc_article',
        title: 'Политическая статья',
        sourceType: 'article',
        content:
          'Победа на выборах и специалисты по коммуникациям обсуждают рецепты успеха и сковороду как метафору.',
      }),
    ]);

    const hits = await retrieveFoodChunks({
      query: 'найди рецепты еды',
      scope: 'owner',
      topK: 8,
      maxPerDocument: 6,
      client: client as never,
    });

    expect(hits.length).toBe(1);
    expect(hits[0]?.chunkId).toBe('chk_recipe');
    expect(hits[0]?.content).toContain('обжариваем');
  });

  it('never opens owner food chunks for public scope', async () => {
    const client = fakeClient([]);
    const hits = await retrieveFoodChunks({
      query: 'рецепты',
      scope: 'public',
      client: client as never,
    });

    expect(hits).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });
});
