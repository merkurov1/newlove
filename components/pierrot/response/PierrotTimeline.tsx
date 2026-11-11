'use client';

import React from 'react';
import { safeMarkdownUrl } from '@/components/pierrot/PierrotMarkdown';
import { formatBlockDate } from './format';
import type { PierrotTimelineBlock } from '@/lib/pierrot/response/types';

export default function PierrotTimeline({ block }: { block: PierrotTimelineBlock }) {
  return (
    <section className="my-6 min-w-0" aria-label={block.title || 'Timeline'}>
      {block.title && (
        <h3 className="font-serif text-[18px] font-normal leading-snug text-[#211F1F]">
          {block.title}
        </h3>
      )}
      {block.description && (
        <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-[#7A7268]">
          {block.description}
        </p>
      )}
      <ol className="mt-4 border-l border-[#DED4C6] pl-5">
        {block.events.map((event, index) => {
          const href = event.url ? safeMarkdownUrl(event.url) : null;

          return (
            <li key={`${event.date}-${event.title}-${index}`} className="relative pb-5 last:pb-0">
              <span
                aria-hidden="true"
                className="absolute -left-[1.42rem] top-[0.52rem] h-1.5 w-1.5 rounded-full bg-[#A5764F] ring-4 ring-[#FBF8F2]"
              />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <time
                  dateTime={event.date}
                  className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#948A7D]"
                >
                  {formatBlockDate(event.date)}
                </time>
                {event.category && (
                  <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#A5764F]">
                    {event.category}
                  </span>
                )}
                {event.status && (
                  <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#7C8A73]">
                    {event.status}
                  </span>
                )}
              </div>
              <p className="mt-0.5 font-serif text-[15.5px] leading-snug text-[#2F2B26]">
                {event.title}
              </p>
              {event.description && (
                <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#625B50]">
                  {event.description}
                </p>
              )}
              {event.source && (
                <p className="mt-1 font-mono text-[8.5px] leading-relaxed tracking-[0.04em] text-[#948A7D]">
                  {href ? (
                    <a
                      href={href}
                      target={href.startsWith('http') ? '_blank' : undefined}
                      rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                      className="underline decoration-[#C9BBA8] underline-offset-2 hover:text-[#2F2B26]"
                    >
                      {event.source}
                    </a>
                  ) : (
                    event.source
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
