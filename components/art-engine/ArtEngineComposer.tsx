'use client';

import React, { useEffect, useRef } from 'react';
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

const INLINE_MAX_HEIGHT = 168;

export default function ArtEngineComposer({
  value,
  onChange,
  onSubmit,
  status,
  processing,
  bottomOffset,
  embeddedInPierrot = false,
  inline = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  status: IngestionStatus | 'idle';
  processing: boolean;
  bottomOffset: number;
  embeddedInPierrot?: boolean;
  inline?: boolean;
}) {
  const label = STATUS_LABEL[status] || STATUS_LABEL.unknown;
  const dot = STATUS_DOT[status] || STATUS_DOT.unknown;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!inline) return;

    const input = textareaRef.current;
    if (!input) return;

    const nextHeight = Math.min(Math.max(input.scrollHeight, 44), INLINE_MAX_HEIGHT);
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > nextHeight ? 'auto' : 'hidden';
  }, [inline, value]);

  const submitIfReady = () => {
    if (!processing && value.trim()) onSubmit();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    if (inline && event.shiftKey) return;

    event.preventDefault();
    submitIfReady();
  };

  const submitButton = (
    <button
      type="submit"
      disabled={processing || !value.trim()}
      aria-label="Ingest auction lot"
      className={
        inline
          ? `
            flex h-10 w-10 shrink-0 items-center justify-center
            rounded-full bg-[#2B2723] text-[#FAF8F5] shadow-sm
            ring-1 ring-black/5 transition-all duration-200
            hover:bg-[#171411] hover:shadow-md
            active:scale-95 disabled:cursor-not-allowed disabled:opacity-25
            disabled:shadow-none focus:outline-none focus:ring-2
            focus:ring-[#B9AB98] focus:ring-offset-2
            sm:h-11 sm:w-11
          `
          : `
            flex h-9 w-9 shrink-0 items-center justify-center rounded-full
            bg-[#2B2723] text-[#FAF8F5] shadow-sm ring-1 ring-black/5
            transition hover:bg-[#171411] active:scale-95
            disabled:cursor-not-allowed disabled:opacity-35
          `
      }
    >
      <ArrowUp size={inline ? 18 : 17} strokeWidth={inline ? 2.2 : 2.4} />
    </button>
  );

  const statusRow = (
    <div
      className={
        inline
          ? 'mt-1.5 flex items-center justify-between gap-3 px-2 font-mono text-[8.5px] uppercase tracking-[0.12em] text-[#8A8175] sm:text-[9px]'
          : 'mt-1.5 flex items-center justify-between gap-3 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8A8175]'
      }
    >
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0">
        {inline ? 'Normal mode to exit' : <span className="hidden sm:inline">Enter to ingest</span>}
      </span>
    </div>
  );

  if (inline) {
    return (
      <div
        data-art-engine-composer
        data-art-engine-composer-inline
        className="shrink-0 bg-[#FAF8F5] px-4 pt-2.5 sm:px-7 sm:pt-4"
        style={{
          paddingBottom:
            'max(12px, env(safe-area-inset-bottom), var(--tg-safe-area-bottom, 0px))',
        }}
      >
        <div className="mx-auto w-full max-w-3xl">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
            className="
              flex min-w-0 items-end gap-1.5 rounded-[26px] border border-[#D8CBB8]
              bg-white p-1.5 shadow-[0_4px_20px_rgba(75,62,45,0.07)]
              transition-[border-color,box-shadow] duration-200
              focus-within:border-[#8C7B67]
              focus-within:shadow-[0_6px_26px_rgba(75,62,45,0.12)]
              hover:border-[#C8B9A4] sm:gap-2 sm:p-2
            "
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={handleKeyDown}
              readOnly={processing}
              aria-disabled={processing || undefined}
              aria-label="Art Engine input"
              placeholder="Paste a lot URL or write “normal mode”…"
              rows={1}
              spellCheck={false}
              autoComplete="off"
              className="
                min-h-[44px] min-w-0 flex-1 resize-none overflow-y-auto border-0
                bg-transparent px-3 py-2.5 font-serif text-[16px] leading-[1.5]
                text-[#37332D] outline-none placeholder:text-[#B8B0A4]
                focus:outline-none focus:ring-0 aria-disabled:opacity-60
                sm:px-4 sm:text-[17px]
              "
            />
            {submitButton}
          </form>
          {statusRow}
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        embeddedInPierrot
          ? 'pw-art-engine-composer pointer-events-none fixed z-30'
          : 'pointer-events-none fixed inset-x-0 z-30'
      }
      style={
        embeddedInPierrot
          ? ({ ['--ae-keyboard-offset' as string]: `${bottomOffset}px` } as React.CSSProperties)
          : { bottom: bottomOffset }
      }
      data-art-engine-composer
    >
      <div
        className={`pointer-events-none bg-gradient-to-t from-[#FAF8F5] via-[#FAF8F5]/95 to-transparent pb-[max(1rem,env(safe-area-inset-bottom))] pt-10 ${embeddedInPierrot ? 'pl-4 pr-4 sm:pl-6 sm:pr-6' : 'pl-4 pr-[max(4.75rem,env(safe-area-inset-right))] sm:pl-6 sm:pr-6'}`}
      >
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
              onKeyDown={handleKeyDown}
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

            {submitButton}
          </form>

          {statusRow}
        </div>
      </div>
    </div>
  );
}
