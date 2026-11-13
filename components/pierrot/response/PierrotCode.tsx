'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { PierrotCodeBlock } from '@/lib/pierrot/response/types';

type HighlightModule = {
  highlight: (
    code: string,
    options: { language: string; ignoreIllegals?: boolean }
  ) => { value: string };
  highlightAuto: (code: string) => { value: string };
  getLanguage: (name: string) => unknown;
};

function languageLabel(value?: string): string {
  if (!value) return 'text';
  return value.toLowerCase();
}

export default function PierrotCode({ block }: { block: PierrotCodeBlock }) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const language = languageLabel(block.language);
  const lines = useMemo(() => block.code.split('\n').length, [block.code]);

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      try {
        const moduleValue = (await import('highlight.js/lib/common')) as unknown as {
          default?: HighlightModule;
        } & HighlightModule;
        const hljs = moduleValue.default || moduleValue;
        if (cancelled) return;

        const result = hljs.getLanguage(language)
          ? hljs.highlight(block.code, { language, ignoreIllegals: true })
          : hljs.highlightAuto(block.code);
        if (!cancelled) setHtml(result.value);
      } catch {
        if (!cancelled) setHtml(null);
      }
    }

    void highlight();
    return () => {
      cancelled = true;
    };
  }, [block.code, language]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(block.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard is optional; the code remains selectable.
    }
  };

  return (
    <figure className="my-5 min-w-0 overflow-hidden border border-[#E4DCCF] bg-[#F7F3EC]">
      <style>{`
        .pierrot-code .hljs-keyword,.pierrot-code .hljs-selector-tag,.pierrot-code .hljs-literal{color:#8A1235}
        .pierrot-code .hljs-string,.pierrot-code .hljs-attr{color:#5F735A}
        .pierrot-code .hljs-number,.pierrot-code .hljs-symbol{color:#9A6A3F}
        .pierrot-code .hljs-comment{color:#948A7D;font-style:italic}
        .pierrot-code .hljs-title,.pierrot-code .hljs-function{color:#2F2B26}
      `}</style>
      <figcaption className="flex items-center justify-between gap-3 border-b border-[#E4DCCF] px-3 py-2">
        <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[#8A8175]">
          {block.filename || language}
        </span>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-[#948A7D] transition hover:text-[#2F2B26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B9AB98]"
          aria-label="Copy code"
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </figcaption>
      <div className="pierrot-code max-w-full overflow-x-auto">
        <div className="flex min-w-max">
          {block.showLineNumbers && (
            <pre
              aria-hidden="true"
              className="select-none border-r border-[#E4DCCF] px-2 py-3 text-right font-mono text-[12px] leading-[1.65] text-[#B3A899]"
            >
              {Array.from({ length: lines }, (_, index) => index + 1).join('\n')}
            </pre>
          )}
          <pre className="min-w-0 px-3 py-3 font-mono text-[14px] leading-[1.65] text-[#37332D] sm:text-[12px]">
            {html ? (
              <code dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <code>{block.code}</code>
            )}
          </pre>
        </div>
      </div>
    </figure>
  );
}
