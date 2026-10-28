'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, ArrowUp, ArrowUpRight } from 'lucide-react';
import { usePierrot } from '@/components/pierrot/PierrotContext';
import type { PierrotChatAction, PierrotSectionId } from '@/lib/pierrot/navigation';

type PierrotTriggerProps = {
  compact?: boolean;
};

const HOME_CHAT_SECTIONS: Array<{ label: string; sectionId: PierrotSectionId }> = [
  { label: 'Art', sectionId: 'art' },
  { label: 'Selection', sectionId: 'selection' },
  { label: 'Advising', sectionId: 'advising' },
];

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setPrefersReducedMotion(mediaQuery.matches);

    sync();
    mediaQuery.addEventListener?.('change', sync);

    return () => mediaQuery.removeEventListener?.('change', sync);
  }, []);

  return prefersReducedMotion;
}

export function PierrotTrigger({ compact = false }: PierrotTriggerProps) {
  const { openChat } = usePierrot();

  if (compact) {
    return (
      <button
        type="button"
        onClick={openChat}
        aria-label="Open Pierrot"
        aria-haspopup="dialog"
        title="Pierrot"
        className="
          group flex h-10 w-10 shrink-0 items-center justify-center
          rounded-full border border-[#E4DCCF]
          bg-[#F8F5EF] text-[#625B50]
          font-serif text-[17px] font-medium
          shadow-[0_2px_8px_rgba(75,62,45,0.04)]
          transition-colors duration-200
          hover:border-[#CFC3B1] hover:bg-white hover:text-[#3F3A33]
          active:scale-95 focus:outline-none focus:ring-2
          focus:ring-[#CFC3B1] focus:ring-offset-2
        "
      >
        <span className="transition-transform duration-200 group-hover:scale-110">P</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openChat}
      aria-label="Open Pierrot"
      aria-haspopup="dialog"
      className="
        group inline-flex items-center gap-2 rounded-full
        border border-[#E4DCCF] bg-[#F8F5EF]/95
        px-3.5 py-1.5 font-mono text-[10px] uppercase
        tracking-[0.16em] text-[#625B50]
        transition-colors hover:border-[#CFC3B1] hover:bg-white
      "
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8CA18A]" />
      <span>Pierrot</span>
    </button>
  );
}

export default function PierrotChat() {
  const {
    messages,
    draft,
    draftCaret,
    isOpen,
    isLoading,
    isAdminSession,
    closeChat,
    updateDraft,
    sendMessage,
    clearChat,
    runAction,
    exploreSection,
  } = usePierrot();

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const caretRef = useRef<number | null>(null);
  const shouldReduceMotion = usePrefersReducedMotion();
  const [keyboardViewportHeight, setKeyboardViewportHeight] = useState<number | null>(null);

  caretRef.current = draftCaret;

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return;
    }

    const previous = previousFocusRef.current;
    previousFocusRef.current = null;

    if (!previous || !document.contains(previous)) return;

    const frame = window.requestAnimationFrame(() => {
      previous.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setKeyboardViewportHeight(null);
      return;
    }

    const viewport = window.visualViewport;

    if (!viewport) return;

    const sync = () => {
      // iPad Safari reports a visual viewport slightly shorter than the
      // layout viewport even when the keyboard is closed. Only shrink the
      // modal for a real keyboard-sized inset; otherwise keep 100dvh so the
      // modal never leaves a strip of backdrop at the bottom.
      const keyboardInset = window.innerHeight - viewport.height - viewport.offsetTop;

      setKeyboardViewportHeight(keyboardInset > 120 ? viewport.height : null);
    };

    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);

    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
    };
  }, [isOpen]);

  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.scrollTop = container.scrollHeight;
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const frame = window.requestAnimationFrame(scrollToBottom);
    return () => window.cancelAnimationFrame(frame);
  }, [messages, isLoading, isOpen, scrollToBottom]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeChat();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeChat, isOpen]);

  useEffect(() => {
    if (!isOpen || isLoading) return;

    const frame = window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;

      input.focus({ preventScroll: true });

      const position = Math.min(caretRef.current ?? input.value.length, input.value.length);
      input.setSelectionRange(position, position);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, isLoading]);

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const handleAction = (action: PierrotChatAction) => {
    void runAction(action);
  };

  const modalStyle = keyboardViewportHeight
    ? {
        height: `${keyboardViewportHeight}px`,
        maxHeight: `${keyboardViewportHeight}px`,
      }
    : undefined;

  return (
    <>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: shouldReduceMotion ? 0 : 0.16,
                }}
                className="
                  fixed inset-x-0 top-0 z-[9999] flex h-[100dvh] w-full
                  items-stretch justify-center bg-[#FAF8F4]
                "
                style={modalStyle}
                role="dialog"
                aria-modal="true"
                aria-label="Pierrot conversation"
                onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => {
                  if (event.target === event.currentTarget) {
                    closeChat();
                  }
                }}
              >
                <motion.section
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.16,
                  }}
                  className="
                    flex h-full max-h-full w-full flex-col overflow-hidden
                    bg-[#FAF8F4] text-[#37332D]
                    shadow-[0_24px_80px_rgba(36,33,29,0.14)]
                  "
                  onMouseDown={(event: React.MouseEvent<HTMLElement>) => event.stopPropagation()}
                >
                  <header className="shrink-0 border-b border-[#ECE6DC]/60">
                    <div className="flex w-full items-center justify-between px-3 py-3 sm:px-4 sm:py-4">
                      <div className="flex items-center gap-2.5">
                        <span className="h-2 w-2 rounded-full bg-[#8CA18A]" title="Online" />
                        <span className="font-serif text-[15px] font-medium text-[#37332D]">
                          Pierrot
                        </span>
                        {isAdminSession && (
                          <span
                            className="
                              rounded-full border border-[#E4DCCF]
                              bg-black/[0.03] px-2 py-0.5 font-mono
                              text-[9px] uppercase tracking-widest text-[#898277]
                            "
                          >
                            Master
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {messages.length > 0 && (
                          <button
                            type="button"
                            onClick={clearChat}
                            title="New chat"
                            aria-label="New chat"
                            className="
                              flex h-9 w-9 items-center justify-center
                              rounded-full text-[#898277] transition
                              hover:bg-black/[0.04] hover:text-[#37332D]
                            "
                          >
                            <RotateCcw size={15} />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={closeChat}
                          title="Close"
                          aria-label="Close Pierrot"
                          className="
                            flex h-9 w-9 shrink-0 items-center justify-center
                            rounded-full text-[#898277] transition
                            hover:bg-black/[0.04] hover:text-[#37332D]
                          "
                        >
                          <X size={18} strokeWidth={1.6} />
                        </button>
                      </div>
                    </div>
                  </header>

                  <div
                    ref={messagesContainerRef}
                    aria-live="polite"
                    className="
                      min-h-0 flex-1 overflow-y-auto overscroll-contain
                      px-5 py-5 sm:px-7 sm:py-6
                    "
                  >
                    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end">
                      {messages.length === 0 ? (
                        <div
                          className="
                            my-auto flex w-full flex-col items-center
                            justify-center px-2 py-10 text-center
                          "
                        >
                          <p
                            className="
                              max-w-lg font-serif text-sm italic
                              tracking-wide text-zinc-600 sm:text-lg
                            "
                          >
                            Structure is the antidote to chaos.
                          </p>

                          <h2
                            className="
                              mt-7 max-w-2xl break-words font-serif text-3xl
                              font-normal leading-[1.15] tracking-tight
                              text-[#111111] sm:text-5xl
                            "
                          >
                            Context Architecture <br className="hidden sm:inline" />
                            <span className="font-serif italic text-zinc-500">
                              &amp; Cultural Capital
                            </span>
                          </h2>

                          <nav
                            aria-label="Pierrot sections"
                            className="
                              mt-8 flex flex-wrap items-center justify-center
                              gap-3 px-2 font-mono text-xs uppercase
                              tracking-[0.2em] sm:gap-6 sm:text-sm
                            "
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
                      ) : (
                        <div className="space-y-6">
                          {messages.map((message) => (
                            <motion.article
                              key={message.id}
                              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                duration: shouldReduceMotion ? 0 : 0.16,
                              }}
                              className={`flex flex-col ${
                                message.role === 'user' ? 'items-end' : 'items-start'
                              }`}
                            >
                              {message.role === 'user' ? (
                                <div
                                  className="
                                    max-w-[88%] whitespace-pre-wrap
                                    break-words rounded-2xl rounded-br-sm
                                    bg-[#ECE5D9] px-4 py-2.5
                                    font-serif text-[15px] leading-[1.65]
                                    text-[#37332D] sm:max-w-[78%] sm:text-[16px]
                                  "
                                >
                                  {message.content}
                                </div>
                              ) : (
                                <div
                                  className="
                                    max-w-[96%] whitespace-pre-wrap
                                    break-words font-serif text-[16px]
                                    leading-[1.75] text-[#2F2B26] sm:text-[17px]
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
                                      onClick={closeChat}
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
                                <span
                                  className="
                                    mt-1 font-mono text-[9px]
                                    uppercase tracking-wider text-[#A49A8C]
                                  "
                                >
                                  via {message.provider}
                                </span>
                              )}
                            </motion.article>
                          ))}

                          {isLoading && (
                            <div
                              className="
                                flex items-center gap-2 text-xs
                                font-mono text-[#898277]
                              "
                            >
                              <span
                                className="
                                  inline-block h-2 w-2 animate-pulse
                                  rounded-full bg-[#8CA18A]
                                "
                              />
                              <span>Thinking…</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <footer
                    style={{
                      paddingBottom:
                        'max(12px, env(safe-area-inset-bottom), var(--tg-safe-area-bottom, 0px))',
                    }}
                    className="
                      shrink-0 border-t border-[#ECE6DC]/60
                      px-5 py-3 sm:px-7 sm:py-4
                    "
                  >
                    <div className="mx-auto w-full max-w-3xl">
                      <div
                        className="
                          flex items-end gap-2 rounded-2xl
                          border border-[#E3DACD] bg-white/70
                          p-2 transition focus-within:border-[#B5AAA0]
                          focus-within:bg-white sm:p-2.5
                        "
                      >
                        <textarea
                          ref={inputRef}
                          value={draft}
                          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                            updateDraft(event.target.value, event.target.selectionStart)
                          }
                          onKeyDown={handleInputKeyDown}
                          placeholder="Write to Pierrot…"
                          rows={1}
                          disabled={isLoading}
                          className="
                            max-h-36 min-h-[38px] min-w-0 flex-1
                            resize-none border-0 bg-transparent
                            px-2 py-1.5 font-serif text-[16px]
                            leading-relaxed text-[#37332D]
                            outline-none placeholder:text-[#B8B0A4]
                            focus:outline-none focus:ring-0
                            disabled:opacity-60
                          "
                        />

                        <button
                          type="button"
                          onClick={() => void sendMessage()}
                          disabled={!draft.trim() || isLoading}
                          aria-label="Send message"
                          className="
                            flex h-9 w-9 shrink-0 items-center
                            justify-center rounded-xl
                            bg-[#37332D] text-white
                            transition hover:bg-[#201D1A]
                            active:scale-95
                            disabled:cursor-not-allowed
                            disabled:opacity-20
                          "
                        >
                          <ArrowUp size={16} strokeWidth={2.2} />
                        </button>
                      </div>
                    </div>
                  </footer>
                </motion.section>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
