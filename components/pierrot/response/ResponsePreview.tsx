'use client';

import React from 'react';
import PierrotMarkdown from '@/components/pierrot/PierrotMarkdown';
import { RESPONSE_PREVIEW_CASES } from '@/lib/pierrot/response/previewFixtures';
import { PIERROT_RESPONSE_VERSION, type PierrotResponse } from '@/lib/pierrot/response/types';
import PierrotResponseRenderer from './PierrotResponseRenderer';

const INVALID_RESPONSE = {
  version: PIERROT_RESPONSE_VERSION,
  blocks: [{ type: 'chart', data: [], xKey: 'x', series: [] }],
} as unknown as PierrotResponse;

export default function ResponsePreview({ only }: { only?: string | null }) {
  const cases = only
    ? RESPONSE_PREVIEW_CASES.filter((entry) => entry.id === only)
    : RESPONSE_PREVIEW_CASES;

  return (
    <main className="min-h-screen bg-[#FAF8F5] px-5 py-10 text-[#2F2B26] sm:px-8 lg:px-12">
      <header className="mx-auto max-w-[1200px] border-b border-[#D9D0C3] pb-6">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-[#A5764F]">
          Pierrot · rendering preview
        </p>
        <h1 className="mt-3 font-serif text-[32px] leading-tight tracking-[-0.02em] text-[#1F1C18] sm:text-[42px]">
          Editorial response compositions
        </h1>
        <p className="mt-3 max-w-2xl font-serif text-[15px] leading-relaxed text-[#625B50]">
          Слева — исходный Markdown. Справа — та же мысль после локального presentation adapter:
          без дополнительного model call и без изменения содержания.
        </p>
      </header>

      <div className="mx-auto mt-8 max-w-[1200px] space-y-12">
        {cases.map((entry) => (
          <section
            key={entry.id}
            id={`case-${entry.id}`}
            className="scroll-mt-6 border-t border-[#E4DCCF] pt-5"
          >
            <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 className="font-serif text-[21px] leading-snug text-[#211F1F]">{entry.label}</h2>
              <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-[#948A7D]">
                {entry.note}
              </p>
            </header>
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="min-w-0 border border-[#E4DCCF] bg-[#FCFAF6] p-4">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#A49A8C]">
                  Markdown fallback
                </p>
                <div className="font-serif text-[15.5px] leading-[1.8] text-[#2F2B26]">
                  <PierrotMarkdown content={entry.fallback} />
                </div>
              </div>
              <div className="min-w-0 border border-[#DED4C6] bg-white/70 p-4">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#A5764F]">
                  Structured composition
                </p>
                <div className="font-serif text-[15.5px] leading-[1.8] text-[#2F2B26]">
                  <PierrotResponseRenderer
                    response={entry.response}
                    fallbackMarkdown={entry.fallback}
                  />
                </div>
              </div>
            </div>
          </section>
        ))}

        <section id="case-invalid" className="border-t border-[#E4DCCF] pt-5">
          <h2 className="font-serif text-[21px] leading-snug text-[#211F1F]">
            12 · Invalid block fallback
          </h2>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.13em] text-[#948A7D]">
            A malformed chart never becomes a broken interface.
          </p>
          <div className="mt-4 max-w-2xl border border-[#DED4C6] bg-white/70 p-4">
            <PierrotResponseRenderer
              response={INVALID_RESPONSE}
              fallbackMarkdown="**Markdown fallback** остаётся видимым, даже если структурированный блок не прошёл валидацию."
            />
          </div>
        </section>

        <section id="case-old" className="border-t border-[#E4DCCF] pt-5">
          <h2 className="font-serif text-[21px] leading-snug text-[#211F1F]">
            13 · Old Markdown-only message
          </h2>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.13em] text-[#948A7D]">
            Historical Markdown-only messages now use the same local adapter.
          </p>
          <div className="mt-4 max-w-2xl border border-[#E4DCCF] bg-[#FCFAF6] p-4 font-serif text-[15.5px] leading-[1.8]">
            <PierrotResponseRenderer
              fallbackMarkdown={'## Архив\n\nСтарое сообщение остаётся **читаемым** и не требует миграции.\n\n1. Открыть источник.\n2. Проверить цитату.'}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
