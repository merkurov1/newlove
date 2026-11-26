import { renderIssueWeb } from '@/lib/flow-issue/render';
import { resolveIssueTitle } from '@/lib/flow-issue/title';
import type { IssueLang, IssuePayload } from '@/lib/flow-issue/types';

export type FlowIssueNavItem = {
  href: string;
  title: string;
  lang?: IssueLang;
  number?: number | null;
};

type FlowIssueArticleProps = {
  htmlWeb: string;
  lang: IssueLang;
  slug: string;
  /** Stored payload lets the page render the current template for old issues. */
  payload?: IssuePayload | null;
  title?: string;
  number?: number | null;
  /** Archive route for the language version, e.g. /flow-issues. */
  indexHref?: string;
  indexLabel?: string;
  /** Older issue in the same language edition. */
  previousIssue?: FlowIssueNavItem | null;
  /** Newer issue in the same language edition. */
  nextIssue?: FlowIssueNavItem | null;
};

function resolveHtml(
  htmlWeb: string,
  payload: IssuePayload | null | undefined,
  title: string | undefined,
  slug: string,
  number: number | null | undefined
): string {
  if (!payload) return htmlWeb;

  try {
    return renderIssueWeb(payload, {
      title: resolveIssueTitle(payload, title) || (payload.lang === 'ru' ? 'Поток' : 'Flow'),
      slug,
      number: number ?? null,
    });
  } catch (error) {
    console.error('[flow-issues] template re-render failed', error);
    return htmlWeb;
  }
}

function getIssueBody(html: string): string | null {
  const match = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return match?.[1] ?? null;
}

function getIssueStyles(html: string): string {
  const match = html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i);
  return match?.[1] ?? '';
}

/**
 * Shared renderer for a published Flow issue.
 *
 * The generated issue is a complete HTML document, but it is mounted inside
 * the site shell. We therefore keep the site header visible and offset the
 * article below the fixed header instead of hiding the global chrome.
 */
