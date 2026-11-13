import { buildPresentationResponseFromMarkdown } from '../fromMarkdown';
import { parsePierrotResponse } from '../schema';

describe('Markdown presentation adapter', () => {
  it('keeps a simple answer as editorial prose', () => {
    const response = buildPresentationResponseFromMarkdown(
      'Это короткий ответ.\n\nВторой абзац с **акцентом**.',
      { language: 'ru' }
    );
    expect(parsePierrotResponse(response)).not.toBeNull();
    expect(response?.blocks).toHaveLength(1);
    expect(response?.blocks[0]?.type).toBe('text');
    expect(response?.language).toBe('ru');
  });

  it('adapts headings, tables, quotes, code and warnings without inventing data', () => {
    const markdown = [
      '## Findings',
      '',
      'A short introduction.',
      '',
      '| Metric | Value |',
      '| --- | --- |',
      '| Sessions | 120 |',
      '| Revenue | — |',
      '',
      '> The exact source passage.',
      '> — Alex',
      '',
      '```ts filename=example.ts',
      'const value = 1;',
      '```',
      '',
      'Warning: this is a limitation.',
    ].join('\n');

    const response = buildPresentationResponseFromMarkdown(markdown, { language: 'en' });
    expect(parsePierrotResponse(response)).not.toBeNull();
    const types = response?.blocks.map((block) => block.type);
    expect(types).toEqual(['heading', 'text', 'table', 'quote', 'code', 'warning']);
    const table = response?.blocks.find((block) => block.type === 'table');
    expect(table?.type).toBe('table');
    if (table?.type === 'table') {
      expect(table.rows).toHaveLength(2);
      expect(table.rows[0].c2).toBe('120');
    }
    expect(response?.blocks).not.toContainEqual(expect.objectContaining({ type: 'metric' }));
    expect(response?.blocks).not.toContainEqual(expect.objectContaining({ type: 'chart' }));
  });

  it('turns numbered procedures and checklists into first-class blocks', () => {
    const markdown = [
      '### Procedure',
      '',
      '1. Open the source chapter.',
      '2. Read the passage in full.',
      '3. Draft the scene list.',
      '',
      '- [x] Verify the quotation',
      '- [ ] Check the publication date',
    ].join('\n');

    const response = buildPresentationResponseFromMarkdown(markdown);
    expect(response?.blocks.map((block) => block.type)).toEqual([
      'heading',
      'steps',
      'checklist',
    ]);
    expect(parsePierrotResponse(response)).not.toBeNull();
  });

  it('preserves a very long answer without exceeding the block limit', () => {
    const markdown = Array.from({ length: 80 }, (_, index) => `## Section ${index + 1}\n\nParagraph ${index + 1}.`).join('\n\n');
    const response = buildPresentationResponseFromMarkdown(markdown);
    expect(response).not.toBeNull();
    expect(response!.blocks.length).toBeLessThanOrEqual(24);
    expect(JSON.stringify(response)).toContain('Paragraph 80');
    expect(parsePierrotResponse(response)).not.toBeNull();
  });

  it('returns null for empty content and preserves unsupported numeric prose as prose', () => {
    expect(buildPresentationResponseFromMarkdown('')).toBeNull();
    const response = buildPresentationResponseFromMarkdown(
      'There were 42 sessions in the period, but this is not a metric block.'
    );
    expect(response?.blocks[0]?.type).toBe('text');
  });
});
