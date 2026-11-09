'use client';

import { useState } from 'react';
import NewPostModal from '@/components/flow/NewPostModal';

export default function ComposerTrigger() {
  const [open, setOpen] = useState(false);

  function handleCreated() {
    window.dispatchEvent(new CustomEvent('flow:updated'));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Create Flow post"
        title="Create a Flow post"
        className="
          site-header-surface group inline-flex h-10 shrink-0
          items-center justify-center gap-2
          rounded-full border border-stone-300/60
          bg-transparent px-4
          font-mono text-[10px] uppercase
          tracking-[0.16em] text-stone-700
          transition-all duration-200
          hover:-translate-y-px
          hover:border-stone-500 hover:bg-stone-900/5
          hover:text-stone-950
          active:scale-95
          focus:outline-none focus:ring-2
          focus:ring-stone-300/70
          focus:ring-offset-2 focus:ring-offset-transparent
        "
      >
        <span>FLOW</span>

        <span
          aria-hidden="true"
          className="
            font-serif text-[17px] font-light
            leading-none transition-transform
            duration-200 group-hover:rotate-90
          "
        >
          +
        </span>
      </button>

      {open && (
        <NewPostModal open={open} onClose={() => setOpen(false)} onCreated={handleCreated} />
      )}
    </>
  );
}
