/** @jest-environment node */

import type { ExtractedArticle } from '../extract';
import { chunkArticle } from '../chunk';

function articleWith(blocks: ExtractedArticle['blocks']): ExtractedArticle {
  const text = blocks.map((block) => block.text).join('\n\n');

  return {
    url: 'https://example.com/column',
    canonicalUrl: 'https://example.com/column',
    title: 'A Column About Attention',
    author: 'Anton Merkurov',
    siteName: 'Example',
    publishedAt: null,
    language: 'en',
    text,
    blocks,
    contentHash: 'a'.repeat(64),
    wordCount: text.split(/\s+/).length,
    charCount: text.length,
    status: 'ok',
    diagnostics: {
      parser: 'scored',
      fallbackChars: text.length,
      selectedChars: text.length,
      wordCount: text.split(/\s+/).length,
      paragraphCount: blocks.length,
      headingCount: blocks.filter((block) => block.type === 'heading').length,
      linkDensity: 0,
      paywallDetected: false,
      htmlChars: text.length,
    },
  };
}

describe('Brain article chunking', () => {
  it('preserves headings, section paths and stable chunk ids', () => {
    const article = articleWith([
      { type: 'heading', text: 'First movement', level: 2 },
      { type: 'paragraph', text: 'A first paragraph about attention and rooms.' },
      { type: 'paragraph', text: 'A second paragraph that continues the argument.' },
      { type: 'heading', text: 'Second movement', level: 2 },
      { type: 'paragraph', text: 'A third paragraph, returning from another door.' },
    ]);

    const result = chunkArticle(article, 'doc_article_test');

    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.chunks[0].sectionIndex).toBe(0);
    expect(result.chunks[0].sectionPath).toEqual(['A Column About Attention', 'First movement']);
    expect(result.chunks.at(-1)?.sectionPath).toEqual([
      'A Column About Attention',
      'Second movement',
    ]);

    for (const chunk of result.chunks) {
      expect(chunk.id).toMatch(/^chk_[a-f0-9]{32}$/);
      expect(chunk.content.length).toBeLessThanOrEqual(2400);
      expect(chunk.lineStart).toBeGreaterThanOrEqual(1);
      expect(chunk.lineEnd).toBeGreaterThanOrEqual(chunk.lineStart);
      expect(chunk.heading.length).toBeGreaterThan(0);
      expect(chunk.sectionPath.length).toBeGreaterThan(0);
    }

    const again = chunkArticle(article, 'doc_article_test');
    expect(again.chunks.map((chunk) => chunk.id)).toEqual(result.chunks.map((chunk) => chunk.id));
  });

  it('splits an oversized paragraph without truncating the text', () => {
    const paragraph = Array.from(
      { length: 120 },
      (_, index) => `Sentence ${index + 1} carries the argument forward with enough words to matter.`
    ).join(' ');

    const article = articleWith([{ type: 'paragraph', text: paragraph }]);
    const result = chunkArticle(article, 'doc_article_long');

    expect(result.chunks.length).toBeGreaterThan(1);
    expect(result.chunks.every((chunk) => chunk.content.length <= 2400)).toBe(true);
    expect(result.chunks.map((chunk) => chunk.content).join(' ')).toContain('Sentence 120');
  });
});
