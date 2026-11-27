/**
 * Browser helper for the private Temple analytics contract.
 *
 * Only client-observable intent events (`page_view`, `ritual_nav`) are sent
 * from here. Ritual completion is recorded by trusted server routes, so a
 * browser cannot inflate conversions. The request is fire-and-forget and every
 * failure is swallowed; analytics must never interrupt a ritual.
 */

import type {
  TempleAnalyticsClientEventName,
  TempleAnalyticsEventInput,
} from '@/lib/temple/analytics';
import {
  isTempleAnalyticsClientEventName,
  sanitizeTempleAnalyticsPath,
} from '@/lib/temple/analytics';

const ENDPOINT = '/api/temple/analytics';
const DEDUPE_WINDOW_MS = 2_000;

const lastSentAt = new Map<string, number>();

function eventKey(): string {
  const cryptoScope = globalThis.crypto as { randomUUID?: () => string } | undefined;

  if (cryptoScope?.randomUUID) {
    try {
      return cryptoScope.randomUUID();
    } catch {
      // Fall through to the non-crypto id below.
    }
  }

  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function shouldSend(fingerprint: string, nowMs: number): boolean {
  const previous = lastSentAt.get(fingerprint);

  if (previous !== undefined && nowMs - previous < DEDUPE_WINDOW_MS) {
    return false;
  }

  lastSentAt.set(fingerprint, nowMs);

  // Bound the in-memory map for long-lived tabs.
  if (lastSentAt.size > 50) {
    lastSentAt.delete(lastSentAt.keys().next().value as string);
  }

  return true;
}

export async function sendTempleAnalyticsEvent(
  input: TempleAnalyticsEventInput & {
    event: TempleAnalyticsClientEventName;
  }
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!isTempleAnalyticsClientEventName(input.event)) return false;

  const path = sanitizeTempleAnalyticsPath(input.path);
  const fingerprint = `${input.event}|${path ?? ''}|${input.ritual ?? ''}`;

  if (!shouldSend(fingerprint, Date.now())) return false;

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: input.event,
        eventKey: input.eventKey ?? eventKey(),
        ritual: input.ritual ?? null,
        path,
        source: input.source ?? null,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}
