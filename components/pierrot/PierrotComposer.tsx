'use client';

import React, { useEffect, useRef } from 'react';
import { ArrowUp } from 'lucide-react';
import { usePierrot } from '@/components/pierrot/PierrotContext';
import useIsTelegram from '@/components/useIsTelegram';

const COMPOSER_ID = 'pierrot-home-composer';

export default function PierrotComposer() {
  const {
    draft,
    isComposerOpen,
    expandThreshold,
    hasUnread,
    openChat,
    toggleComposer,
    updateDraft,
    sendMessage,
  } = usePierrot();
  const isTelegram = useIsTelegram();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasOpenRef = useRef(isComposerOpen);
  const safeBottom = 'max(1rem, env(safe-area-inset-bottom), var(--tg-safe-area-bottom, 0px))';

  useEffect(() => {
    if (isComposerOpen && !wasOpenRef.current) {
      const frame = window.requestAnimationFrame(() => {
        textareaRef.current?.focus({ preventScroll: true });
      });

      wasOpenRef.current = true;
      return () => window.cancelAnimationFrame(frame);
    }

    wasOpenRef.current = isComposerOpen;
  }, [isComposerOpen]);

  useEffect(() => {
    if (!isComposerOpen) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
  }, [draft, isComposerOpen]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;

    openChat();
    void sendMessage(text);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <>
      {!isComposerOpen && (
        <button
          type="button"
          onClick={toggleComposer}
          aria-label="Show Pierrot composer"
          aria-expanded={false}
          title="Ask Pierrot"
          style={{
            bottom: isTelegram ? `calc(${safeBottom} + 56px)` : safeBottom,
            right: 'max(1rem, env(safe-area-inset-right), var(--tg-safe-area-right, 0px))',
          }}
          className="
            fixed z-40 flex h-11 w-11 items-center justify-center
            rounded-full border border-[#E4DCCF] bg-[#F8F5EF]/95
            text-[#625B50] font-serif text-[17px] font-medium
            shadow-[0_4px_20px_rgba(75,62,45,0.10)] backdrop-blur-md
            transition-colors duration-200 hover:border-[#CFC3B1]
            hover:bg-white hover:text-[#3F3A33] active:scale-95
            focus:outline-none focus:ring-2 focus:ring-[#CFC3B1]
            focus:ring-offset-2
          "
        >
          P
          {hasUnread && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#8CA18A] ring-2 ring-[#FAF8F5]"
            />
          )}
        </button>
      )}

      {isComposerOpen && (
        <div
          style={{
            // The Telegram navigation is hidden while the composer is open, so
            // the form only needs the device safe area, not the extra 56px used
            // by the closed P button to clear that navigation.
            paddingBottom: safeBottom,
            paddingLeft: 'max(1rem, env(safe-area-inset-left), var(--tg-safe-area-left, 0px))',
            paddingRight: 'max(1rem, env(safe-area-inset-right), var(--tg-safe-area-right, 0px))',
          }}
          className="
            pointer-events-none fixed inset-x-0 bottom-0 z-40
          "
        >
          <form
            id={COMPOSER_ID}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            className="
              pointer-events-auto mx-auto flex w-full max-w-2xl
              items-end gap-2 rounded-2xl border border-[#E3DACD]
              bg-[#FAF8F5]/95 p-2 shadow-[0_12px_40px_rgba(75,62,45,0.12)]
              backdrop-blur-xl transition focus-within:border-[#B5AAA0]
              focus-within:bg-[#FAF8F5] sm:p-2.5
            "
          >
            <button
              type="button"
              onClick={toggleComposer}
              aria-label="Hide Pierrot composer"
              aria-expanded={true}
              aria-controls={COMPOSER_ID}
              className="
                flex h-9 w-9 shrink-0 items-center justify-center
                rounded-xl border border-transparent font-serif
                text-[16px] font-medium text-[#625B50] transition
                hover:border-[#E4DCCF] hover:bg-white
                focus:outline-none focus:ring-2 focus:ring-[#CFC3B1]
              "
            >
              P
            </button>

            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => updateDraft(event.target.value, event.target.selectionStart)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Ask Pierrot, or choose a section…"
              aria-label="Message Pierrot"
              aria-describedby="pierrot-composer-hint"
              className="
                max-h-[132px] min-h-[38px] min-w-0 flex-1 resize-none
                border-0 bg-transparent px-1 py-1.5 font-serif
                text-[16px] leading-relaxed text-[#37332D] outline-none
                placeholder:text-[#B8B0A4] focus:outline-none focus:ring-0
              "
            />

            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send message to Pierrot"
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

          <p id="pierrot-composer-hint" className="sr-only">
            Messages longer than {expandThreshold} characters open the full Pierrot conversation.
            Press Enter to send, Shift and Enter for a new line.
          </p>
        </div>
      )}
    </>
  );
}