export default function FlowIssueArticle({
  htmlWeb,
  lang,
  slug,
  payload,
  title,
  number,
  indexHref = '/flow-issues',
  indexLabel,
  previousIssue = null,
  nextIssue = null,
}: FlowIssueArticleProps) {
  const renderedHtml = resolveHtml(htmlWeb, payload, title, slug, number);
  const body = getIssueBody(renderedHtml);
  if (!body) return null;

  const styles = getIssueStyles(renderedHtml);
  const archiveLabel = indexLabel || (lang === 'ru' ? 'Все выпуски' : 'All issues');

  return (
    <div lang={lang} className="flow-issue-page flow-issue-root min-h-screen">
      <style>{styles}</style>
      <style>{`
        /* Site-shell chrome for the issue. Every rule stays under the issue
         * roots so the global header and neighbouring pages are untouched. */
        .flow-issue-root.flow-issue-page {
          --font-serif: ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif;
          --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          min-width: 0;
          max-width: 100%;
          min-height: 100vh;
          background: var(--bg, #f7f3ec);
          color: var(--ink, #201e1a);
          padding-top: 5.5rem;
        }
        .flow-issue-root.flow-issue-page img,
        .flow-issue-root.flow-issue-page video,
        .flow-issue-root.flow-issue-page iframe {
          max-width: 100%;
        }
        @media (min-width: 640px) {
          .flow-issue-root.flow-issue-page {
            padding-top: 7rem;
          }
        }
        .flow-issue-root.flow-issue-page .flow-issue-back {
          position: relative;
          z-index: 11;
          display: flex;
          max-width: 1440px;
          min-width: 0;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px 12px;
          margin: 0 auto;
          padding: 0 clamp(16px, 4vw, 56px) 14px;
          color: var(--soft, #6b6257);
          font: 11px/1.4 ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .flow-issue-root.flow-issue-page .flow-issue-back a {
          min-height: 32px;
          display: inline-flex;
          align-items: center;
          overflow-wrap: anywhere;
          word-break: break-word;
          color: inherit;
          text-decoration: none;
          border-bottom: 1px solid transparent;
          transition: color 140ms ease, border-color 140ms ease;
        }
        .flow-issue-root.flow-issue-page .flow-issue-back a:hover {
          color: var(--ink, #201e1a);
          border-bottom-color: currentColor;
        }
        .flow-issue-root.flow-issue-page .flow-issue-back span {
          color: var(--line, #ddd4c5);
        }
        .flow-issue-root.flow-issue-page .flow-issue-back a:focus-visible,
        .flow-issue-root.flow-issue-page .flow-issue-pager a:focus-visible {
          outline: 2px solid var(--ink, #201e1a);
          outline-offset: 3px;
        }
        .flow-issue-root.flow-issue-page .flow-issue-pager {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 14px;
          max-width: 1440px;
          min-width: 0;
          margin: 0 auto;
          padding: 0 clamp(16px, 4vw, 56px) clamp(44px, 6vw, 72px);
        }
        @media (min-width: 640px) {
          .flow-issue-root.flow-issue-page .flow-issue-pager {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        .flow-issue-root.flow-issue-page .flow-issue-pager a {
          display: block;
          min-width: 0;
          padding: 16px 0 0;
          border-top: 1px solid var(--line, #ddd4c5);
          color: var(--ink, #201e1a);
          text-decoration: none;
        }
        .flow-issue-root.flow-issue-page .flow-issue-pager a:hover .flow-issue-pager__title {
          color: var(--claret, #7a2233);
        }
        .flow-issue-root.flow-issue-page .flow-issue-pager--next {
          text-align: left;
        }
        @media (min-width: 640px) {
          .flow-issue-root.flow-issue-page .flow-issue-pager--next {
            text-align: right;
          }
        }
        .flow-issue-root.flow-issue-page .flow-issue-pager__label {
          display: block;
          color: var(--soft, #6b6257);
          font: 10px/1.4 ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          overflow-wrap: anywhere;
        }
        .flow-issue-root.flow-issue-page .flow-issue-pager__title {
          display: block;
          min-width: 0;
          margin-top: 8px;
          font-family: var(--serif, var(--font-serif));
          font-size: 18px;
          line-height: 1.35;
          overflow-wrap: anywhere;
          transition: color 140ms ease;
        }
        @media (prefers-reduced-motion: reduce) {
          .flow-issue-root.flow-issue-page .flow-issue-back a,
          .flow-issue-root.flow-issue-page .flow-issue-pager__title {
            transition: none;
          }
        }
      `}</style>
      <div className="flow-issue-back">
        <a href="/flow">← Flow</a>
        <span>·</span>
        <a href={indexHref}>{archiveLabel}</a>
        <span>·</span>
        <a href={`/letters/${encodeURIComponent(slug)}`}>
          {lang === 'ru' ? 'Постоянная ссылка' : 'Permalink'}
        </a>
      </div>
      <div dangerouslySetInnerHTML={{ __html: body }} />

      {(previousIssue || nextIssue) && (
        <nav
          aria-label={lang === 'ru' ? 'Навигация по выпускам' : 'Issue navigation'}
          className="flow-issue-pager"
        >
          {previousIssue ? (
            <a href={previousIssue.href} rel="prev" className="flow-issue-pager--prev">
              <span className="flow-issue-pager__label">
                ← {lang === 'ru' ? 'Предыдущий выпуск' : 'Previous issue'}
                {previousIssue.number ? ` №${previousIssue.number}` : ''}
              </span>
              <span lang={previousIssue.lang || lang} className="flow-issue-pager__title">
                {previousIssue.title}
              </span>
            </a>
          ) : (
            <span aria-hidden="true" />
          )}

          {nextIssue && (
            <a href={nextIssue.href} rel="next" className="flow-issue-pager--next">
              <span className="flow-issue-pager__label">
                {lang === 'ru' ? 'Следующий выпуск' : 'Next issue'}
                {nextIssue.number ? ` №${nextIssue.number}` : ''} →
              </span>
              <span lang={nextIssue.lang || lang} className="flow-issue-pager__title">
                {nextIssue.title}
              </span>
            </a>
          )}
        </nav>
      )}
    </div>
  );
}
