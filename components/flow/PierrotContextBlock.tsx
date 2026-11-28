'use client';

import Link from 'next/link';
import { useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import PierrotAvatar from '@/components/pierrot/workspace/PierrotAvatar';
import { parseBilingualContent } from '@/lib/flow/bilingual';
import { isInternalFlowHref } from '@/lib/flow/linkKind';

export type AIContextData = {
  id?: string;
  item_id?: string;
  content: string | null;
  model?: string | null;
  provider?: string | null;
  status: string;
  generated_at?: string | null;
};

type Language = 'en' | 'ru';

interface Props {
  context: AIContextData | null;
  defaultLang?: string;
}

function preferredLanguage(value: string | undefined): Language {
  return value?.trim().toLowerCase().startsWith('en') ? 'en' : 'ru';
}

function initialLanguage(preferred: Language, hasEn: boolean, hasRu: boolean): Language {
  if (preferred === 'en') {
    return hasEn ? 'en' : 'ru';
  }

  return hasRu ? 'ru' : 'en';
}

function MarkdownLink({ href, children }: { href?: string; children: React.ReactNode }) {
  if (isInternalFlowHref(href) && href) {
    return (
      <Link
        href={href}
        data-link-kind="internal"
        className="break-words [overflow-wrap:anywhere] underline decoration-stone-300 underline-offset-4 transition hover:decoration-stone-900"
      >
        {children}
      </Link>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-link-kind="external"
      className="break-words [overflow-wrap:anywhere] underline decoration-stone-300 underline-offset-4 transition hover:decoration-stone-900"
    >
      {children}
    </a>
  );
}

/**
 * The Markdown primitives mirror the publication body so the comment reads as
 * a second authorial layer inside Flow rather than as a separate widget.
 */
const markdownComponents: Components = {
  h1: ({ children }) => (
    <h2 className="mb-4 mt-10 break-words font-serif text-3xl font-light leading-tight text-stone-900 first:mt-0 sm:text-4xl [overflow-wrap:anywhere]">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3.5 mt-9 break-words font-serif text-2xl font-light leading-tight text-stone-900 first:mt-0 sm:text-3xl [overflow-wrap:anywhere]">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-3 mt-8 break-words font-serif text-xl font-light leading-tight text-stone-900 first:mt-0 sm:text-2xl [overflow-wrap:anywhere]">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-2.5 mt-7 break-words font-serif text-lg font-medium leading-snug text-stone-900 first:mt-0 sm:text-xl [overflow-wrap:anywhere]">
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 className="mb-2 mt-6 break-words font-serif text-base font-medium leading-snug text-stone-900 first:mt-0 sm:text-lg [overflow-wrap:anywhere]">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="mb-2 mt-5 break-words font-mono text-[11px] font-medium uppercase leading-snug tracking-[0.12em] text-stone-600 first:mt-0 [overflow-wrap:anywhere]">
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <p className="mb-5 whitespace-pre-wrap break-words font-serif text-[18px] font-normal leading-[1.75] text-stone-800 [overflow-wrap:anywhere] sm:text-[20px]">
      {children}
    </p>
  ),
  strong: ({ children }) => <strong className="font-medium text-stone-950">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-8 max-w-full break-words border-l border-stone-400 pl-5 font-serif text-xl font-light leading-relaxed text-stone-600 [overflow-wrap:anywhere] sm:text-2xl">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => <MarkdownLink href={href}>{children}</MarkdownLink>,
  ul: ({ children }) => (
    <ul className="mb-6 max-w-full list-disc space-y-2 pl-6 font-serif text-[18px] font-normal leading-8 text-stone-800 marker:text-stone-400 sm:text-[20px]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-6 max-w-full list-decimal space-y-2 pl-6 font-serif text-[18px] font-normal leading-8 text-stone-800 marker:text-stone-400 sm:text-[20px]">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="min-w-0 break-words [overflow-wrap:anywhere]">{children}</li>
  ),
  hr: () => <hr className="my-9 border-0 border-t border-stone-200" />,
  pre: ({ children }) => (
    <pre className="my-7 w-full max-w-full overflow-x-auto overscroll-x-contain rounded-2xl bg-stone-950 p-4 font-mono text-sm leading-relaxed text-stone-100">
      {children}
    </pre>
  ),
  code: ({ children, className }) => {
    const isBlock = Boolean(className) || String(children).includes('\n');

    if (isBlock) {
      return <code className="whitespace-pre font-mono text-[0.85em]">{children}</code>;
    }

    return (
      <code className="break-words bg-stone-100 px-1 py-0.5 font-mono text-[0.85em] [overflow-wrap:anywhere]">
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="my-7 w-full max-w-full overflow-x-auto overscroll-x-contain">
      <table className="w-full border-collapse text-left font-serif text-[16px] leading-relaxed text-inherit">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-stone-300 px-3 py-2 font-medium text-stone-900 break-words [overflow-wrap:anywhere]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-stone-200 px-3 py-2 align-top break-words [overflow-wrap:anywhere]">
      {children}
    </td>
  ),
};

export default function PierrotContextBlock({ context, defaultLang }: Props) {
  // Hooks must run on every render, including the "no context" state, so the
  // order stays stable when the server sends ready content after a null one.
  const [selectedLanguage, setSelectedLanguage] = useState<Language | null>(null);

  if (!context || context.status !== 'ready' || !context.content) {
    return null;
  }

  const parsed = parseBilingualContent(context.content);
  const hasEn = Boolean(parsed.en?.trim());
  const hasRu = Boolean(parsed.ru?.trim());
  const isBilingual = hasEn && hasRu;

  // The publication language wins on first render. A context that only has the
  // other language still shows its one available version instead of an empty
  // pane, and the switch disappears so it can never lead to blank content.
  const preferred = preferredLanguage(defaultLang);
  const fallbackLanguage = initialLanguage(preferred, hasEn, hasRu);
  const language =
    selectedLanguage === 'en' && hasEn
      ? 'en'
      : selectedLanguage === 'ru' && hasRu
        ? 'ru'
        : fallbackLanguage;

  const text = (language === 'en' ? parsed.en : parsed.ru) || parsed.singleText || context.content;

  return (
    <section className="flow-pierrot" data-flow-pierrot aria-label="Pierrot comment">
      <div className="flow-pierrot__head">
        <div className="flow-pierrot__identity">
          <PierrotAvatar size={30} className="flow-pierrot__avatar" fallback="none" />
          <span className="flow-pierrot__name">Pierrot</span>
        </div>

        {isBilingual && (
          <div className="flow-pierrot__lang" role="group" aria-label="Pierrot comment language">
            <button
              type="button"
              onClick={() => setSelectedLanguage('en')}
              aria-pressed={language === 'en'}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setSelectedLanguage('ru')}
              aria-pressed={language === 'ru'}
            >
              RU
            </button>
          </div>
        )}
      </div>

      <div
        className="flow-item__body flow-pierrot__body"
        data-flow-pierrot-body
        data-language={language}
        lang={language}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {text}
        </ReactMarkdown>
      </div>
    </section>
  );
}
