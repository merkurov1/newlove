'use client';

import { useEffect, useRef } from 'react';
import { trackGaEvent, type GaEventName, type GaParams } from '@/lib/analytics/ga4';

/**
 * Fires one GA4 event when a server-rendered page mounts. The ref prevents
 * duplicate events from React strict mode and accidental re-renders.
 */
export function PageEvent({
  name,
  params,
}: {
  name: GaEventName;
  params?: GaParams;
}) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackGaEvent(name, params);
  }, [name, params]);

  return null;
}
