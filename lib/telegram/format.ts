/**
 * Convert the small markdown subset produced by the AI into Telegram HTML.
 *
 * Telegram's legacy Markdown mode expects single-asterisk bold, so GitHub-style
 * `**bold**` can leak as literal asterisks. HTML mode is easier to make safe:
 * escape the source first, then insert only a controlled set of tags.
 */

import { linkifyInternalRoutes } from '@/lib/pierrot/linkify';

const SITE_URL = 'https://www.merkurov.love';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function toTelegramHtml(markdown: string): string {
  let text = linkifyInternalRoutes(markdown).replace(/\r\n?/g, '\n');

  // Keep code blocks literal: markdown inside them must not become tags.
  const codeBlocks: string[] = [];
  text = text.replace(/```([\s\S]*?)```/g, (_match, code: string) => {
    codeBlocks.push(`<pre>${escapeHtml(code.trim())}</pre>`);
    return `\u0000CODE${codeBlocks.length - 1}\u0000`;
  });

  const inlineCode: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    inlineCode.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000INLINE${inlineCode.length - 1}\u0000`;
  });

  text = escapeHtml(text);

  // Markdown links: external http(s) and internal routes only.
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g,
    (_match, label: string, href: string) => {
      const url = href.startsWith('/') ? `${SITE_URL}${href}` : href;
      return `<a href="${url}">${label}</a>`;
    }
  );

  // Telegram HTML has no headings; make them bold.
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

  // Bold first, then italic, so **...** is not consumed as two italics.
  text = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  text = text.replace(/__(.+?)__/g, '<b>$1</b>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>');
  text = text.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<i>$2</i>');

  text = text.replace(
    /\u0000CODE(\d+)\u0000/g,
    (_match, index: string) => codeBlocks[Number(index)] ?? ''
  );
  text = text.replace(
    /\u0000INLINE(\d+)\u0000/g,
    (_match, index: string) => inlineCode[Number(index)] ?? ''
  );

  return text;
}
