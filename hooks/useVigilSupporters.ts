'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase-browser';
import {
  parseVigilPublicState,
  type VigilPublicState,
} from '@/lib/vigil/supporters';

export type VigilSupporterStatus = 'loading' | 'ready' | 'stale' | 'error';

export type VigilSupporterSnapshot = VigilPublicState & {
  status: VigilSupporterStatus;
  error: string | null;
};

const EMPTY_STATE: VigilSupporterSnapshot = {
  supporterCount: 0,
  lastLitAt: null,
  flameLit: false,
  windowStartedAt: '',
  updatedAt: '',
  status: 'loading',
  error: null,
};

const REFRESH_INTERVAL_MS = 30_000;

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Vigil state unavailable';
}

/**
 * Reads the live Vigil supporter state from the authoritative server route and
 * refreshes it on public Realtime events. If the API or the Realtime channel
 * fails, the last real snapshot is kept and marked stale; the UI never falls
 * back to a fabricated or client-counted value.
 */
export function useVigilSupporters(): VigilSupporterSnapshot & {
  refresh: () => Promise<void>;
} {
  const [snapshot, setSnapshot] =
    useState<VigilSupporterSnapshot>(EMPTY_STATE);

  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      const response = await fetch('/api/vigil/state', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload &&
            typeof payload === 'object' &&
            typeof (payload as { error?: unknown }).error === 'string'
            ? (payload as { error: string }).error
            : `Vigil state failed (${response.status})`
        );
      }

      const state = parseVigilPublicState(payload);

      if (!state) {
        throw new Error('Vigil state response was invalid');
      }

      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      setSnapshot({
        ...state,
        status: 'ready',
        error: null,
      });
    } catch (error) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      setSnapshot((previous) => ({
        ...previous,
        status:
          previous.status === 'ready' || previous.status === 'stale'
            ? 'stale'
            : 'error',
        error: errorMessage(error),
      }));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    const interval = window.setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      window.clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel(
        `temple_vigil_supporters_${Math.random().toString(36).slice(2, 10)}`
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'temple_log' },
        (payload) => {
          const eventType = String(
            (payload?.new as { event_type?: unknown } | null)?.event_type || ''
          ).toUpperCase();

          if (eventType === 'VIGIL_SPARK') {
            void refresh();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vigil_hearts' },
        (payload) => {
          const heartId = Number(
            (payload?.new as { id?: unknown } | null)?.id
          );

          if (heartId === 1) {
            void refresh();
          }
        }
      )
      .subscribe((status) => {
        if (!mountedRef.current) return;

        if (status === 'CHANNEL_ERROR') {
          console.error('Vigil supporters realtime channel error');

          setSnapshot((previous) => ({
            ...previous,
            status:
              previous.status === 'loading' ? 'error' : 'stale',
            error: 'Vigil realtime connection lost',
          }));
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { ...snapshot, refresh };
}
