/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { extractPlainTextDocument, buildPlainTextBlocks } from '../textExtract';
import { sha256Hex } from '../sourceValidation';

const sha = sha256Hex('source');

describe('plain text extraction', () => {
  it('preserves headings, paragraphs, quotes and lists as blocks', () => {
    const text = [
      '# Annual Report',
      '',
      'Author: Anton Merkurov',
      '2025-03-14',
      '',
      '## Introduction',
      '',
      'First paragraph with Unicode: Привет, мир. Emoji: 🜂.',
      '',
      '> A quoted line.',
      '',
      '- first item',
      '- second item',
    ].join('\n');

    const blocks = buildPlainTextBlocks(text);

    expect(blocks[0]).toMatchObject({ type: 'heading', text: 'Annual Report', level: 1 });
    expect(blocks.some((block) => block.type === 'quote' && block.text === 'A quoted line.')).toBe(
      true
    );
    expect(blocks.filter((block) => block.type === 'list')).toHaveLength(2);
    expect(blocks.some((block) => block.type === 'paragraph' && block.text.includes('Привет'))).toBe(
      true
    );
  });

  it('extracts title, author, date and language without losing Unicode', () => {
    const document = extractPlainTextDocument({
      kind: 'text',
      rawText: [
        '# Заголовок',
        '',
        'Автор: Антон Меркуров',
        '2024-12-31',
        '',
        'Первый абзац.',
        '',
        'Второй абзац.',
      ].join('\r\n'),
      sourceSha256: sha,
      byteSize: 128,
    });

    expect(document.title).toBe('Заголовок');
    expect(document.author).toBe('Антон Меркуров');
    expect(document.publishedAt).toBe('2024-12-31T00:00:00.000Z');
    expect(document.language).toBe('ru');
    expect(document.charCount).toBeGreaterThan(0);
    expect(document.blocks.some((block) => block.text.includes('Первый абзац'))).toBe(true);
    expect(document.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(document.status).toBe('complete');
  });

  it('uses explicit metadata overrides', () => {
    const document = extractPlainTextDocument({
      kind: 'txt',
      rawText: 'Plain body text that is long enough to be indexed.',
      sourceSha256: sha,
      filename: 'notes.txt',
      title: 'Manual title',
      author: 'Manual author',
      publishedAt: '2020-01-02T00:00:00.000Z',
      language: 'en',
    });

    expect(document.title).toBe('Manual title');
    expect(document.author).toBe('Manual author');
    expect(document.publishedAt).toBe('2020-01-02T00:00:00.000Z');
    expect(document.language).toBe('en');
    expect(document.diagnostics.file).toMatchObject({ format: 'txt' });
  });
});
