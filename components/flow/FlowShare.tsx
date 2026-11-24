'use client';

import { useCallback, useState } from 'react';

import useIsTelegram from '@/components/useIsTelegram';
import { getTelegramWebApp, hapticSelection, hapticNotification } from '@/lib/telegram/webApp';
import { performShare, type ShareOutcome } from '@/lib/telegram/share';

type Props = {
  title: string;
  url: string;
  imageUrl?: string | null;
  excerpt?: string | null;
  slug: string;
};

function outcomeLabel(outcome: ShareOutcome): string | null {
  if (outcome === 'copied') return 'Link copied';
  if (outcome === 'failed') return 'Share unavailable';
  if (outcome === 'dismissed') return null;

  return 'Shared';
}

/**
 * A discreet, post-reading share affordance. It is never a permanent toolbar
 * and never blocks reading. Only published canonical content is passed in.
 */
export default function FlowShare({ title, url, imageUrl, excerpt, slug }: Props) {
  const isTelegram = useIsTelegram();
  const [state, setState] = useState<'idle' | 'sharing' | 'done'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const share = useCallback(async () => {
    if (state === 'sharing') return;

    setState('sharing');
    setMessage(null);
    hapticSelection();

    const tg = isTelegram ? getTelegramWebApp() : null;

    try {
      const outcome = await performShare({
        request: { kind: 'flow', title, url, imageUrl, excerpt },
        storyApi: tg,
        messageApi: tg,
        openTelegramLink: tg?.openLink ? (link) => tg.openLink?.(link) : undefined,
        prepareMessage: async () => {
          if (typeof tg?.shareMessage !== 'function') return null;

          try {
            const response = await fetch('/api/telegram/share/prepared', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(tg.initData ? { 'x-telegram-init-data': tg.initData } : {}),
              },
              body: JSON.stringify({ slug }),
              cache: 'no-store',
            });

            if (!response.ok) return null;

            const json = (await response.json().catch(() => null)) as {
              preparedMessageId?: unknown;
            } | null;

            return typeof json?.preparedMessageId === 'string' ? json.preparedMessageId : null;
          } catch {
            return null;
          }
        },
      });

      const label = outcomeLabel(outcome);

      if (outcome === 'failed') hapticNotification('error');

      setState(outcome === 'dismissed' ? 'idle' : 'done');
      setMessage(label);
    } catch {
      hapticNotification('error');
      setState('idle');
      setMessage('Share unavailable');
    }
  }, [excerpt, imageUrl, isTelegram, slug, state, title, url]);

  return (
    <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
      <button
        type="button"
        onClick={() => void share()}
        disabled={state === 'sharing'}
        aria-label="Share this Flow post"
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-stone-200 bg-white/70 px-3 py-1.5 text-stone-600 transition hover:border-stone-400 hover:text-stone-900 disabled:opacity-50"
      >
        <span aria-hidden="true">↗</span>
        {state === 'sharing' ? 'Sharing…' : 'Share'}
      </button>

      {message && (
        <span role="status" aria-live="polite" className="normal-case tracking-normal">
          {message}
        </span>
      )}
    </div>
  );
}
