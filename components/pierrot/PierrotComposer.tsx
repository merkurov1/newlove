'use client';

import React from 'react';
import { usePierrot } from '@/components/pierrot/PierrotContext';
import useIsTelegram from '@/components/useIsTelegram';

/**
 * Prominent home-page entry point for the one Pierrot conversation window.
 * The compact composer was retired so every P control opens the same window.
 */
export default function PierrotComposer() {
  const { isOpen, hasUnread, openChat } = usePierrot();
  const isTelegram = useIsTelegram();

  const safeBottom = 'max(1rem, env(safe-area-inset-bottom), var(--tg-safe-area-bottom, 0px))';

  if (isOpen) return null;

  return (
    <button
      type="button"
      onClick={openChat}
      aria-label="Open Pierrot conversation"
      aria-haspopup="dialog"
      title="Ask Pierrot"
      style={{
        bottom: isTelegram ? `calc(${safeBottom} + 56px)` : safeBottom,
        right: 'max(1rem, env(safe-area-inset-right), var(--tg-safe-area-right, 0px))',
      }}
      className="
        fixed z-40 flex h-11 w-11 items-center justify-center
        rounded-full border border-[#D3C5B2] bg-[#F4EFE7]/95
        font-serif text-[17px] font-semibold text-[#4A443D]
        shadow-[0_4px_20px_rgba(75,62,45,0.13)] backdrop-blur-md
        transition-colors duration-200 hover:border-[#B9AB98]
        hover:bg-white hover:text-[#2F2B26] active:scale-95
        focus:outline-none focus:ring-2 focus:ring-[#B9AB98]
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
  );
}
