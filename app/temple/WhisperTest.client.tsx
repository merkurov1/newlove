"use client";

import React, { useState } from 'react';
import dynamic from 'next/dynamic';

// load MicrophoneInline from root components (already added)
const MicrophoneInline = dynamic(() => import('@/components/MicrophoneInline'), { ssr: false });

export default function WhisperTestClient() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="px-3 py-1 bg-white/6 rounded text-sm"
      >
        {open ? 'Закрыть тест' : 'Тестовая запись'}
      </button>
      {open ? (
        <div className="ml-3 w-[360px]">
          <MicrophoneInline />
        </div>
      ) : null}
    </div>
  );
}
