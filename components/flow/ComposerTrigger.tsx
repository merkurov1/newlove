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
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-200/80 bg-white/80 font-serif text-xl font-light text-stone-600 transition hover:border-stone-400 hover:bg-white hover:text-stone-900"
        aria-label="Create"
        title="Create"
      >
        +
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