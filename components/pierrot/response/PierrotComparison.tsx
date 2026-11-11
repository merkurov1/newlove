'use client';

import React from 'react';
import { formatBlockNumber } from './format';
import type { PierrotComparisonBlock } from '@/lib/pierrot/response/types';

function display(value: string | number | null): string {
  if (value === null) return '—';
  if (typeof value === 'number') return formatBlockNumber(value, 'en');
  return value;
}

export default function PierrotComparison({ block }: { block: PierrotComparisonBlock }) {
  const differs = new Map<string, boolean>();

  for (const row of block.rows) {
    const values = block.columns.map((column) => `${row.values[column.id] ?? ''}`);
    differs.set(row.label, new Set(values).size > 1);
  }

  return (
    <section
      className="my-6 min-w-0"
      aria-label={block.title || 'Comparison'}
    >
      {block.title && (
        <h3 className="font-serif text-[19px] font-normal leading-snug text-[#211F1F]">
          {block.title}
        </h3>
      )}
      {block.description && (
        <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-[#7A7268]">
          {block.description}
        </p>
      )}
      <div
        className="mt-4 grid gap-x-5 gap-y-6"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 205px), 1fr))' }}
      >
        {block.columns.map((column) => (
          <article key={column.id} className="min-w-0 border-t border-[#D9D0C3] pt-3">
            <header>
              <h4 className="font-serif text-[16px] font-normal leading-snug text-[#2F2B26]">
                {column.title}
              </h4>
              {column.subtitle && (
                <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-[#948A7D]">
                  {column.subtitle}
                </p>
              )}
            </header>
            <dl className="mt-3">
              {block.rows.map((row, index) => (
                <div
                  key={`${column.id}-${row.label}-${index}`}
                  className="border-b border-[#EEE8DE] py-2 last:border-b-0"
                >
                  <dt className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#948A7D]">
                    {row.label}
                  </dt>
                  <dd
                    className={`mt-0.5 font-serif text-[14.5px] leading-relaxed ${
                      differs.get(row.label) ? 'text-[#2F2B26]' : 'text-[#625B50]'
                    }`}
                  >
                    {display(row.values[column.id] ?? null)}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
