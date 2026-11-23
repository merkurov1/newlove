'use client';

import React from 'react';

import PierrotMarkdown from '@/components/pierrot/PierrotMarkdown';
import WorkspaceMarkdown from '@/components/pierrot/workspace/WorkspaceMarkdown';
import { buildPresentationResponseFromMarkdown } from '@/lib/pierrot/response/fromMarkdown';

import PierrotResponseRenderer from './PierrotResponseRenderer';

type Scenario = {
  id: string;
  label: string;
  note: string;
  markdown: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: 'ordinary',
    label: 'A · Ordinary long answer',
    note: 'Headings, paragraphs and lists stay Markdown.',
    markdown: [
      '## Что изменилось',
      '',
      'Архив стал плотнее, но не однороднее. **Главный сдвиг** — от отдельных текстов к связной системе тем.',
      '',
      '- Digital Temple чаще ссылается на сам себя.',
      '- Рыночные материалы остаются фрагментарными.',
      '- Новая редакция UNFRAMED собирает вторую часть в единую линию.',
      '',
      '### Что это значит',
      '',
      'Это не рост объёма, а изменение качества связей.',
    ].join('\n'),
  },
  {
    id: 'table',
    label: 'B · Table and links',
    note: 'A Markdown table and a link, not a bespoke table block.',
    markdown: [
      'Неделя была ровной. Подробнее — в [отчёте](/admin/pierrot).',
      '',
      '| День | Визиты |',
      '| --- | --- |',
      '| Пн | 120 |',
      '| Вт | 140 |',
      '',
      'Таблица остаётся обычным Markdown.',
    ].join('\n'),
  },
  {
    id: 'quote-code',
    label: 'C · Quote and code',
    note: 'The quote and the fence keep their native Markdown rhythm.',
    markdown: [
      '> Система важнее суммы текстов.',
      '> — Anton Merkurov',
      '',
      'Короткий пример:',
      '',
      '```ts',
      'const answer = { markdownFirst: true };',
      '```',
    ].join('\n'),
  },
  {
    id: 'restored',
    label: 'D · Restored historical answer',
    note: 'A saved Markdown-only message still renders without migration.',
    markdown: [
      '## Архив',
      '',
      'Старое сообщение остаётся **читаемым** и не требует миграции.',
      '',
      '1. Открыть источник.',
      '2. Проверить цитату.',
    ].join('\n'),
  },
];

/**
 * Development-only comparison used for owner review. The left column simulates
 * the previous automatic Markdown → block adapter; the two right columns show
 * the Markdown-first result in the public chat and in the owner workspace.
 */
export default function MarkdownFirstPreview() {
  return (
    <section className="border-t border-[#E4DCCF] pt-5">
      <header className="mb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#A5764F]">
          Markdown-first · before / after
        </p>
        <h2 className="mt-2 font-serif text-[21px] leading-snug text-[#211F1F]">
          Public chat and owner workspace
        </h2>
        <p className="mt-1 max-w-3xl font-serif text-[14px] leading-relaxed text-[#625B50]">
          Слева — прежнее поведение, когда каждый ответ автоматически раскладывался на
          presentation-блоки. В центре и справа — новый режим: исходный Markdown и его
          собственная типографика. Структурированные data views остаются ниже, в разделе
          analytics.
        </p>
      </header>

      <div className="space-y-10">
        {SCENARIOS.map((scenario) => {
          const before = buildPresentationResponseFromMarkdown(scenario.markdown);

          return (
            <div key={scenario.id} id={`markdown-first-${scenario.id}`}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h3 className="font-serif text-[17px] leading-snug text-[#211F1F]">
                  {scenario.label}
                </h3>
                <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-[#948A7D]">
                  {scenario.note}
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="min-w-0 border border-[#E4DCCF] bg-[#FCFAF6] p-4">
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#A49A8C]">
                    Before · auto-adapter
                  </p>
                  <PierrotResponseRenderer
                    response={before}
                    fallbackMarkdown={scenario.markdown}
                  />
                </div>

                <div className="min-w-0 border border-[#DED4C6] bg-white/70 p-4">
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#A5764F]">
                    After · public chat
                  </p>
                  <PierrotResponseRenderer fallbackMarkdown={scenario.markdown} />
                </div>

                <div className="min-w-0 border border-[#DED4C6] bg-white/70 p-4">
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#A5764F]">
                    After · owner workspace
                  </p>
                  <WorkspaceMarkdown
                    content={scenario.markdown}
                    className="max-w-[74ch] min-w-0 text-[17px] leading-[1.62] text-[#2F2B26] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:w-full"
                    editorial
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid gap-4 border-t border-[#E4DCCF] pt-5 lg:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#A5764F]">
            Streaming · unchanged
          </p>
          <div className="border border-[#DED4C6] bg-white/70 p-4">
            <PierrotMarkdown
              content={'## Ответ\n\nТекст приходит по мере стрима и остаётся обычным Markdown.'}
              streaming
            />
          </div>
        </div>
        <div className="min-w-0">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#A5764F]">
            Analytics · preserved
          </p>
          <p className="border border-[#DED4C6] bg-[#FCFAF6] p-4 font-serif text-[14px] leading-relaxed text-[#625B50]">
            Валидированные metric / chart / table / diagram payloads по-прежнему рендерятся
            структурно. Смотрите разделы 3–6 ниже: это серверные data views, а не обычный prose.
          </p>
        </div>
      </div>
    </section>
  );
}
