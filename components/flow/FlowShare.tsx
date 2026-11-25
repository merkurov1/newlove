'use client';

import { useCallback, useState } from 'react';

import useIsTelegram from '@/components/useIsTelegram';
import { getTelegramWebApp, hapticSelection, hapticNotification } from '@/lib/telegram/webApp';
import { performShare, planStoryShare, type ShareOutcome } from '@/lib/telegram/share';

type Props = {
  title: string;
  url: string;
  imageUrl?: string | null;
  excerpt?: string | null;
  slug: string;
};

type Busy = 'share' | 'story' | null;

function messageFor(outcome: ShareOutcome): string | null {
  if (outcome === 'copied') return 'Link copied';
  if (outcome === 'failed') return 'Share unavailable';
  if (outcome === 'telegram-link') return 'Opening Telegram…';
  if (outcome === 'message') return 'Share opened';
  if (outcome === 'story') return 'Story editor opened';

  // Native sheets and dismissals already give their own feedback.
  return null;
}

/**
 * A discreet, post-reading share affordance. It is never a permanent toolbar
 * and never blocks reading. Only published canonical content is passed in.
 *
 * Story sharing is a separate contextual action and appears only when the
 * client supports it and the publication has a story-safe image.
 */
export default function FlowShare({ title, url, imageUrl, excerpt, slug }: Props) {
  const isTelegram = useIsTelegram();
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Detection is client-side but synchronous, so no extra effect/render is
  // needed. During SSR and the first hydration pass `isTelegram` is false and
  // the story action is simply absent, then appears once the SDK is confirmed.
  const telegramWebApp = isTelegram ? getTelegramWebApp() : null;
  const storyPlan = planStoryShare({ kind: 'flow', title, url, imageUrl, excerpt });
  const storySupported = Boolean(
    isTelegram && storyPlan.supported && typeof telegramWebApp?.shareToStory === 'function'
  );

  const run = useCallback(
    async (mode: 'share' | 'story') => {
      if (busy) return;

      setBusy(mode);
      setMessage(null);
      hapticSelection();

      const tg = isTelegram ? getTelegramWebApp() : null;

      try {
        const outcome = await performShare({
          request: { kind: 'flow', title, url, imageUrl, excerpt },
          storyApi: tg,
          messageApi: tg,
          storyMode: mode === 'story' ? 'only' : 'off',
          openTelegramLink:
            tg?.openTelegramLink ?? (tg?.openLink ? (link) => tg.openLink?.(link) : undefined),
          prepareMessage:
            mode === 'share'
              ? async () => {
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

                    return typeof json?.preparedMessageId === 'string'
                      ? json.preparedMessageId
                      : null;
                  } catch {
                    return null;
                  }
                }
              : undefined,
        });

        if (outcome === 'failed') hapticNotification('error');

        setMessage(messageFor(outcome));
      } catch {
        hapticNotification('error');
        setMessage('Share unavailable');
      } finally {
        setBusy(null);
      }
    },
    [busy, excerpt, imageUrl, isTelegram, slug, title, url]
  );

  return (
    <div className="flow-share">
      <button
        type="button"
        onClick={() => void run('share')}
        disabled={busy !== null}
        aria-label="Share this Flow post"
        className="flow-share__button"
      >
        <span aria-hidden="true">↗</span>
        {busy === 'share' ? 'Sharing…' : 'Share'}
      </button>

      {storySupported && (
        <button
          type="button"
          onClick={() => void run('story')}
          disabled={busy !== null}
          aria-label="Share this Flow post to a Telegram Story"
          className="flow-share__button flow-share__button--story"
        >
          {busy === 'story' ? 'Opening…' : 'Story'}
        </button>
      )}

      {message && (
        <span role="status" aria-live="polite" className="flow-share__status">
          {message}
        </span>
      )}
    </div>
  );
}
