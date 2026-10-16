'use client';

import React, { useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseBilingualContent } from '@/lib/flow/bilingual';

export type AIContextData = {
  id?: string;
  item_id?: string;
  content: string | null;
  model?: string | null;
  provider?: string | null;
  status: string;
  generated_at?: string | null;
};

interface Props {
  context: AIContextData | null;
  defaultLang?: string;
}

export default function PierrotContextBlock({ context, defaultLang = 'ru' }: Props) {
  if (!context || context.status !== 'ready' || !context.content) {
    return null;
  }

  const parsed = parseBilingualContent(context.content);
  const isBilingual = parsed.isBilingual;

  // Initial view mode: 'both' if bilingual, otherwise 'single'
  const [mode, setMode] = useState<'both' | 'ru' | 'en'>('both');

  const markdownComponents: Components = {
    p: ({ children }) => (
      <p className="mb-3 leading-relaxed last:mb-0">
        {children}
      </p>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-stone-900">
        {children}
      </strong>
    ),
    em: ({ children }) => (
      <em className="italic text-stone-700">
        {children}
      </em>
    ),
  };

  return (
    <section className="mt-14 border-t border-stone-200/80 pt-8 sm:mt-16 sm:pt-10">
      {/* Editorial Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[#DFD7C7] bg-[#F4EFE6] font-serif text-[13px] font-semibold text-[#554E44] shadow-xs select-none">
            P
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif text-[15px] font-medium tracking-tight text-stone-900">
                Pierrot
              </span>
              <span className="h-1 w-1 rounded-full bg-stone-300" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#990F3D] font-semibold">
                Context Architecture
              </span>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-stone-400">
              Digital shadow &amp; advisor
            </p>
          </div>
        </div>

        {/* Language Mode Switcher (only shown if dual language content is present) */}
        {isBilingual && (
          <div className="flex items-center rounded-full border border-stone-200 bg-stone-100/70 p-0.5 font-mono text-[11px] select-none">
            <button
              type="button"
              onClick={() => setMode('both')}
              className={`rounded-full px-2.5 py-1 uppercase tracking-wider transition-all ${
                mode === 'both'
                  ? 'bg-white text-stone-900 shadow-xs font-semibold'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              Двуязычно
            </button>
            <button
              type="button"
              onClick={() => setMode('ru')}
              className={`rounded-full px-2.5 py-1 uppercase tracking-wider transition-all ${
                mode === 'ru'
                  ? 'bg-white text-stone-900 shadow-xs font-semibold'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              RU
            </button>
            <button
              type="button"
              onClick={() => setMode('en')}
              className={`rounded-full px-2.5 py-1 uppercase tracking-wider transition-all ${
                mode === 'en'
                  ? 'bg-white text-stone-900 shadow-xs font-semibold'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              EN
            </button>
          </div>
        )}
      </div>

      {/* Content Area */}
      {isBilingual ? (
        <div>
          {mode === 'both' && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {/* Russian Card */}
              <div className="rounded-xl border border-[#E8E2D8] bg-[#FAF8F5]/80 p-5 sm:p-6 transition-colors">
                <div className="mb-3 flex items-center justify-between border-b border-[#EFEAE2] pb-2 font-mono text-[10px] uppercase tracking-wider">
                  <span className="font-semibold text-[#990F3D]">RU · Контекст</span>
                  <span className="text-stone-400">Русская версия</span>
                </div>
                <div className="font-serif text-[15px] sm:text-[16px] font-light leading-[1.8] text-stone-700">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {parsed.ru || ''}
                  </ReactMarkdown>
                </div>
              </div>

              {/* English Card */}
              <div className="rounded-xl border border-[#E8E2D8] bg-[#FAF8F5]/80 p-5 sm:p-6 transition-colors">
                <div className="mb-3 flex items-center justify-between border-b border-[#EFEAE2] pb-2 font-mono text-[10px] uppercase tracking-wider">
                  <span className="font-semibold text-stone-600">EN · Insight</span>
                  <span className="text-stone-400">English version</span>
                </div>
                <div className="font-serif text-[15px] sm:text-[16px] font-light leading-[1.8] text-stone-700">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {parsed.en || ''}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )}

          {mode === 'ru' && (
            <div className="rounded-xl border border-[#E8E2D8] bg-[#FAF8F5]/80 p-6 sm:p-8">
              <div className="mb-3 flex items-center justify-between border-b border-[#EFEAE2] pb-2 font-mono text-[10px] uppercase tracking-wider">
                <span className="font-semibold text-[#990F3D]">RU · Русский контекст</span>
                <span className="text-stone-400">Pierrot Editorial</span>
              </div>
              <div className="font-serif text-base sm:text-lg font-light leading-[1.85] text-stone-800">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {parsed.ru || ''}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {mode === 'en' && (
            <div className="rounded-xl border border-[#E8E2D8] bg-[#FAF8F5]/80 p-6 sm:p-8">
              <div className="mb-3 flex items-center justify-between border-b border-[#EFEAE2] pb-2 font-mono text-[10px] uppercase tracking-wider">
                <span className="font-semibold text-stone-700">EN · Editorial Insight</span>
                <span className="text-stone-400">Pierrot Editorial</span>
              </div>
              <div className="font-serif text-base sm:text-lg font-light leading-[1.85] text-stone-800">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {parsed.en || ''}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Single language insight */
        <div className="rounded-xl border border-[#E8E2D8] bg-[#FAF8F5]/80 p-6 sm:p-8">
          <div className="mb-3 flex items-center justify-between border-b border-[#EFEAE2] pb-2 font-mono text-[10px] uppercase tracking-wider">
            <span className="font-semibold text-[#990F3D]">
              {parsed.ru ? 'RU · Контекст' : 'EN · Insight'}
            </span>
            <span className="text-stone-400">Pierrot Editorial</span>
          </div>
          <div className="font-serif text-base sm:text-lg font-light leading-[1.85] text-stone-800">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {parsed.singleText || parsed.ru || parsed.en || ''}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </section>
  );
}
