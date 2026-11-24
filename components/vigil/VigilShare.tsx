'use client';

import { useCallback, useState } from 'react';

import useIsTelegram from '@/components/useIsTelegram';
import { getTelegramWebApp, hapticSelection } from '@/lib/telegram/webApp';
import { performShare } from '@/lib/telegram/share';import { TEMPLE_HOME_ASSETS } from '@/lib/temple/homeAssets';

const VIGIL_URL = 'https://www.merkurov.love/vigil';

/**
 * Discreet share affordance shown only after a confirmed Vigil spark. It is
 * not an always-visible toolbar and a dismissal never interrupts the ritual.
 */
export default function VigilShare() {
  const isTelegram = useIsTelegram();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const share = useCallback(async () => {
    if (busy) return;

    setBusy(true);
    setMessage(null);
    hapticSelection();

    const tg = isTelegram ? getTelegramWebApp() : null;

    try {
      const outcome = await performShare({
        request: {
          kind: 'vigil',
          title: 'A spark was sent in the Temple.',
          url: VIGIL_URL,
          imageUrl: TEMPLE_HOME_ASSETS.heart,
          excerpt: 'Keep the Vigil together.',
        },
        storyApi: tg,
        openTelegramLink: tg?.openLink ? (link) => tg.openLink?.(link) : undefined,
      });

      const label =
        outcome === 'copied'
          ? 'Link copied'
          : outcome === 'failed'
            ? 'Share unavailable'
            : outcome === 'dismissed'
              ? null
              : 'Shared';

      setMessage(label);
    } catch {
      setMessage('Share unavailable');
    } finally {
      setBusy(false);
    }
  }, [busy, isTelegram]);

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={() => void share()}
        disabled={busy}
        className="min-h-[40px] rounded-full border border-white/20 px-4 font-mono text-[10px] uppercase tracking-[.16em] opacity-70 transition hover:opacity-100 disabled:opacity-40"
      >
        {busy ? '…' : 'Share the Vigil'}
      </button>
      {message && (
        <p role="status" className="mt-1 font-mono text-[10px] uppercase tracking-[.12em] opacity-60">
          {message}
        </p>
      )}
    </div>
  );
}
