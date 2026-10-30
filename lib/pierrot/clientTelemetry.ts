'use client';

import { createPierrotId } from '@/lib/pierrot/navigation';
import {
  PIERROT_CONSENT_VERSION,
  isPierrotId,
  type PierrotClientEventName,
  type PierrotConsent,
  type PierrotConsentState,
} from '@/lib/pierrot/conversation';

const SESSION_KEY = 'pierrot_session_id_v1';
const CONVERSATION_KEY = 'pierrot_conversation_id_v1';
const CONSENT_KEY = 'pierrot_consent_v1';

const memory = new Map<string, string>();

function readValue(key: string, storage: 'session' | 'local'): string | null {
  if (typeof window === 'undefined') return memory.get(key) ?? null;

  try {
    const store = storage === 'session' ? window.sessionStorage : window.localStorage;
    return store.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeValue(key: string, value: string, storage: 'session' | 'local'): void {
  memory.set(key, value);

  if (typeof window === 'undefined') return;

  try {
    const store = storage === 'session' ? window.sessionStorage : window.localStorage;
    store.setItem(key, value);
  } catch {
    // The in-memory fallback keeps the current tab working.
  }
}

function removeValue(key: string, storage: 'session' | 'local'): void {
  memory.delete(key);

  if (typeof window === 'undefined') return;

  try {
    const store = storage === 'session' ? window.sessionStorage : window.localStorage;
    store.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
}

function getOrCreateId(key: string): string {
  const existing = readValue(key, 'session');
  if (isPierrotId(existing)) return existing;

  const created = createPierrotId();
  writeValue(key, created, 'session');
  return created;
}

export function getPierrotSessionId(): string {
  return getOrCreateId(SESSION_KEY);
}

export function getPierrotConversationId(): string {
  return getOrCreateId(CONVERSATION_KEY);
}

/**
 * Restores the session id when a human-presence recovery token is the only
 * credential left after the browser tab was closed.
 */
export function setPierrotSessionId(value: unknown): void {
  if (!isPierrotId(value)) return;
  writeValue(SESSION_KEY, value, 'session');
}

export function setPierrotConversationId(value: unknown): void {
  if (!isPierrotId(value)) return;
  writeValue(CONVERSATION_KEY, value, 'session');
}

export function rotatePierrotConversationId(): string {
  removeValue(CONVERSATION_KEY, 'session');
  return getPierrotConversationId();
}

/**
 * The compact notice in the chat states that saving is on and offers an
 * immediate opt-out. Absence of a stored decision therefore resolves to the
 * notified default; an explicit "denied" is never overwritten implicitly.
 */
export function getPierrotConsent(): PierrotConsent {
  const raw = readValue(CONSENT_KEY, 'local');

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      if (
        (parsed.state === 'granted' || parsed.state === 'denied') &&
        parsed.version === PIERROT_CONSENT_VERSION
      ) {
        return { state: parsed.state, version: PIERROT_CONSENT_VERSION };
      }
    } catch {
      // Fall through to the notified default.
    }
  }

  const consent: PierrotConsent = {
    state: 'granted',
    version: PIERROT_CONSENT_VERSION,
  };

  writeValue(CONSENT_KEY, JSON.stringify(consent), 'local');
  return consent;
}

export function setPierrotConsent(state: PierrotConsentState): PierrotConsent {
  const consent: PierrotConsent = {
    state: state === 'denied' ? 'denied' : 'granted',
    version: PIERROT_CONSENT_VERSION,
  };

  writeValue(CONSENT_KEY, JSON.stringify(consent), 'local');
  return consent;
}

function postJson(
  path: string,
  method: 'POST' | 'DELETE',
  body: unknown
): Promise<Response> | null {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return null;

  try {
    return fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget write for a real user action. Telemetry failure never
 * interrupts navigation or chat.
 */
export function trackPierrotEvent(
  eventName: PierrotClientEventName,
  eventKey: string,
  payload: Record<string, unknown>
): void {
  const consent = getPierrotConsent();
  if (consent.state !== 'granted') return;

  const request = postJson('/api/pierrot/events', 'POST', {
    conversationId: getPierrotConversationId(),
    sessionId: getPierrotSessionId(),
    eventName,
    eventKey,
    payload,
    consent,
    context: {
      pathname: typeof window !== 'undefined' ? window.location.pathname : '/',
      referrer: typeof document !== 'undefined' ? document.referrer : undefined,
    },
  });

  void request?.catch(() => {
    // Silent: local chat remains the source of truth for the visitor.
  });
}

export function endPierrotConversation(
  reason: 'new_chat' | 'user_closed' | 'page_hidden' = 'user_closed'
): void {
  trackPierrotEvent('conversation_ended', createPierrotId(), { reason });
}

export async function deletePierrotConversation(): Promise<boolean> {
  const request = postJson('/api/pierrot/conversations', 'DELETE', {
    conversationId: getPierrotConversationId(),
    sessionId: getPierrotSessionId(),
  });

  if (!request) return false;

  try {
    const response = await request;
    return response.ok;
  } catch {
    return false;
  }
}
