import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractHeadings, headingIdsByLine, slugifyHeading } from '../readerDocument';

describe('readerDocument heading ids', () => {
  it('creates stable slugs for punctuation and non-Latin text', () => {
    expect(slugifyHeading('The Spectral Tiger')).toBe('the-spectral-tiger');
    expect(slugifyHeading('  C# & "status"  ')).toBe('c-status');
    expect(slugifyHeading('Часть I — Гранит')).toBe('часть-i-гранит');
  });

  it('deduplicates repeated headings and keeps the TOC ids in source order', () => {
    const markdown = [
      '# The Spectral Tiger',
      '## The Spectral Tiger',
      '### The Spectral Tiger-2',
    ].join('\n');

    expect(extractHeadings(markdown)).toEqual([
      { id: 'the-spectral-tiger', title: 'The Spectral Tiger', level: 1, line: 1 },
      { id: 'the-spectral-tiger-2', title: 'The Spectral Tiger', level: 2, line: 2 },
      { id: 'the-spectral-tiger-2-2', title: 'The Spectral Tiger-2', level: 3, line: 3 },
    ]);
  });

  it('strips inline Markdown from titles while preserving the words', () => {
    const markdown = '## [The _spectral_ tiger](https://example.com) `2008`';

    expect(extractHeadings(markdown)).toEqual([
      {
        id: 'the-spectral-tiger-2008',
        title: 'The spectral tiger 2008',
        level: 2,
        line: 1,
      },
    ]);
  });

  it('ignores headings inside fenced code blocks', () => {
    const markdown = ['```md', '# Not a heading', '```', '## A real heading'].join('\n');

    expect(extractHeadings(markdown)).toEqual([
      { id: 'a-real-heading', title: 'A real heading', level: 2, line: 4 },
    ]);
  });

  it('maps generated ids back to their Markdown line numbers', () => {
    const items = extractHeadings('# One\n\ntext\n\n### Three');
    const byLine = headingIdsByLine(items);

    expect(byLine.get(1)).toBe('one');
    expect(byLine.get(5)).toBe('three');
  });

  it('generates unique ids for every heading in the real manuscript', () => {
    const manuscript = readFileSync(
      path.join(process.cwd(), 'app/unframed/Unframed.markdown'),
      'utf8'
    );
    const items = extractHeadings(manuscript);
    const ids = items.map((item) => item.id);

    expect(items.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
