'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, BookOpen } from 'lucide-react';
import { usePierrot } from '@/components/pierrot/PierrotContext';
import { PierrotInput, PierrotMessageList } from '@/components/pierrot/PierrotConversation';
import PierrotDataNotice from '@/components/pierrot/PierrotDataNotice';
import usePrefersReducedMotion from '@/components/pierrot/usePrefersReducedMotion';
import useKeyboardViewportHeight from '@/components/pierrot/useKeyboardViewportHeight';
import { PIERROT_AVATAR_SRC } from '@/lib/pierrot/config';

type PierrotTriggerProps = {
  compact?: boolean;
};

export function PierrotTrigger({ compact = false }: PierrotTriggerProps) {
  const { toggleConversation, hasUnread } = usePierrot();
  const label = hasUnread ? 'Open Pierrot, new message' : 'Open Pierrot';

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleConversation}
        aria-label={label}
        aria-haspopup="dialog"
        title="Pierrot"
        className="
          group relative flex h-10 w-10 shrink-0 items-center justify-center
          rounded-full border border-[#E4DCCF] bg-[#F8F5EF] font-serif
          text-[17px] font-medium text-[#625B50]
          shadow-[0_2px_8px_rgba(75,62,45,0.04)]
          transition-colors duration-200 hover:border-[#CFC3B1]
          hover:bg-white hover:text-[#3F3A33] active:scale-95
          focus:outline-none focus:ring-2 focus:ring-[#CFC3B1]
          focus:ring-offset-2
        "
      >
        <span className="transition-transform duration-200 group-hover:scale-110">P</span>
        {hasUnread && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#8CA18A] ring-2 ring-[#FAF8F5]"
          />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleConversation}
      aria-label={label}
      aria-haspopup="dialog"
      className="
        group relative inline-flex items-center gap-2 rounded-full border
        border-[#E4DCCF] bg-[#F8F5EF]/95 px-3.5 py-1.5 font-mono
        text-[10px] uppercase tracking-[0.16em] text-[#625B50]
        transition-colors hover:border-[#CFC3B1] hover:bg-white
      "
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#8CA18A]" />
      <span>Pierrot</span>
      {hasUnread && (
        <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[#B08A5A]" aria-hidden="true" />
      )}
    </button>
  );
}

export default function PierrotChat() {
  const {
    messages,
    isOpen,
    closeChat,
    clearChat,
    isUnframedMode,
    canUseUnframedMode,
    toggleUnframedMode,
  } = usePierrot();

  const previousFocusRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLElement | null>(null);
  const shouldReduceMotion = usePrefersReducedMotion();
  const keyboardViewport = useKeyboardViewportHeight(isOpen);

  useEffect(() => {
    if (!isOpen) return;

    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;

    // Lock both scroll containers. Locking only <body> still lets iOS pan the
    // document behind the fixed modal in some Safari versions.
    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    return () => {
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      const previous = previousFocusRef.current;
      previousFocusRef.current = null;

      if (!previous || !document.contains(previous)) return;

      const frame = window.requestAnimationFrame(() => {
        previous.focus({ preventScroll: true });
      });

      return () => window.cancelAnimationFrame(frame);
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const frame = window.requestAnimationFrame(() => {
      const modal = modalRef.current;
      if (!modal) return;

      // Desktop keeps the previous convenience of landing in the composer.
      // Touch devices focus the dialog itself so opening the window does not
      // summon the software keyboard before the user asks for it.
      const finePointer =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(hover: hover) and (pointer: fine)').matches;

      if (finePointer) {
        const input = modal.querySelector<HTMLTextAreaElement>('[data-pierrot-input]');
        if (input) {
          input.focus({ preventScroll: true });
          return;
        }
      }

      modal.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeChat();
        return;
      }

      if (event.key !== 'Tab') return;

      const root = modalRef.current;
      if (!root) return;

      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!event.shiftKey && (active === last || active === root || !root.contains(active))) {
        event.preventDefault();
        first.focus();
      } else if (
        event.shiftKey &&
        (active === first || active === root || !root.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeChat, isOpen]);

  const safeLeft = 'max(0px, env(safe-area-inset-left), var(--tg-safe-area-left, 0px))';
  const safeRight = 'max(0px, env(safe-area-inset-right), var(--tg-safe-area-right, 0px))';

  // One geometry model for the shell: the visual viewport rectangle when it is
  // available, otherwise the CSS viewport with dynamic-viewport units. The
  // custom property lets the composer cap its growth against the same height.
  const modalStyle: React.CSSProperties = keyboardViewport
    ? {
        top: `${keyboardViewport.offsetTop}px`,
        left: `${keyboardViewport.offsetLeft}px`,
        width: `${keyboardViewport.width}px`,
        height: `${keyboardViewport.height}px`,
        maxWidth: `${keyboardViewport.width}px`,
        maxHeight: `${keyboardViewport.height}px`,
        paddingLeft: safeLeft,
        paddingRight: safeRight,
        ['--pierrot-viewport-height' as string]: `${keyboardViewport.height}px`,
      }
    : {
        top: 0,
        left: 0,
        width: '100%',
        height: 'var(--tg-viewport-height, 100dvh)',
        maxHeight: 'var(--tg-viewport-height, 100dvh)',
        paddingLeft: safeLeft,
        paddingRight: safeRight,
        ['--pierrot-viewport-height' as string]: '100dvh',
      };

  return (
    <>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: shouldReduceMotion ? 1 : 0 }}
                transition={{
                  duration: shouldReduceMotion ? 0 : 0.16,
                }}
                data-pierrot-modal
                className="
                  fixed z-[9999] box-border flex items-stretch justify-center
                  overflow-hidden overscroll-none bg-[#FAF8F5]
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
                  ref={modalRef}
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.16,
                  }}
                  tabIndex={-1}
                  className="
                    flex h-full min-h-0 max-h-full w-full min-w-0 flex-col
                    overflow-hidden bg-[#FAF8F5] text-[#37332D] outline-none
                    shadow-[0_24px_80px_rgba(36,33,29,0.14)]
                  "
                  onMouseDown={(event: React.MouseEvent<HTMLElement>) => event.stopPropagation()}
                >
                  <header
                    data-pierrot-header
                    className="shrink-0 bg-transparent"
                    style={{
                      paddingTop:
                        'max(0px, env(safe-area-inset-top), var(--tg-safe-area-top, 0px))',
                    }}
                  >
                    <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between gap-2 px-4 py-4 sm:gap-4 sm:px-6 sm:py-6 lg:px-10">
                      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-900 font-serif text-xs font-medium text-white shadow-md ring-2 ring-white/90 sm:h-11 sm:w-11 sm:text-sm">
                          {PIERROT_AVATAR_SRC ? (
                            <img
                              src={PIERROT_AVATAR_SRC}
                              alt="Pierrot"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            'P'
                          )}
                        </span>

                        <div className="min-w-0 flex-1 sm:flex-none">
                          <div
                            className="
                              flex w-full items-center justify-between gap-2.5
                              truncate rounded-2xl border border-stone-200/90
                              bg-white/90 px-3.5 py-2 font-sans text-sm font-bold
                              uppercase tracking-[0.15em] text-stone-900 shadow-sm
                              backdrop-blur-md sm:w-auto sm:px-5 sm:py-2.5
                              sm:text-base sm:tracking-[0.2em]
                            "
                          >
                            <span className="truncate">Pierrot</span>
                            <span
                              aria-hidden="true"
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#8CA18A]"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                        {canUseUnframedMode && (
                          <button
                            type="button"
                            onClick={toggleUnframedMode}
                            aria-pressed={isUnframedMode}
                            title="Private UNFRAMED manuscript mode"
                            aria-label="Toggle UNFRAMED manuscript mode"
                            className={`
                              flex h-10 items-center gap-1.5 rounded-full border px-3
                              font-mono text-[9px] uppercase tracking-[0.16em]
                              shadow-[0_2px_8px_rgba(75,62,45,0.04)]
                              transition focus:outline-none focus:ring-2
                              focus:ring-[#CFC3B1] focus:ring-offset-2 sm:px-4 sm:text-[10px]
                              ${
                                isUnframedMode
                                  ? 'border-[#37332D] bg-[#37332D] text-white'
                                  : 'border-[#E4DCCF] bg-[#F8F5EF] text-[#625B50] hover:border-[#CFC3B1] hover:bg-white hover:text-[#3F3A33]'
                              }
                            `}
                          >
                            <BookOpen size={14} strokeWidth={1.7} />
                            <span className="hidden sm:inline">UNFRAMED</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => clearChat()}
                          disabled={messages.length === 0}
                          title="New chat"
                          aria-label="New chat"
                          className="
                            flex h-10 w-10 items-center justify-center
                            rounded-full border border-[#E4DCCF] bg-[#F8F5EF]
                            text-[#625B50] shadow-[0_2px_8px_rgba(75,62,45,0.04)]
                            transition hover:border-[#CFC3B1] hover:bg-white
                            hover:text-[#3F3A33] focus:outline-none focus:ring-2
                            focus:ring-[#CFC3B1] focus:ring-offset-2
                            disabled:cursor-not-allowed disabled:opacity-30
                          "
                        >
                          <RotateCcw size={17} />
                        </button>

                        <button
                          type="button"
                          onClick={closeChat}
                          title="Close"
                          aria-label="Close Pierrot"
                          className="
                            flex h-10 w-10 shrink-0 items-center justify-center
                            rounded-full border border-[#E4DCCF] bg-[#F8F5EF]
                            text-[#625B50] shadow-[0_2px_8px_rgba(75,62,45,0.04)]
                            transition hover:border-[#CFC3B1] hover:bg-white
                            hover:text-[#3F3A33] focus:outline-none focus:ring-2
                            focus:ring-[#CFC3B1] focus:ring-offset-2
                          "
                        >
                          <X size={19} strokeWidth={1.6} />
                        </button>
                      </div>
                    </div>
                  </header>

                  <PierrotMessageList className="min-h-0 flex-1" />

                  <footer
                    data-pierrot-footer
                    style={{
                      paddingBottom:
                        'max(12px, env(safe-area-inset-bottom), var(--tg-safe-area-bottom, 0px))',
                    }}
                    className="
                      shrink-0 border-t border-[#ECE6DC]/60
                      px-5 pt-3 sm:px-7 sm:pt-4
                    "
                  >
                    <div className="mx-auto w-full max-w-3xl">
                      {isUnframedMode && (
                        <div className="mb-2 flex items-center gap-2 px-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8A8175]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#8CA18A]" />
                          <span>Private manuscript mode · answers use UNFRAMED evidence</span>
                        </div>
                      )}
                      <PierrotDataNotice className="mb-2 px-1" />
                      <PierrotInput
                        placeholder={isUnframedMode ? 'Ask UNFRAMED…' : 'Write to Pierrot…'}
                      />
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
