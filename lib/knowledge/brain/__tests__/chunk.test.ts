/** @jest-environment node */

import type { ExtractedArticle } from '../extract';
import { chunkArticle } from '../chunk';

function articleWith(blocks: ExtractedArticle['blocks']): ExtractedArticle {
  const text = blocks.map((block) => block.text).join('\n\n');

  return {
    url: 'https://example.com/column',
    canonicalUrl: 'https://example.com/column',
    sourceDomain: 'example.com',
    sourceType: 'article',
    title: 'A Column About Attention',
    author: 'Anton Merkurov',
    siteName: 'Example',
    publishedAt: '2026-05-04T00:00:00.000Z',
    publishedAtSource: 'metadata',
    language: 'en',
    text,
    blocks,
    contentHash: 'a'.repeat(64),
    wordCount: text.split(/\s+/).length,
    charCount: text.length,
    status: 'complete',
    extractionVersion: 'brain-article-extractor-v2',
    diagnostics: {
      parser: 'scored',
      fallbackChars: text.length,
      selectedChars: text.length,
      bodyChars: text.length,
      wordCount: text.split(/\s+/).length,
      paragraphCount: blocks.length,
      headingCount: blocks.filter((block) => block.type === 'heading').length,
      linkDensity: 0,
      boilerplateChars: 0,
      boilerplateCount: 0,
      boilerplateRatio: 0,
      completeness: 1,
      paywallDetected: false,
      truncated: false,
      htmlChars: text.length,
      sourceDomain: 'example.com',
      siteProfile: 'generic',
      extractionVersion: 'brain-article-extractor-v2',
      publishedAtSource: 'metadata',
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
      expect(chunk.metadata).toMatchObject({
        source_type: 'article',
        source_domain: 'example.com',
        language: 'en',
        publication_date: '2026-05-04T00:00:00.000Z',
        chunker_version: 'brain-article-chunker-v2',
      });
    }

    const again = chunkArticle(article, 'doc_article_test');
    expect(again.chunks.map((chunk) => chunk.id)).toEqual(result.chunks.map((chunk) => chunk.id));
  });

  it('keeps a quotation with the paragraph that introduced it', () => {
    const paragraph =
      'The room was quiet, but the argument was already moving through the furniture.';
    const quote = '> Attention is a room we build before we know who will enter it.';

    const article = articleWith([
      { type: 'paragraph', text: paragraph },
      { type: 'quote', text: quote },
    ]);

    const result = chunkArticle(article, 'doc_article_quote');
    const combined = result.chunks.map((chunk) => chunk.content).join('\n');

    expect(combined).toContain(paragraph);
    expect(combined).toContain(quote);
    expect(result.chunks.length).toBe(1);
  });

  it('splits an oversized paragraph without truncating the text', () => {
    const paragraph = Array.from(
      { length: 120 },
      (_, index) =>
        `Sentence ${index + 1} carries the argument forward with enough words to matter.`
    ).join(' ');

    const article = articleWith([{ type: 'paragraph', text: paragraph }]);
    const result = chunkArticle(article, 'doc_article_long');

    expect(result.chunks.length).toBeGreaterThan(1);
    expect(result.chunks.every((chunk) => chunk.content.length <= 2400)).toBe(true);
    expect(result.chunks.map((chunk) => chunk.content).join(' ')).toContain('Sentence 120');
  });
});
