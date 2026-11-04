/** @jest-environment node */

import React from 'react';
import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import WorkspaceMarkdown from '@/components/pierrot/workspace/WorkspaceMarkdown';

describe('editorial Markdown rendering', () => {
  it('renders headings, lists, quote, tables and code without raw HTML', () => {
    const content = [
      '## Раздел',
      '',
      'Лид-абзац с **акцентом** и `inline code`.',
      '',
      '- первый пункт',
      '  - вложенный пункт',
      '- второй пункт',
      '',
      '> editorial quote',
      '',
      '| Поле | Значение |',
      '| --- | --- |',
      '| Формат | Таблица |',
      '',
      '```ts',
      'const answer = 42;',
      '```',
      '',
      '<script>alert(1)</script>',
    ].join('\n');

    const html = renderToStaticMarkup(<WorkspaceMarkdown content={content} editorial />);

    expect(html).toMatch(/<h2[^>]*>Раздел<\/h2>/);
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).toContain('<blockquote>');
    expect(html).toContain('class="pw-table-wrap"');
    expect(html).toContain('<table>');
    expect(html).toContain('<code>inline code</code>');
    expect(html).toContain('<pre>');
    expect(html).toContain('const answer = 42;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('does not wrap tables outside editorial mode', () => {
    const html = renderToStaticMarkup(
      <WorkspaceMarkdown content={'| A | B |\n| --- | --- |\n| 1 | 2 |'} />
    );
    expect(html).not.toContain('pw-table-wrap');
  });
});
