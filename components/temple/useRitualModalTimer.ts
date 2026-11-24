'use client';

import { useEffect } from 'react';

export const RITUAL_TIMER_EVENT = 'temple:ritual-timer';

export type RitualTimerDetail = string | null;

/**
 * A ritual can publish a short timer label (e.g. the Vigil flame countdown) that
 * the shared modal shell renders in its header. Direct pages simply ignore the
 * event because no modal is listening.
 */
export function useRitualModalTimer(label: string | null) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.dispatchEvent(
      new CustomEvent<RitualTimerDetail>(RITUAL_TIMER_EVENT, {
        detail: label || null,
      })
    );

    return () => {
      window.dispatchEvent(
        new CustomEvent<RitualTimerDetail>(RITUAL_TIMER_EVENT, {
          detail: null,
        })
      );
    };
  }, [label]);
}
