import { renderToStaticMarkup } from 'react-dom/server.node';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { absoluteMarkdownUrl } from './feed';

/**
 * Render a Flow post body to self-contained HTML for a feed.
 *
 * react-markdown never emits raw HTML from the source, and it sanitizes
 * dangerous link protocols. `urlTransform` then makes relative links and
 * images absolute, because a feed has no page context to resolve them
 * against.
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown || !markdown.trim()) return '';

  return renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={absoluteMarkdownUrl}>
      {markdown}
    </ReactMarkdown>
  );
}
