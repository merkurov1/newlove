/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  detectPublicationInventoryQuestion,
  inventoryAnswer,
  selectPublicationInventory,
} from '../research';
import type { BrainDocumentForGraph } from '../types';

function doc(overrides: Partial<BrainDocumentForGraph>): BrainDocumentForGraph {
  return {
    id: 'doc-1',
    title: 'A Novaya Gazeta article',
    source_type: 'article',
    source_path: 'brain-sources/aa/doc.txt',
    source_url: 'https://novayagazeta.ru/articles/2025/12/17/a',
    canonical_url: 'https://novayagazeta.ru/articles/2025/12/17/a',
    author: 'Новая газета',
    language: 'ru',
    published_at: '2025-12-17T08:18:00.000Z',
    content_hash: 'a'.repeat(64),
    source_sha256: 'b'.repeat(64),
    chunk_count: 6,
    metadata: { source_domain: 'novayagazeta.ru' },
    ...overrides,
  };
}

describe('Brain research publication inventory', () => {
  it.each([
    'найти все мои колонки в новой газете',
    'сколько я написал колонок в новую газету',
    'How many articles did I write in Novaya Gazeta?',
    'Show all my Novaya Gazeta columns',
  ])('detects an inventory question: %s', (question) => {
    expect(detectPublicationInventoryQuestion(question)).toBe('novaya');
  });

  it('does not turn a normal topic question into an inventory count', () => {
    expect(
      detectPublicationInventoryQuestion('Что писал в Новой газете за последние два месяца?')
    ).toBeNull();
  });

  it('counts unique article documents and excludes media_coverage duplicates', () => {
    const documents = [
      doc({ id: 'a1' }),
      doc({
        id: 'a2',
        title: 'Second article',
        canonical_url: 'https://novayagazeta.ru/articles/2025/04/24/b',
        source_url: 'https://novayagazeta.ru/articles/2025/04/24/b',
        published_at: '2025-04-24T08:10:00.000Z',
      }),
      doc({
        id: 'media-1',
        source_type: 'media_coverage',
        title: 'Duplicate media coverage',
      }),
      doc({
        id: 'substack-1',
        title: 'Substack article',
        canonical_url: 'https://merkurov.substack.com/p/a',
        source_url: 'https://merkurov.substack.com/p/a',
        metadata: { source_domain: 'merkurov.substack.com' },
      }),
      doc({
        id: 'old-1',
        title: 'Old article',
        canonical_url: 'https://novayagazeta.ru/articles/2024/01/01/old',
        source_url: 'https://novayagazeta.ru/articles/2024/01/01/old',
        published_at: '2024-01-01T00:00:00.000Z',
      }),
    ];

    const inventory = selectPublicationInventory('novaya', documents, {
      from: '2025-01-01T00:00:00.000Z',
      to: null,
    });

    expect(inventory.count).toBe(2);
    expect(inventory.documents.map((entry) => entry.id)).toEqual(['a1', 'a2']);
    expect(inventory.totalChunks).toBe(12);
  });

  it('lists every selected article with its date', () => {
    const inventory = selectPublicationInventory('novaya', [
      doc({ id: 'a1', title: 'First article' }),
      doc({
        id: 'a2',
        title: 'Second article',
        canonical_url: 'https://novayagazeta.ru/articles/2025/04/24/b',
        source_url: 'https://novayagazeta.ru/articles/2025/04/24/b',
        published_at: '2025-04-24T08:10:00.000Z',
      }),
    ]);

    const answer = inventoryAnswer(
      inventory,
      'найти все мои колонки в новой газете'
    );

    expect(answer).toContain('2 уникальных материалов');
    expect(answer).toContain('2025-12-17 — First article');
    expect(answer).toContain('2025-04-24 — Second article');
  });
});
