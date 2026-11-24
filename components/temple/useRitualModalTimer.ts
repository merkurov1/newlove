'use client';

import { useEffect } from 'react';

export const RITUAL_TIMER_EVENT = 'temple:ritual-timer';

export type RitualTimerDetail = string | null;

/*
 * Child effects run before the modal shell's effect, so an event-only channel
 * loses the first label (for example the released-heart counter on mount).
 * Keeping the latest label here lets the shell read it synchronously when it
 * attaches and still receive later updates through the event.
 */
let currentTimerLabel: RitualTimerDetail = null;

export function getRitualTimerLabel(): RitualTimerDetail {
  return currentTimerLabel;
}

/**
 * A ritual can publish a short timer label (e.g. the Vigil flame countdown) that
 * the shared modal shell renders in its header. Direct pages simply ignore the
 * event because no modal is listening.
 */
export function useRitualModalTimer(label: string | null) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    currentTimerLabel = label || null;

    window.dispatchEvent(
      new CustomEvent<RitualTimerDetail>(RITUAL_TIMER_EVENT, {
        detail: currentTimerLabel,
      })
    );

    return () => {
      currentTimerLabel = null;

      window.dispatchEvent(
        new CustomEvent<RitualTimerDetail>(RITUAL_TIMER_EVENT, {
          detail: null,
        })
      );
    };
  }, [label]);
}
