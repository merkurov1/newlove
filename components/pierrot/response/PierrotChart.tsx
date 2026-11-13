'use client';

import dynamic from 'next/dynamic';
import type { PierrotChartBlock } from '@/lib/pierrot/response/types';

const PierrotChartImpl = dynamic(() => import('./PierrotChartImpl'), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden="true"
      className="h-[clamp(190px,30vw,280px)] w-full animate-pulse border-y border-[#E7DFD4] bg-[#F7F3EC]/60"
    />
  ),
});

const DEFAULT_COLORS = ['#2F2B26', '#A5764F', '#7C8A73', '#8A1235', '#B08A5A'];

export default function PierrotChart({
  block,
  language = 'en',
}: {
  block: PierrotChartBlock;
  language?: 'ru' | 'en';
}) {
  return (
    <figure className="my-6 min-w-0">
      {block.title && (
        <figcaption className="mb-1 font-serif text-[17px] leading-snug text-[#211F1F]">
          {block.title}
        </figcaption>
      )}
      {block.description && (
        <p className="mb-3 max-w-2xl text-[14px] leading-relaxed text-[#7A7268]">
          {block.description}
        </p>
      )}
      {block.data.length === 0 ? (
        <p className="border-y border-[#E7DFD4] py-6 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#948A7D]">
          {language === 'ru' ? 'Нет данных для графика' : 'No data for this chart'}
        </p>
      ) : (
        <>
          {block.series.length > 1 && (
            <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1" aria-label="Legend">
              {block.series.map((series, index) => (
                <li
                  key={series.key}
                  className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#8A8175]"
                >
                  <span
                    aria-hidden="true"
                    className="h-[2px] w-3 shrink-0"
                    style={{
                      backgroundColor:
                        series.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
                    }}
                  />
                  {series.label}
                </li>
              ))}
            </ul>
          )}
          <div className="h-[clamp(190px,30vw,280px)] w-full min-w-0">
            <PierrotChartImpl block={block} />
          </div>
          {block.unit && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#948A7D]">
              {block.unit}
            </p>
          )}
        </>
      )}
    </figure>
  );
}
