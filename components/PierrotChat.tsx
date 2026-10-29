'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw } from 'lucide-react';
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
  const { messages, isOpen, isAdminSession, closeChat, clearChat } = usePierrot();

  const previousFocusRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLElement | null>(null);
  const shouldReduceMotion = usePrefersReducedMotion();
  const keyboardViewport = useKeyboardViewportHeight(isOpen);

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

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault();
        last.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeChat, isOpen]);

  const modalHeight = keyboardViewport
    ? `${keyboardViewport.height}px`
    : 'var(--tg-viewport-height, 100dvh)';

  const modalStyle: React.CSSProperties = {
    height: modalHeight,
    maxHeight: modalHeight,
    ...(keyboardViewport ? { top: `${keyboardViewport.offsetTop}px` } : {}),
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
                  ref={modalRef}
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
                  <header
                    className="shrink-0 border-b border-[#ECE6DC]/60"
                    style={{
                      paddingTop:
                        'max(12px, env(safe-area-inset-top), var(--tg-safe-area-top, 0px))',
                    }}
                  >
                    <div
                      className="flex w-full items-center justify-between gap-3 px-3 pb-3 sm:px-4 sm:pb-4"
                      style={{
                        paddingLeft:
                          'max(12px, env(safe-area-inset-left), var(--tg-safe-area-left, 0px))',
                        paddingRight:
                          'max(12px, env(safe-area-inset-right), var(--tg-safe-area-right, 0px))',
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#37332D] font-serif text-[15px] font-medium text-white shadow-sm">
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

                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate font-serif text-[15px] font-medium text-[#37332D]">
                              Pierrot
                            </p>

                            {isAdminSession && (
                              <span
                                className="
                                  shrink-0 rounded-full border border-[#E4DCCF]
                                  bg-black/[0.03] px-2 py-0.5 font-mono
                                  text-[9px] uppercase tracking-widest text-[#898277]
                                "
                              >
                                Master
                              </span>
                            )}
                          </div>

                          <p className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-[#A49A8C]">
                            Digital shadow &amp; advisor
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {messages.length > 0 && (
                          <button
                            type="button"
                            onClick={() => clearChat()}
                            title="New chat"
                            aria-label="New chat"
                            className="
                              flex h-10 w-10 items-center justify-center
                              rounded-full text-[#898277] transition
                              hover:bg-black/[0.04] hover:text-[#37332D]
                              focus:outline-none focus:ring-2 focus:ring-[#CFC3B1]
                            "
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={closeChat}
                          title="Close"
                          aria-label="Close Pierrot"
                          className="
                            flex h-10 w-10 shrink-0 items-center justify-center
                            rounded-full text-[#898277] transition
                            hover:bg-black/[0.04] hover:text-[#37332D]
                            focus:outline-none focus:ring-2 focus:ring-[#CFC3B1]
                          "
                        >
                          <X size={19} strokeWidth={1.6} />
                        </button>
                      </div>
                    </div>
                  </header>

                  <PierrotMessageList className="flex-1" />

                  <footer
                    style={{
                      paddingBottom:
                        'max(12px, env(safe-area-inset-bottom), var(--tg-safe-area-bottom, 0px))',
                      paddingLeft:
                        'max(20px, env(safe-area-inset-left), var(--tg-safe-area-left, 0px))',
                      paddingRight:
                        'max(20px, env(safe-area-inset-right), var(--tg-safe-area-right, 0px))',
                    }}
                    className="
                      shrink-0 border-t border-[#ECE6DC]/60
                      px-5 py-3 sm:px-7 sm:py-4
                    "
                  >
                    <div className="mx-auto w-full max-w-3xl">
                      <PierrotDataNotice className="mb-2 px-1" />
                      <PierrotInput />
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
