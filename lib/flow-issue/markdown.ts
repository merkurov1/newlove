import { Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { compiler as compileMarkdown } from 'markdown-to-jsx';

/**
 * A body needs the Markdown pipeline only when it actually contains a
 * construct we can render. Plain notes keep the historical paragraph
 * renderer, including its deliberate single-line breaks, so existing issues
 * do not change appearance.
 */
const MARKDOWN_BLOCK = /(^|\n)\s{0,3}(?:#{1,6}\s|>\s?|(?:[-*+]|\d+[.)])\s|```|~~~|\|.*\|\s*$|<https?:\/\/)/m;
const MARKDOWN_INLINE = /!\[[^\]]*\]\([^)]*\)|\[[^\]]+\]\([^)\s]+\)|`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__/;

export function containsIssueMarkdown(value: string): boolean {
  return MARKDOWN_BLOCK.test(value) || MARKDOWN_INLINE.test(value);
}

/**
 * Markdown tables need their own scroll container. The rest of the Markdown
 * output is styled by the issue-scoped `.item .md` rules.
 */
function wrapTables(html: string): string {
  return html
    .replace(/<table(?:\s[^>]*)?>/g, (table) => `<div class="md-table">${table}`)
    .replace(/<\/table>/g, '</table></div>');
}

export function renderIssueMarkdown(value: string): string {
  const html = renderToStaticMarkup(
    compileMarkdown(value, {
      // Issue bodies are public content. Never turn raw HTML in an item into
      // live markup; render it as text like the previous escape-only path.
      disableParsingRawHTML: true,
      wrapper: Fragment,
    })
  )
    // React 19 emits image preload hints for static markup. They belong in
    // <head>, not inside the issue body, and carry no visible content.
    .replace(/<link rel="preload" as="image" href="[^"]*"\s*\/?>/gi, '');

  if (!html) return '';

  return `<div class="md">${wrapTables(html)}</div>`;
}
