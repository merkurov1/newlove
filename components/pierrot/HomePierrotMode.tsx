'use client';

import React from 'react';
import { PierrotInput, PierrotMessageList } from '@/components/pierrot/PierrotConversation';
import PierrotDataNotice from '@/components/pierrot/PierrotDataNotice';
import useKeyboardViewportHeight from '@/components/pierrot/useKeyboardViewportHeight';

export default function HomePierrotMode() {
  const keyboardViewportHeight = useKeyboardViewportHeight(true);
  const height = keyboardViewportHeight
    ? `${keyboardViewportHeight}px`
    : 'var(--tg-viewport-height, 100dvh)';

  return (
    <main
      style={{ height }}
      className="
        pierrot-inline-shell relative flex h-[100dvh] w-full flex-col overflow-hidden
        bg-[#FAF8F5] pt-24 text-[#111111] font-sans
        selection:bg-[#111111] selection:text-[#FAF8F5] antialiased
        sm:pt-28 md:pt-32
      "
    >
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' fill='white'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-20 mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
        <PierrotMessageList className="flex-1" />

        <div
          className="
            shrink-0 border-t border-zinc-200/70 px-5 pt-3 sm:px-7
            pb-[max(1rem,env(safe-area-inset-bottom),var(--tg-safe-area-bottom,0px))]
          "
        >
          <PierrotDataNotice className="mb-2 px-1" />
          <PierrotInput />
        </div>
      </div>
    </main>
  );
}
