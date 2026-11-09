export const GA_MEASUREMENT_ID = 'G-J1F4ZTK9ND';

export const GA_EVENTS = {
  pageView: 'page_view',
  sectionView: 'section_view',
  projectView: 'project_view',
  flowView: 'flow_view',
  flowSubscribeStart: 'flow_subscribe_start',
  flowSubscribeComplete: 'flow_subscribe_complete',
  ritualEnter: 'ritual_enter',
  artEngineView: 'art_engine_view',
  artEngineInteraction: 'art_engine_interaction',
  artifactInteraction: 'artifact_interaction',
  outboundClick: 'outbound_click',
} as const;

export type GaEventName = (typeof GA_EVENTS)[keyof typeof GA_EVENTS] | string;
export type GaParamValue = string | number | boolean | null | undefined;
export type GaParams = Record<string, GaParamValue>;

type DataLayerWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

/**
 * Keys that must never reach GA4. The list is intentionally broad: it is
 * better to lose a useful dimension than to leak owner data.
 */
const BLOCKED_KEY = /(?:email|e-mail|mail|message|prompt|dialog|conversation|intake|food|drink|brain|token|secret|password|user_?id|owner|phone|private|notes?|query|search|name|address|ip)/i;
const EVENT_NAME = /^[a-z][a-z0-9_]{0,39}$/;

export function isGoogleAnalyticsEnabled(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function sanitizeGaParams(params: GaParams | undefined): Record<string, string | number | boolean> {
  const clean: Record<string, string | number | boolean> = {};
  if (!params) return clean;

  for (const [key, raw] of Object.entries(params)) {
    if (!key || BLOCKED_KEY.test(key)) continue;
    if (raw === null || raw === undefined) continue;

    if (typeof raw === 'number') {
      if (Number.isFinite(raw)) clean[key.slice(0, 40)] = raw;
      continue;
    }
    if (typeof raw === 'boolean') {
      clean[key.slice(0, 40)] = raw;
      continue;
    }
    if (typeof raw === 'string') {
      const value = raw
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100);
      if (value) clean[key.slice(0, 40)] = value;
    }
    // Objects and arrays are deliberately dropped: nested payloads are the
    // easiest way to leak private data into analytics.
  }

  return clean;
}

/**
 * Sends one GA4 event. It is a no-op outside production and when gtag has not
 * loaded yet; in that case the event is queued on dataLayer in the GA4 object
 * form. Never throws into a UI event handler.
 */
export function trackGaEvent(name: GaEventName, params?: GaParams): boolean {
  if (!isGoogleAnalyticsEnabled()) return false;
  if (typeof window === 'undefined') return false;
  if (!name || !EVENT_NAME.test(name)) return false;

  const clean = sanitizeGaParams(params);
  const target = window as DataLayerWindow;

  try {
    if (typeof target.gtag === 'function') {
      target.gtag('event', name, clean);
      return true;
    }
    target.dataLayer = target.dataLayer || [];
    target.dataLayer.push({ event: name, ...clean });
    return true;
  } catch {
    return false;
  }
}

export function resetGaForTests(): void {
  if (typeof window === 'undefined') return;
  const target = window as DataLayerWindow;
  delete target.gtag;
  delete target.dataLayer;
}
