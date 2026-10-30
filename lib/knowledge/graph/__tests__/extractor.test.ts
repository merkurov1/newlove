/** @jest-environment node */

import {
  extractDocumentGraph,
  planChunkBatches,
  summarizeDocumentsBatch,
} from '../extractor';
import type { BrainChunkForGraph, BrainDocumentForGraph } from '../types';

const document: BrainDocumentForGraph = {
  id: 'doc_article_test',
  title: 'Attention and the archive',
  source_type: 'article',
  source_path: 'https://example.com/attention',
  source_url: 'https://example.com/attention',
  canonical_url: 'https://example.com/attention',
  author: 'Anton Merkurov',
  language: 'en',
  published_at: '2026-01-01T00:00:00.000Z',
  content_hash: 'a'.repeat(64),
  source_sha256: 'a'.repeat(64),
  chunk_count: 2,
  metadata: {},
};

function chunk(id: string, text: string, heading = 'Attention'): BrainChunkForGraph {
  return {
    id,
    document_id: document.id,
    chunk_index: Number(id.slice(-1)) || 0,
    content: text,
    heading,
    section_path: [document.title, heading],
    section_index: 0,
    line_start: 1,
    line_end: 20,
  };
}

const chunks = [
  chunk(
    'chk_00000000000000000000000000000001',
    'Anton Merkurov argues that attention is a room we build. Heart & Angel develops this idea as an art project.'
  ),
  chunk(
    'chk_00000000000000000000000000000002',
    'The archive is a technology of memory, and the project references the archive repeatedly.'
  ),
];

describe('Brain graph extraction', () => {
  it('plans bounded batches', () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      chunk(`chk_${String(index).padStart(32, '0')}`, 'x'.repeat(1000))
    );
    const batches = planChunkBatches(many, 5000, 3);

    expect(batches.length).toBeGreaterThan(1);
    expect(batches.every((batch) => batch.length <= 3)).toBe(true);
  });

  it('keeps only entities and relationships grounded in a provided chunk', async () => {
    const chatJson = jest.fn(async () => ({
      entities: [
        {
          name: 'Anton Merkurov',
          type: 'person',
          confidence: 0.95,
          chunk_id: chunks[0].id,
          evidence: 'Anton Merkurov argues',
        },
        {
          name: 'Heart & Angel',
          type: 'art project',
          confidence: 0.9,
          chunk_id: chunks[0].id,
          evidence: 'Heart & Angel develops this idea',
        },
        {
          name: 'Invented Entity',
          type: 'concept',
          confidence: 0.9,
          chunk_id: 'chk_not_real',
          evidence: 'not in the document',
        },
      ],
      relationships: [
        {
          source_name: 'Anton Merkurov',
          source_type: 'person',
          target_name: 'Heart & Angel',
          target_type: 'art_project',
          relation_type: 'develops',
          confidence: 0.7,
          chunk_id: chunks[0].id,
          evidence: 'Heart & Angel develops this idea',
          inference: true,
        },
        {
          source_name: 'Anton Merkurov',
          source_type: 'person',
          target_name: 'Invented Entity',
          target_type: 'concept',
          relation_type: 'mentions',
          confidence: 0.9,
          chunk_id: chunks[1].id,
          evidence: 'fabricated',
        },
      ],
    }));

    const extraction = await extractDocumentGraph({ document, chunks }, chatJson);

    expect(chatJson).toHaveBeenCalledTimes(1);
    expect(extraction.entities.map((entity) => entity.name)).toContain('Anton Merkurov');
    expect(extraction.entities.map((entity) => entity.name)).toContain('Heart & Angel');
    expect(extraction.entities.map((entity) => entity.name)).not.toContain('Invented Entity');
    expect(extraction.relationships).toHaveLength(1);
    expect(extraction.relationships[0].inference).toBe(true);
    expect(extraction.relationships[0].evidence).toContain('Heart & Angel');
  });

  it('summarises only documents that were supplied', async () => {
    const chatJson = jest.fn(async () => ({
      documents: [
        { document_id: document.id, summary: 'A grounded summary.', confidence: 0.8 },
        { document_id: 'doc_other', summary: 'Should be dropped.', confidence: 0.9 },
      ],
    }));

    const summaries = await summarizeDocumentsBatch(
      [
        {
          id: document.id,
          title: document.title,
          sourceType: document.source_type,
          author: document.author,
          publishedAt: document.published_at,
          entityNames: ['Attention', 'Archive'],
          headings: ['Attention'],
          excerpt: chunks.map((entry) => entry.content).join('\n\n'),
        },
      ],
      chatJson
    );

    expect(summaries).toHaveLength(1);
    expect(summaries[0].documentId).toBe(document.id);
  });
});
