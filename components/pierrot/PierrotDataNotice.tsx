'use client';

import React, { useEffect, useState } from 'react';
import { usePierrot } from '@/components/pierrot/PierrotContext';
import {
  deletePierrotConversation,
  getPierrotConsent,
  setPierrotConsent,
} from '@/lib/pierrot/clientTelemetry';

type PierrotDataNoticeProps = {
  className?: string;
};

export default function PierrotDataNotice({ className = '' }: PierrotDataNoticeProps) {
  const { clearChat } = usePierrot();
  const [state, setState] = useState<'granted' | 'denied'>('granted');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setState(getPierrotConsent().state === 'denied' ? 'denied' : 'granted');
  }, []);

  const toggle = () => {
    const next = state === 'granted' ? 'denied' : 'granted';
    setPierrotConsent(next);
    setState(next);
  };

  const deleteSavedCopy = async () => {
    if (isDeleting) return;

    setIsDeleting(true);

    try {
      const deleted = await deletePierrotConversation();
      if (deleted) clearChat();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className={`
        flex flex-wrap items-center justify-between gap-x-3 gap-y-1
        font-mono text-[9px] uppercase tracking-[0.12em] text-[#898277]
        ${className}
      `}
    >
      <p className="normal-case tracking-normal">
        {state === 'granted'
          ? 'Pierrot saves this conversation privately for up to 90 days.'
          : 'Saving is off. Pierrot answers without keeping a transcript.'}
      </p>

      <div className="flex items-center gap-3">
        {state === 'granted' && (
          <button
            type="button"
            onClick={deleteSavedCopy}
            disabled={isDeleting}
            className="underline decoration-[#CFC3B1] underline-offset-4 transition hover:text-[#37332D] disabled:opacity-40"
          >
            {isDeleting ? 'Deleting…' : 'Delete saved copy'}
          </button>
        )}

        <button
          type="button"
          onClick={toggle}
          className="underline decoration-[#CFC3B1] underline-offset-4 transition hover:text-[#37332D]"
        >
          {state === 'granted' ? "Don't save" : 'Allow saving'}
        </button>
      </div>
    </div>
  );
}
