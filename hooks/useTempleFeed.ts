'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TEMPLE_FEED_TTL_MS,
  isTempleFeedPayload,
  type TempleFeedPayload,
} from '@/lib/temple/feed';
import {
  readCachedTempleFeed,
  writeCachedTempleFeed,
} from '@/lib/temple/feedCache';

export type TempleFeedStatus = 'loading' | 'ready' | 'stale' | 'error';

export type TempleFeedSnapshot = {
  payload: TempleFeedPayload | null;
  status: TempleFeedStatus;
  error: string | null;
  lastUpdatedAt: number | null;
  fromCache: boolean;
};

export type TempleFeedRefreshOptions = {
  /** Bypass the browser TTL. The server may still answer from its own TTL. */
  force?: boolean;
};

const EMPTY_SNAPSHOT: TempleFeedSnapshot = {
  payload: null,
  status: 'loading',
  error: null,
  lastUpdatedAt: null,
  fromCache: false,
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Reads the public Temple feed from the server route and caches it across
 * visits for one documented TTL. There is deliberately no interval/polling:
 * refreshes happen on mount, after the TTL when a modal opens or the tab
 * becomes visible, or when the visitor asks for one.
 */
export function useTempleFeed(initialPayload: TempleFeedPayload | null = null) {
  const [snapshot, setSnapshot] = useState<TempleFeedSnapshot>(() =>
    initialPayload
      ? {
          payload: initialPayload,
          status: initialPayload.meta.stale ? 'stale' : 'ready',
          error: null,
          lastUpdatedAt: Date.parse(initialPayload.meta.generatedAt) || null,
          fromCache: false,
        }
      : EMPTY_SNAPSHOT
  );

  const snapshotRef = useRef(snapshot);
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);

  const apply = useCallback((next: TempleFeedSnapshot) => {
    snapshotRef.current = next;
    if (mountedRef.current) setSnapshot(next);
  }, []);

  const refresh = useCallback(
    async (options: TempleFeedRefreshOptions = {}) => {
      const current = snapshotRef.current;
      const now = Date.now();

      if (
        !options.force &&
        current.payload &&
        current.lastUpdatedAt &&
        now - current.lastUpdatedAt < TEMPLE_FEED_TTL_MS
      ) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      try {
        const response = await fetch('/api/temple_logs', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
        });

        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            payload &&
              typeof payload === 'object' &&
              typeof (payload as { error?: unknown }).error === 'string'
              ? (payload as { error: string }).error
              : `Temple feed failed (${response.status})`
          );
        }

        if (!isTempleFeedPayload(payload)) {
          throw new Error('Temple feed response was invalid');
        }

        if (!mountedRef.current || requestId !== requestIdRef.current) return;

        const savedAt = Date.now();
        writeCachedTempleFeed(payload, undefined, savedAt);

        const stale = payload.meta.stale === true;

        apply({
          payload,
          status: stale ? 'stale' : 'ready',
          error: stale
            ? 'The Temple is showing its last known good snapshot.'
            : null,
          lastUpdatedAt: savedAt,
          fromCache: false,
        });
      } catch (error) {
        if (!mountedRef.current || requestId !== requestIdRef.current) return;

        const cached = readCachedTempleFeed(undefined, Date.now());
        const fallback = current.payload ?? cached?.payload ?? null;
        const lastUpdatedAt =
          current.lastUpdatedAt ?? cached?.savedAt ?? null;

        apply({
          payload: fallback,
          status: fallback ? 'stale' : 'error',
          error: errorMessage(error),
          lastUpdatedAt,
          fromCache: Boolean(cached && !current.payload),
        });
      }
    },
    [apply]
  );

  useEffect(() => {
    mountedRef.current = true;

    const cached = readCachedTempleFeed();

    if (cached && !snapshotRef.current.payload) {
      const usable = cached.fresh && !cached.payload.meta.stale;

      apply({
        payload: cached.payload,
        status: usable ? 'ready' : 'stale',
        error: usable
          ? null
          : 'The Temple is showing its last known good snapshot.',
        lastUpdatedAt: cached.savedAt,
        fromCache: true,
      });
    }

    // A server-rendered feed is already a valid last-known-good snapshot. Keep
    // the newest one for the next visit even if this browser has never fetched
    // the API or holds an older cached copy.
    if (initialPayload) {
      const initialAt =
        Date.parse(initialPayload.meta.generatedAt) || Date.now();

      if (!cached || cached.savedAt < initialAt) {
        writeCachedTempleFeed(initialPayload);
      }
    }

    void refresh();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [apply, initialPayload, refresh]);

  return {
    ...snapshot,
    refresh,
    invalidate: () => {
      requestIdRef.current += 1;
      apply(EMPTY_SNAPSHOT);
    },
  };
}
