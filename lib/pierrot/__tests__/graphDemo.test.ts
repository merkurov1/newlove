/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { runOwnerToolDetailed } from '../ownerTools';
import type { BrainGraphPayload } from '@/lib/knowledge/graph/types';

function payload(): BrainGraphPayload {
  return {
    nodes: [
      {
        id: 'entity:e1',
        kind: 'concept',
        label: 'Digital Temple',
        subtitle: null,
        entityId: 'e1',
        mentionCount: 4,
      },
      {
        id: 'entity:e2',
        kind: 'art_project',
        label: 'UNFRAMED',
        subtitle: null,
        entityId: 'e2',
        mentionCount: 3,
      },
      {
        id: 'doc:d1',
        kind: 'document',
        label: 'Anton Merkurov — Weekly Review',
        subtitle: null,
        documentId: 'd1',
      },
    ],
    edges: [
      {
        id: 'rel:1',
        source: 'entity:e1',
        target: 'entity:e2',
        relation: 'part_of',
        label: 'part of',
        confidence: 0.91,
        inference: false,
        provenance: {
          documentId: 'd1',
          documentTitle: 'Anton Merkurov — Weekly Review',
          chunkId: 'c1',
          heading: 'General assessment',
          sectionPath: [],
        },
      },
      {
        id: 'rel:2',
        source: 'doc:d1',
        target: 'entity:e1',
        relation: 'mentions',
        label: 'mentions',
        confidence: 0.8,
        inference: false,
        provenance: {
          documentId: 'd1',
          documentTitle: 'Anton Merkurov — Weekly Review',
          chunkId: 'c2',
          heading: 'Projects',
          sectionPath: [],
        },
      },
      {
        id: 'rel:3',
        source: 'entity:e2',
        target: 'entity:e1',
        relation: 'related_to',
        label: 'related to',
        confidence: 0.55,
        inference: true,
        provenance: {
          documentId: 'd1',
          documentTitle: 'Anton Merkurov — Weekly Review',
          chunkId: 'c3',
          heading: 'Hypothesis',
          sectionPath: [],
        },
      },
    ],
    stats: {
      documents: 1,
      entities: 2,
      relationships: 3,
      mentions: 4,
      shownNodes: 3,
      shownEdges: 3,
    },
  };
}

describe('Pierrot graph demonstration', () => {
  it('retrieves real nodes/edges, separates direct links from inference and keeps provenance', async () => {
    const result = await runOwnerToolDetailed(
      { kind: 'graph_demo', query: 'Покажи, как работает граф' },
      'ru',
      { loadGraph: async () => payload() }
    );

    expect(result.graph).toMatchObject({
      nodes: 3,
      edges: 3,
      directEdges: 2,
      inferenceEdges: 1,
      visualizationUrl: '/admin/brain/graph',
    });
    expect(result.text).toContain('Digital Temple');
    expect(result.text).toContain('UNFRAMED');
    expect(result.text).toContain('Прямые связи');
    expect(result.text).toContain('Гипотезы');
    expect(result.text).toContain('Anton Merkurov — Weekly Review');
    expect(result.text).toContain('confidence');
    expect(result.text).not.toMatch(/Очередь Graph|в очереди/);
  });

  it('builds a multi-hop path from real edges', async () => {
    const result = await runOwnerToolDetailed(
      { kind: 'graph_demo', query: 'Пройди по связям' },
      'ru',
      { loadGraph: async () => payload() }
    );

    expect(result.text).toMatch(/Цепочка связей/i);
    expect(result.text).toMatch(/→/);
  });

  it('reports an empty selection honestly instead of substituting counts', async () => {
    const result = await runOwnerToolDetailed(
      { kind: 'graph_demo', query: 'Покажи, как работает граф' },
      'ru',
      {
        loadGraph: async () => ({
          nodes: [],
          edges: [],
          stats: {
            documents: 0,
            entities: 0,
            relationships: 0,
            mentions: 0,
            shownNodes: 0,
            shownEdges: 0,
          },
        }),
      }
    );

    expect(result.text).toContain('не утверждение, что граф пуст');
    expect(result.text).not.toContain('Сущности:');
  });

  it('reports a retrieval failure without inventing relationships', async () => {
    const result = await runOwnerToolDetailed(
      { kind: 'graph_demo', query: 'Покажи, как работает граф' },
      'ru',
      {
        loadGraph: async () => {
          throw new Error('graph_query_failed');
        },
      }
    );

    expect(result.text).toContain('graph retrieval');
    expect(result.text).toContain('не означает, что связей нет');
    expect(result.graph).toBeNull();
  });
});
