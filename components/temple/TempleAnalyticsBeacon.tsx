'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { sendTempleAnalyticsEvent } from '@/lib/temple/analyticsClient';

type TempleAnalyticsBeaconProps = {
  /** Coarse surface label used only to describe the page in the contract. */
  surface: 'temple' | 'vigil';
};

/**
 * Invisible page/session beacon.
 *
 * The server creates the 30-minute visit session on the first event and reuses
 * its cookie on refresh, so a reload is a page view but not a new session.
 * React StrictMode's double effect is de-duplicated by the ref.
 */
export default function TempleAnalyticsBeacon({ surface }: TempleAnalyticsBeaconProps) {
  const pathname = usePathname();
  const sentRef = useRef<string | null>(null);

  useEffect(() => {
    const path = pathname || `/${surface}`;

    if (sentRef.current === path) return;

    sentRef.current = path;

    void sendTempleAnalyticsEvent({
      event: 'page_view',
      path,
      ritual: surface === 'vigil' ? 'VIGIL' : null,
    });
  }, [pathname, surface]);

  return null;
}
