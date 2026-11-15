// Next.js 16 does not allow importing `react-dom/server` from a Server
// Component or Route Handler (react-server condition). The edge build of
// React DOM exposes the same `renderToStaticMarkup` API and is safe to import
// in that environment.
import { renderToStaticMarkup } from 'react-dom/server.edge';
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
