import { renderIssueWeb } from '@/lib/flow-issue/render';
import { buildIssueTitle } from '@/lib/flow-issue/title';
import type { IssueLang, IssuePayload } from '@/lib/flow-issue/types';

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
      title: buildIssueTitle(payload) || title || (payload.lang === 'ru' ? 'Поток' : 'Flow'),
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
}: FlowIssueArticleProps) {
  const renderedHtml = resolveHtml(htmlWeb, payload, title, slug, number);
  const body = getIssueBody(renderedHtml);
  if (!body) return null;

  const styles = getIssueStyles(renderedHtml);
  const archiveLabel = indexLabel || (lang === 'ru' ? 'Все выпуски' : 'All issues');

  return (
    <div lang={lang} className="flow-issue-page min-h-screen bg-[#FAF8F5] text-[#1C1A1B]">
      <style>{styles}</style>
      <style>{`
        body:has(.flow-issue-page) {
          background: #FAF8F5 !important;
        }
        /* The global site header is fixed; start the issue below it. */
        .flow-issue-page {
          padding-top: 6rem;
        }
        @media (min-width: 640px) {
          .flow-issue-page {
            padding-top: 7rem;
          }
        }
        .flow-issue-back {
          position: relative;
          z-index: 11;
          max-width: 1440px;
          min-width: 0;
          margin: 0 auto;
          padding: 0 clamp(18px, 3vw, 44px) 10px;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          font: 12px ui-monospace, monospace;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: #52525B;
        }
        .flow-issue-back a {
          overflow-wrap: anywhere;
          word-break: break-word;
          color: inherit;
          text-decoration: none;
          border-bottom: 1px solid transparent;
        }
        .flow-issue-back a:hover {
          border-bottom-color: currentColor;
        }
        .flow-issue-back span {
          color: #D4D4D8;
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
    </div>
  );
}
