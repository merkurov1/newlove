'use client';

import React from 'react';
import { ArrowUp, Link2 } from 'lucide-react';
import type { IngestionStatus } from './types';

const STATUS_LABEL: Record<string, string> = {
  idle: 'Ready for a URL',
  queued: 'Queued',
  extracting: 'Extracting',
  ready: 'Ready',
  partial: 'Partial extraction',
  failed: 'Failed',
  unknown: 'Unknown',
};

const STATUS_DOT: Record<string, string> = {
  idle: 'bg-[#B9AB98]',
  queued: 'bg-[#B08A5A]',
  extracting: 'bg-[#B08A5A] animate-pulse',
  ready: 'bg-[#8CA18A]',
  partial: 'bg-[#C08A3E]',
  failed: 'bg-[#B85C50]',
  unknown: 'bg-[#B9AB98]',
};

export default function ArtEngineComposer({
  value,
  onChange,
  onSubmit,
  status,
  processing,
  bottomOffset,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  status: IngestionStatus | 'idle';
  processing: boolean;
  bottomOffset: number;
}) {
  const label = STATUS_LABEL[status] || STATUS_LABEL.unknown;
  const dot = STATUS_DOT[status] || STATUS_DOT.unknown;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30"
      style={{ bottom: bottomOffset }}
      data-art-engine-composer
    >
      <div className="pointer-events-none bg-gradient-to-t from-[#FAF8F5] via-[#FAF8F5]/95 to-transparent pb-[max(1rem,env(safe-area-inset-bottom))] pl-4 pr-[max(4.75rem,env(safe-area-inset-right))] pt-10 sm:pl-6 sm:pr-6">
        <div className="pointer-events-auto mx-auto w-full max-w-4xl">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
            className="
              flex items-center gap-2 rounded-[22px] border border-[#CFC1AF]
              bg-white/90 p-2 shadow-[0_8px_30px_rgba(75,62,45,0.10)]
              backdrop-blur-md transition focus-within:border-[#A99B89]
              focus-within:bg-white focus-within:shadow-[0_10px_38px_rgba(75,62,45,0.14)]
              sm:p-2.5
            "
          >
            <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E4DCCF] bg-[#F8F5EF] text-[#8A8175] sm:flex">
              <Link2 size={15} strokeWidth={1.8} />
            </span>

            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (!processing && value.trim()) onSubmit();
                }
              }}
              readOnly={processing}
              aria-disabled={processing || undefined}
              aria-label="Auction lot URL"
              placeholder="Paste lot URL…"
              className="
                min-h-[38px] min-w-0 flex-1 resize-none border-0 bg-transparent
                px-1 py-1.5 font-serif text-[16px] leading-relaxed text-[#37332D]
                outline-none placeholder:text-[#B8B0A4] aria-disabled:opacity-60
              "
            />

            <button
              type="submit"
              disabled={processing || !value.trim()}
              aria-label="Ingest auction lot"
              className="
                flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                bg-[#2B2723] text-[#FAF8F5] shadow-sm ring-1 ring-black/5
                transition hover:bg-[#171411] active:scale-95
                disabled:cursor-not-allowed disabled:opacity-35
              "
            >
              <ArrowUp size={17} strokeWidth={2.4} />
            </button>
          </form>

          <div className="mt-1.5 flex items-center justify-between gap-3 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8A8175]">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
              <span className="truncate">{label}</span>
            </span>
            <span className="hidden shrink-0 sm:inline">Enter to ingest</span>
          </div>
        </div>
      </div>
    </div>
  );
}
