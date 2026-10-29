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

type PierrotTriggerProps = {
  compact?: boolean;
};

export function PierrotTrigger({ compact = false }: PierrotTriggerProps) {
  const { toggleConversation, isHomeMode, hasUnread } = usePierrot();
  const label = isHomeMode
    ? 'Exit Pierrot mode'
    : hasUnread
      ? 'Open Pierrot, new message'
      : 'Open Pierrot';

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleConversation}
        aria-label={label}
        aria-haspopup={isHomeMode ? undefined : 'dialog'}
        aria-pressed={isHomeMode}
        title={isHomeMode ? 'Back to Merkurov' : 'Pierrot'}
        className={`
          group relative flex h-10 w-10 shrink-0 items-center justify-center
          rounded-full border font-serif text-[17px] font-medium
          shadow-[0_2px_8px_rgba(75,62,45,0.04)]
          transition-colors duration-200 active:scale-95
          focus:outline-none focus:ring-2 focus:ring-[#CFC3B1]
          focus:ring-offset-2
          ${
            isHomeMode
              ? 'border-[#37332D] bg-[#37332D] text-white hover:bg-[#201D1A]'
              : 'border-[#E4DCCF] bg-[#F8F5EF] text-[#625B50] hover:border-[#CFC3B1] hover:bg-white hover:text-[#3F3A33]'
          }
        `}
      >
        <span className="transition-transform duration-200 group-hover:scale-110">P</span>
        {hasUnread && !isHomeMode && (
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
      aria-haspopup={isHomeMode ? undefined : 'dialog'}
      aria-pressed={isHomeMode}
      className={`
        group relative inline-flex items-center gap-2 rounded-full border
        px-3.5 py-1.5 font-mono text-[10px] uppercase
        tracking-[0.16em] transition-colors
        ${
          isHomeMode
            ? 'border-[#37332D] bg-[#37332D] text-white'
            : 'border-[#E4DCCF] bg-[#F8F5EF]/95 text-[#625B50] hover:border-[#CFC3B1] hover:bg-white'
        }
      `}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#8CA18A]" />
      <span>{isHomeMode ? 'Exit Pierrot' : 'Pierrot'}</span>
      {hasUnread && !isHomeMode && (
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
  const keyboardViewportHeight = useKeyboardViewportHeight(isOpen);

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

  const modalHeight = keyboardViewportHeight
    ? `${keyboardViewportHeight}px`
    : 'var(--tg-viewport-height, 100dvh)';
  const modalStyle = {
    height: modalHeight,
    maxHeight: modalHeight,
  };

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
                            onClick={() => clearChat()}
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

                  <PierrotMessageList className="flex-1" />

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
