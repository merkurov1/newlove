'use client';

import { useCallback, useEffect, useState } from 'react';

import useIsTelegram from '@/components/useIsTelegram';
import {
  getTelegramInitData,
  hapticNotification,
  hapticSelection,
} from '@/lib/telegram/webApp';
import { readGroupContextHint } from '@/lib/telegram/groupContextHint';

type State = { joined: boolean; participants: number } | null;

/**
 * Group-scoped Shared Vigil. The client only supplies raw initData; the server
 * derives and verifies the group from that signed payload. Participant
 * identities are never returned.
 */
export default function SharedVigil() {
  const isTelegram = useIsTelegram();
  const [hint, setHint] = useState(() => ({ available: false, title: null as string | null }));
  const [state, setState] = useState<State>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTelegram) return;

    setHint(readGroupContextHint(getTelegramInitData()));
  }, [isTelegram]);

  const call = useCallback(
    async (action: 'join' | 'leave' | 'status') => {
      if (busy) return;

      const initData = getTelegramInitData();

      if (!initData) {
        setError('Telegram launch data is unavailable.');
        return;
      }

      setBusy(true);
      setError(null);

      try {
        const response = await fetch('/api/telegram/group-vigil', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, initData }),
          cache: 'no-store',
        });

        const json = (await response.json().catch(() => null)) as {
          ok?: boolean;
          joined?: boolean;
          participants?: number;
          error?: string;
        } | null;

        if (!response.ok || !json?.ok) {
          setError(
            response.status === 409
              ? 'Shared Vigil needs a group launch.'
              : json?.error || 'Shared Vigil is unavailable.'
          );
          setState(null);
          return;
        }

        setState({
          joined: Boolean(json.joined),
          participants:
            typeof json.participants === 'number' && json.participants >= 0
              ? json.participants
              : 0,
        });

        if (action === 'join') hapticNotification('success');
      } catch {
        setError('Shared Vigil is unavailable.');
      } finally {
        setBusy(false);
      }
    },
    [busy]
  );

  useEffect(() => {
    if (!isTelegram || !hint.available) return;

    void call('status');
    // Status is read once per mount; actions are explicit user gestures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTelegram, hint.available]);

  if (!isTelegram) return null;

  if (!hint.available || error) {
    return (
      <p className="mt-3 text-center font-mono text-[9px] uppercase tracking-[.14em] opacity-50">
        Shared Vigil · available in group chats
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-100/20 px-4 py-3 text-center">
      <p className="font-mono text-[9px] uppercase tracking-[.16em] opacity-60">
        Shared Vigil{hint.title ? ` · ${hint.title}` : ''}
      </p>
      <p className="mt-1 text-xs opacity-75">
        {state
          ? `${state.participants} ${state.participants === 1 ? 'keeper' : 'keepers'} in this chat`
          : 'Keep the Vigil together.'}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          hapticSelection();
          void call(state?.joined ? 'leave' : 'join');
        }}
        className="mt-2 min-h-[40px] rounded-full border border-amber-400/40 px-4 font-mono text-[10px] uppercase tracking-[.14em] disabled:opacity-50"
      >
        {busy ? '…' : state?.joined ? 'Leave the shared Vigil' : 'Join the shared Vigil'}
      </button>
    </div>
  );
}
