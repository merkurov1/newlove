'use client';

import { useState } from 'react';
import NewPostModal from '@/components/flow/NewPostModal';

export default function ComposerTrigger() {
  const [open, setOpen] = useState(false);

  function handleCreated() {
    window.dispatchEvent(
      new CustomEvent('flow:updated'),
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="
          group flex h-10 w-10 shrink-0 items-center justify-center
          rounded-full
          border border-stone-200/80
          bg-white/90
          text-stone-500
          shadow-[0_2px_10px_rgba(0,0,0,0.03)]
          transition-all duration-200
          hover:-translate-y-px
          hover:border-stone-400
          hover:bg-white
          hover:text-stone-900
          hover:shadow-[0_5px_18px_rgba(0,0,0,0.07)]
          active:translate-y-0
          active:scale-95
          focus:outline-none
          focus:ring-2
          focus:ring-stone-300/70
          focus:ring-offset-2
          focus:ring-offset-[#FAF8F5]
        "
        aria-label="Create"
        title="Create"
      >
        <span
          className="
            block
            font-serif
            text-[22px]
            font-light
            leading-none
            transition-transform
            duration-200
            group-hover:rotate-90
          "
          aria-hidden="true"
        >
          +
        </span>
      </button>

      {open && (
        <NewPostModal
          onClose={() => setOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}