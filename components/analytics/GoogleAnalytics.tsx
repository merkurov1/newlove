'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import {
  GA_MEASUREMENT_ID,
  GA_EVENTS,
  isGoogleAnalyticsEnabled,
  trackGaEvent,
} from '@/lib/analytics/ga4';

/**
 * One GA4 property, one page_view per App Router navigation.
 *
 * gtag config uses send_page_view:false so the automatic initial page_view does
 * not duplicate the manual one. The ref also guards React strict-mode effects.
 */
export function GoogleAnalytics() {
  const pathname = usePathname();
  const lastSentPath = useRef<string | null>(null);
  const enabled = isGoogleAnalyticsEnabled();

  useEffect(() => {
    if (!enabled || !pathname) return;
    if (lastSentPath.current === pathname) return;
    lastSentPath.current = pathname;

    trackGaEvent(GA_EVENTS.pageView, {
      page_path: pathname,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [enabled, pathname]);

  if (!enabled) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = window.gtag || gtag;
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
        `}
      </Script>
    </>
  );
}
