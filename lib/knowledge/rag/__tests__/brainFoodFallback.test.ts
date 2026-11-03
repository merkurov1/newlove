/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../foodRetrieval', () => ({
  retrieveFoodChunks: jest.fn(),
}));

const foodModule = jest.requireMock('../foodRetrieval') as {
  retrieveFoodChunks: jest.Mock;
};
const { retrieveBrainEvidence } =
  require('../brainRetrieval') as typeof import('../brainRetrieval');

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

describe('Brain food fallback integration', () => {
  it('uses the food fallback when normal hybrid retrieval finds nothing', async () => {
    const food = foodModule.retrieveFoodChunks;
    food.mockResolvedValueOnce([
      {
        chunkId: 'chk_recipe',
        documentId: 'doc_txt_2018',
        documentTitle: '2018',
        sourceType: 'txt',
        sourceClass: 'other',
        sourceDomain: null,
        author: null,
        language: 'ru',
        publishedAt: null,
        content:
          'Курицу режем на кусочки и обжариваем. Добавляем лук, помидоры и перец, тушим двадцать минут.',
        heading: '',
        sectionPath: [],
        sectionIndex: 0,
        lineStart: 1,
        lineEnd: 2,
        similarity: 0.7,
        lexicalScore: 3,
        combinedScore: 0.7,
      },
    ]);

    const result = await retrieveBrainEvidence({
      query: 'Найди все рецепты',
      scope: 'owner',
      ownerAuthorized: true,
      enabled: true,
      env,
      embeddingClient: embeddingClient(),
      search: jest.fn(async () => []),
    });

    expect(result.outcome).toBe('relevant_results');
    expect(result.hits.map((hit) => hit.chunkId)).toContain('chk_recipe');
    expect(foodModule.retrieveFoodChunks).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'Найди все рецепты', scope: 'owner' })
    );
  });

  it('never invokes the food fallback for public scope', async () => {
    const food = foodModule.retrieveFoodChunks;
    food.mockClear();

    const result = await retrieveBrainEvidence({
      query: 'Найди все рецепты',
      scope: 'public',
      ownerAuthorized: false,
      enabled: true,
      env,
      embeddingClient: embeddingClient(),
      search: jest.fn(async () => []),
    });

    expect(result.outcome).toBe('no_match');
    expect(foodModule.retrieveFoodChunks).not.toHaveBeenCalled();
  });
});
