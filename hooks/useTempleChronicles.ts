'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TEMPLE_CHRONICLES_PAGE_SIZE,
  isTempleChroniclesPage,
  type TempleChronicleEvent,
  type TempleChroniclesPage,
  type TemplePublicAggregates,
} from '@/lib/temple/feed';
import { mergeTempleChronicleEvents } from '@/lib/temple/chronicles';
import { supabase } from '@/lib/supabase-browser';

export type TempleChroniclesStatus =
  | 'loading'
  | 'ready'
  | 'stale'
  | 'error';

export type TempleChroniclesSnapshot = {
  events: TempleChronicleEvent[];
  aggregates: TemplePublicAggregates | null;
  status: TempleChroniclesStatus;
  error: string | null;
  hasMore: boolean;
  nextCursor: string | null;
  loadingMore: boolean;
  live: boolean;
  lastUpdatedAt: number | null;
};

const EMPTY_SNAPSHOT: TempleChroniclesSnapshot = {
  events: [],
  aggregates: null,
  status: 'loading',
  error: null,
  hasMore: false,
  nextCursor: null,
  loadingMore: false,
  live: false,
  lastUpdatedAt: null,
};

const FALLBACK_REFRESH_MS = 45_000;
const REALTIME_DEBOUNCE_MS = 350;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function fetchPage(options: {
  before?: string | null;
  limit?: number;
  signal?: AbortSignal;
}): Promise<TempleChroniclesPage> {
  const params = new URLSearchParams();
  params.set('limit', String(options.limit ?? TEMPLE_CHRONICLES_PAGE_SIZE));

  if (options.before) params.set('before', options.before);

  const response = await fetch(
    `/api/temple_logs/chronicles?${params.toString()}`,
    {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: options.signal,
    }
  );

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload &&
        typeof payload === 'object' &&
        typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `The chronicle is unavailable (${response.status})`
    );
  }

  if (!isTempleChroniclesPage(payload)) {
    throw new Error('The chronicle response was invalid');
  }

  return payload;
}

/**
 * Reads the paginated public chronology, then keeps it current with a
 * Realtime signal. The Realtime payload is deliberately ignored; it is only a
 * hint to re-read the allowlisted API. A 45-second revalidation and a
 * visibility refresh keep the timeline working when Realtime is unavailable.
 */
export function useTempleChronicles(
  pageSize: number = TEMPLE_CHRONICLES_PAGE_SIZE
) {
  const [snapshot, setSnapshot] =
    useState<TempleChroniclesSnapshot>(EMPTY_SNAPSHOT);

  const snapshotRef = useRef(snapshot);
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  const apply = useCallback((next: TempleChroniclesSnapshot) => {
    snapshotRef.current = next;
    if (mountedRef.current) setSnapshot(next);
  }, []);

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const page = await fetchPage({
        limit: pageSize,
        signal: controller.signal,
      });

      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      const current = snapshotRef.current;
      // A background refresh must not discard pages the visitor already
      // loaded. When older pages are present, keep their cursor and state.
      const loadedOlderPages = current.events.length > page.events.length;
      const nextCursor = loadedOlderPages
        ? current.nextCursor
        : page.pageInfo.nextCursor;
      const hasMore = loadedOlderPages
        ? current.hasMore
        : page.pageInfo.hasMore;

      apply({
        events: mergeTempleChronicleEvents(current.events, page.events),
        aggregates: page.aggregates ?? current.aggregates,
        status: 'ready',
        error: null,
        hasMore,
        nextCursor,
        loadingMore: false,
        live: current.live,
        lastUpdatedAt: Date.now(),
      });
    } catch (error) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      if ((error as { name?: string } | null)?.name === 'AbortError') return;

      const current = snapshotRef.current;

      apply({
        ...current,
        status: current.events.length > 0 ? 'stale' : 'error',
        error: errorMessage(error),
        loadingMore: false,
      });
    }
  }, [apply, pageSize]);

  const loadMore = useCallback(async () => {
    const current = snapshotRef.current;

    if (
      loadingMoreRef.current ||
      !current.hasMore ||
      !current.nextCursor
    ) {
      return;
    }

    loadingMoreRef.current = true;
    apply({ ...current, loadingMore: true, error: null });

    try {
      const page = await fetchPage({
        before: current.nextCursor,
        limit: pageSize,
      });

      if (!mountedRef.current) return;

      const latest = snapshotRef.current;

      apply({
        ...latest,
        events: mergeTempleChronicleEvents(latest.events, page.events),
        aggregates: latest.aggregates ?? page.aggregates,
        status: 'ready',
        hasMore: page.pageInfo.hasMore,
        nextCursor: page.pageInfo.nextCursor,
        loadingMore: false,
        error: null,
        lastUpdatedAt: Date.now(),
      });
    } catch (error) {
      if (!mountedRef.current) return;

      apply({
        ...snapshotRef.current,
        status:
          snapshotRef.current.events.length > 0 ? 'stale' : 'error',
        error: errorMessage(error),
        loadingMore: false,
      });
    } finally {
      loadingMoreRef.current = false;
    }
  }, [apply, pageSize]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    const interval = window.setInterval(() => {
      void refresh();
    }, FALLBACK_REFRESH_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel(
        `temple_chronicles_${Math.random().toString(36).slice(2, 10)}`
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'temple_chronicle_signals',
        },
        () => {
          // Never consume the raw row payload. Revalidation is the only path
          // that can place an event in the public timeline.
          if (debounceRef.current !== null) {
            window.clearTimeout(debounceRef.current);
          }

          debounceRef.current = window.setTimeout(() => {
            debounceRef.current = null;
            void refresh();
          }, REALTIME_DEBOUNCE_MS);
        }
      )
      .subscribe((status) => {
        if (!mountedRef.current) return;

        if (status === 'SUBSCRIBED') {
          apply({ ...snapshotRef.current, live: true });
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // The fixed revalidation interval and visibility listener are the
          // fallback. The timeline keeps its last real entries.
          apply({ ...snapshotRef.current, live: false });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [apply, refresh]);

  return {
    ...snapshot,
    refresh,
    loadMore,
  };
}
