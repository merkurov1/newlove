'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  summarizeCrosspostResult,
  type FlowPublishReceipt,
  type FlowReceiptStatus,
} from '@/lib/flow/distribution';

type PublishedEventDetail = {
  item?: { id?: unknown };
  crosspost?: unknown;
  pending?: unknown;
};

const SUCCESS_DISMISS_MS = 8000;
const POLL_INTERVAL_MS = 2500;
const POLL_ATTEMPTS = 10;

const STATUS_LABELS: Record<FlowReceiptStatus, string> = {
  published: 'delivered',
  failed: 'failed',
  uncertain: 'unconfirmed',
  skipped: 'skipped',
  publishing: 'publishing…',
  not_requested: 'not attempted',
  unknown: 'status unknown',
};

const STATUS_CLASS: Record<FlowReceiptStatus, string> = {
  published: 'text-[#2f6f4f]',
  failed: 'text-[#9a3b2e]',
  uncertain: 'text-[#9a3b2e]',
  skipped: 'text-[#6b665e]',
  publishing: 'text-[#8a5a10]',
  not_requested: 'text-[#6b665e]',
  unknown: 'text-[#9a3b2e]',
};

function channelMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const crosspost = (value as Record<string, unknown>).crosspost;
  if (!crosspost || typeof crosspost !== 'object' || Array.isArray(crosspost)) return null;

  const channels = (crosspost as Record<string, unknown>).channels;
  return channels && typeof channels === 'object' && !Array.isArray(channels)
    ? (channels as Record<string, unknown>)
    : null;
}

function asPendingReceipt(receipt: FlowPublishReceipt): FlowPublishReceipt {
  const channels = receipt.channels.map((channel) =>
    channel.status === 'unknown' || channel.status === 'not_requested'
      ? { ...channel, status: 'publishing' as const }
      : channel
  );

  return {
    ...receipt,
    channels,
    hasProblem: channels.some(
      (channel) =>
        channel.status === 'failed' ||
        channel.status === 'uncertain' ||
        channel.status === 'unknown'
    ),
  };
}

function isTerminal(receipt: FlowPublishReceipt): boolean {
  return receipt.channels.every(
    (channel) =>
      channel.status !== 'publishing' &&
      channel.status !== 'not_requested' &&
      channel.status !== 'unknown'
  );
}

/**
 * One compact, dismissible receipt for a just-created Flow item.
 *
 * It lives outside the composer: the composer still closes immediately, and
 * the receipt follows the deferred channel state without presenting a partial
 * or uncertain delivery as success. Failures stay visible until dismissed.
 */
export default function PublishReceipt() {
  const [receipt, setReceipt] = useState<FlowPublishReceipt | null>(null);
  const dismissTimer = useRef<number | null>(null);
  const pollToken = useRef(0);

  const dismiss = useCallback(() => {
    pollToken.current += 1;
    if (dismissTimer.current !== null) {
      window.clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    setReceipt(null);
  }, []);

  useEffect(() => {
    function clearDismissTimer() {
      if (dismissTimer.current !== null) {
        window.clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    }

    function show(next: FlowPublishReceipt, scheduleDismiss: boolean) {
      setReceipt(next);
      clearDismissTimer();

      if (scheduleDismiss && !next.hasProblem) {
        dismissTimer.current = window.setTimeout(() => {
          setReceipt(null);
        }, SUCCESS_DISMISS_MS);
      }
    }

    function onPublished(event: Event) {
      const detail = (event as CustomEvent<PublishedEventDetail>).detail;
      const itemId =
        detail && typeof detail.item?.id === 'string' && detail.item.id.trim()
          ? detail.item.id.trim()
          : null;
      const pending = detail?.pending === true;

      const base = summarizeCrosspostResult(detail?.crosspost, itemId);

      if (!pending || !itemId) {
        show(base, true);
        return;
      }

      show(asPendingReceipt(base), false);

      const targetItemId = itemId;
      const token = ++pollToken.current;
      let attempt = 0;

      function poll() {
        if (pollToken.current !== token) return;

        attempt += 1;

        fetch(`/api/flow/items/${encodeURIComponent(targetItemId)}`, { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : null))
          .then((payload) => {
            if (pollToken.current !== token || !payload) return;

            const channels = channelMetadata(payload.item?.metadata);

            if (!channels) {
              if (attempt < POLL_ATTEMPTS) {
                window.setTimeout(poll, POLL_INTERVAL_MS);
              } else {
                show(summarizeCrosspostResult(null, targetItemId), true);
              }
              return;
            }

            const next = summarizeCrosspostResult({ channels }, targetItemId);

            if (isTerminal(next)) {
              show(next, true);
              return;
            }

            if (attempt >= POLL_ATTEMPTS) {
              // Still publishing: keep the receipt visible instead of
              // auto-dismissing an unfinished delivery.
              show(next, false);
              return;
            }

            show(next, false);
            window.setTimeout(poll, POLL_INTERVAL_MS);
          })
          .catch(() => {
            if (pollToken.current !== token) return;
            if (attempt < POLL_ATTEMPTS) {
              window.setTimeout(poll, POLL_INTERVAL_MS);
            } else {
              show(summarizeCrosspostResult(null, targetItemId), true);
            }
          });
      }

      window.setTimeout(poll, POLL_INTERVAL_MS);
    }

    window.addEventListener('flow:published', onPublished);

    return () => {
      window.removeEventListener('flow:published', onPublished);
      clearDismissTimer();
      pollToken.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!receipt) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') dismiss();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [receipt, dismiss]);

  if (!receipt) return null;

  const panel = (
    <div
      role="status"
      aria-live="polite"
      className="
        fixed bottom-[calc(78px_+_env(safe-area-inset-bottom))] left-4 z-[80]
        w-[min(22rem,calc(100vw_-_2rem))] border border-[#dcd6ca]
        bg-[#fbf9f4] p-3 text-[#2a2723]
        shadow-[0_12px_34px_rgba(29,27,24,0.16)]
        sm:bottom-6
      "
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6b665e]">
          Flow · saved
        </p>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss publication result"
          className="-mr-1 -mt-1 flex h-7 min-h-7 w-7 min-w-7 items-center justify-center text-sm text-[#6b665e] transition hover:text-[#2a2723]"
        >
          ×
        </button>
      </div>

      <ul className="mt-2 space-y-1">
        {receipt.channels.map((channel) => (
          <li
            key={channel.key}
            className="flex items-baseline justify-between gap-3 text-xs leading-relaxed"
          >
            <span className="text-[#2a2723]">{channel.label}</span>
            <span
              className={`font-mono text-[10px] uppercase tracking-[0.06em] ${STATUS_CLASS[channel.status]}`}
            >
              {STATUS_LABELS[channel.status]}
            </span>
          </li>
        ))}
      </ul>

      {receipt.itemId && (
        <a
          href={`/admin/items/${encodeURIComponent(receipt.itemId)}`}
          className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.1em] text-[#6b665e] underline underline-offset-2 transition hover:text-[#2a2723]"
        >
          Channel details ↗
        </a>
      )}
    </div>
  );

  return createPortal(panel, document.body);
}
