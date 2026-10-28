'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw } from 'lucide-react';
import { usePierrot } from '@/components/pierrot/PierrotContext';
import { PierrotInput, PierrotMessageList } from '@/components/pierrot/PierrotConversation';
import usePrefersReducedMotion from '@/components/pierrot/usePrefersReducedMotion';
import useKeyboardViewportHeight from '@/components/pierrot/useKeyboardViewportHeight';

type PierrotTriggerProps = {
  compact?: boolean;
};

export function PierrotTrigger({ compact = false }: PierrotTriggerProps) {
  const { toggleConversation, isHomeMode } = usePierrot();
  const label = isHomeMode ? 'Exit Pierrot mode' : 'Open Pierrot';

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
          group flex h-10 w-10 shrink-0 items-center justify-center
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
        group inline-flex items-center gap-2 rounded-full border
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
    </button>
  );
}

export default function PierrotChat() {
  const { messages, isOpen, isAdminSession, closeChat, clearChat } = usePierrot();

  const previousFocusRef = useRef<HTMLElement | null>(null);
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
      if (event.key === 'Escape') closeChat();
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
