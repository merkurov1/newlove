'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowUpRight } from 'lucide-react';
import { usePierrot } from '@/components/pierrot/PierrotContext';
import usePrefersReducedMotion from '@/components/pierrot/usePrefersReducedMotion';
import type { PierrotChatAction, PierrotSectionId } from '@/lib/pierrot/navigation';

const HOME_CHAT_SECTIONS: Array<{ label: string; sectionId: PierrotSectionId }> = [
  { label: 'Art', sectionId: 'art' },
  { label: 'Selection', sectionId: 'selection' },
  { label: 'Advising', sectionId: 'advising' },
];

function PierrotEmptyState() {
  const { exploreSection } = usePierrot();

  return (
    <div className="my-auto flex w-full flex-col items-center justify-center px-2 py-10 text-center">
      <p className="max-w-lg font-serif text-sm italic tracking-wide text-zinc-600 sm:text-lg">
        Structure is the antidote to chaos.
      </p>

      <h2 className="mt-7 max-w-2xl break-words font-serif text-3xl font-normal leading-[1.15] tracking-tight text-[#111111] sm:text-5xl">
        Context Architecture <br className="hidden sm:inline" />
        <span className="font-serif italic text-zinc-500">&amp; Cultural Capital</span>
      </h2>

      <nav
        aria-label="Pierrot sections"
        className="mt-8 flex flex-wrap items-center justify-center gap-3 px-2 font-mono text-xs uppercase tracking-[0.2em] sm:gap-6 sm:text-sm"
      >
        {HOME_CHAT_SECTIONS.map((section) => (
          <button
            key={section.sectionId}
            type="button"
            onClick={() => exploreSection(section.sectionId)}
            className="
              inline-flex items-center py-2 text-[#111111]
              underline decoration-zinc-300 underline-offset-8
              transition-colors hover:text-zinc-600
              hover:decoration-black
            "
          >
            {section.label}
          </button>
        ))}
      </nav>

      <div className="mt-7 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => exploreSection('lobby')}
          className="
            group inline-flex items-center gap-3 rounded-full
            border border-zinc-900/20 bg-white/80 px-7 py-3
            text-[#111111] shadow-sm backdrop-blur-sm
            transition-all duration-300 hover:bg-[#111111]
            hover:text-[#FAF8F5]
          "
        >
          <span className="px-1 font-serif text-base font-normal italic tracking-wide">
            Enter The Lobby
          </span>
          <ArrowUpRight
            size={18}
            className="text-zinc-600 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#FAF8F5]"
          />
        </button>

        <button
          type="button"
          onClick={() => exploreSection('journal')}
          className="
            group inline-flex items-center gap-3 rounded-full
            border border-zinc-900/20 bg-white/80 px-7 py-3
            text-[#111111] shadow-sm backdrop-blur-sm
            transition-all duration-300 hover:bg-[#111111]
            hover:text-[#FAF8F5]
          "
        >
          <span className="px-1 font-serif text-base font-normal italic tracking-wide">
            Journal
          </span>
          <ArrowUpRight
            size={18}
            className="text-zinc-600 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#FAF8F5]"
          />
        </button>
      </div>
    </div>
  );
}

export function PierrotMessageList({ className = '' }: { className?: string }) {
  const { messages, isLoading, runAction, closeConversation } = usePierrot();
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = usePrefersReducedMotion();

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    container.scrollTop = container.scrollHeight;
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(scrollToBottom);
    return () => window.cancelAnimationFrame(frame);
  }, [messages, isLoading, scrollToBottom]);

  const handleAction = (action: PierrotChatAction) => {
    void runAction(action);
  };

  return (
    <div
      ref={containerRef}
      aria-live="polite"
      className={`
        min-h-0 overflow-y-auto overscroll-contain
        px-5 py-5 sm:px-7 sm:py-6
        ${className}
      `}
    >
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end">
        {messages.length === 0 ? (
          <PierrotEmptyState />
        ) : (
          <div className="space-y-6">
            {messages.map((message) => (
              <motion.article
                key={message.id}
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.16 }}
                className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                {message.role === 'user' ? (
                  <div
                    className="
                      max-w-[88%] whitespace-pre-wrap break-words
                      rounded-2xl rounded-br-sm bg-[#ECE5D9] px-4 py-2.5
                      font-serif text-[15px] leading-[1.65] text-[#37332D]
                      sm:max-w-[78%] sm:text-[16px]
                    "
                  >
                    {message.content}
                  </div>
                ) : (
                  <div
                    className="
                      max-w-[96%] whitespace-pre-wrap break-words
                      font-serif text-[16px] leading-[1.75]
                      text-[#2F2B26] sm:text-[17px]
                    "
                  >
                    {message.content}
                  </div>
                )}

                {message.actions && message.actions.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {message.actions.map((action) => (
                      <button
                        key={`${action.kind}-${action.label}`}
                        type="button"
                        onClick={() => handleAction(action)}
                        disabled={isLoading && action.kind === 'prompt'}
                        className={
                          action.kind === 'navigate'
                            ? `
                              inline-flex items-center rounded-full
                              bg-[#37332D] px-4 py-2 font-mono
                              text-[10px] uppercase tracking-[0.16em]
                              text-white transition hover:bg-[#201D1A]
                              disabled:opacity-40
                            `
                            : `
                              inline-flex items-center rounded-full
                              border border-[#DDD3C5] px-4 py-2
                              font-mono text-[10px] uppercase
                              tracking-[0.16em] text-[#625B50]
                              transition hover:border-[#B5AAA0]
                              hover:text-[#37332D]
                              disabled:opacity-40
                            `
                        }
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}

                {message.links && message.links.length > 0 && (
                  <nav
                    aria-label="Pierrot navigation"
                    className="mt-3 flex flex-wrap items-center gap-2"
                  >
                    {message.links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={closeConversation}
                        className="
                          inline-flex items-center rounded-full
                          border border-[#DDD3C5] px-4 py-2
                          font-mono text-[10px] uppercase
                          tracking-[0.16em] text-[#625B50]
                          transition hover:border-[#B5AAA0]
                          hover:text-[#37332D]
                        "
                      >
                        {link.label}
                      </Link>
                    ))}
                  </nav>
                )}

                {message.provider && (
                  <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-[#A49A8C]">
                    via {message.provider}
                  </span>
                )}
              </motion.article>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-xs font-mono text-[#898277]">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#8CA18A]" />
                <span>Thinking…</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function PierrotInput({
  placeholder = 'Write to Pierrot…',
  className = '',
}: {
  placeholder?: string;
  className?: string;
}) {
  const { draft, draftCaret, isLoading, updateDraft, sendMessage } = usePierrot();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<number | null>(null);

  caretRef.current = draftCaret;

  useEffect(() => {
    if (isLoading) return;

    const frame = window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;

      input.focus({ preventScroll: true });

      const position = Math.min(caretRef.current ?? input.value.length, input.value.length);
      input.setSelectionRange(position, position);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isLoading]);

  const submit = () => {
    if (!draft.trim() || isLoading) return;
    void sendMessage();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className={`
        flex items-end gap-2 rounded-2xl border border-[#E3DACD]
        bg-white/70 p-2 transition focus-within:border-[#B5AAA0]
        focus-within:bg-white sm:p-2.5
        ${className}
      `}
    >
      <textarea
        ref={inputRef}
        value={draft}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
          updateDraft(event.target.value, event.target.selectionStart)
        }
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        disabled={isLoading}
        aria-label="Message Pierrot"
        className="
          max-h-36 min-h-[38px] min-w-0 flex-1 resize-none
          border-0 bg-transparent px-2 py-1.5 font-serif
          text-[16px] leading-relaxed text-[#37332D] outline-none
          placeholder:text-[#B8B0A4] focus:outline-none focus:ring-0
          disabled:opacity-60
        "
      />

      <button
        type="submit"
        disabled={!draft.trim() || isLoading}
        aria-label="Send message"
        className="
          flex h-9 w-9 shrink-0 items-center justify-center
          rounded-xl bg-[#37332D] text-white transition
          hover:bg-[#201D1A] active:scale-95
          disabled:cursor-not-allowed disabled:opacity-20
        "
      >
        <ArrowUp size={16} strokeWidth={2.2} />
      </button>
    </form>
  );
}
