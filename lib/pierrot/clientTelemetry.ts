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
const VISITOR_KEY = 'pierrot_visitor_id_v1';
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
 * A random first-party visitor pseudonym. It is created only after explicit
 * storage consent, lives across sessions on this browser profile, and is never
 * derived from IP, email, fingerprint or any account identity.
 *
 * The two reads around the write make concurrent tabs converge on the value
 * that is actually stored instead of keeping two different aliases in memory.
 */
export function getPierrotVisitorId(): string | null {
  if (getPierrotConsent().state !== 'granted') return null;

  const existing = readValue(VISITOR_KEY, 'local');
  if (isPierrotId(existing)) return existing;

  const created = createPierrotId();
  writeValue(VISITOR_KEY, created, 'local');

  const stored = readValue(VISITOR_KEY, 'local');
  return isPierrotId(stored) ? stored : created;
}

/**
 * Called only when the authenticated identity changes (sign-in, sign-out or a
 * different account). A new alias prevents the next anonymous user of the same
 * browser profile from inheriting the previous user's visitor history.
 */
export function rotatePierrotVisitorId(): string | null {
  removeValue(VISITOR_KEY, 'local');
  return getPierrotVisitorId();
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
 * No stored choice is NOT consent. Until the visitor explicitly allows saving,
 * the state is `pending` and no transcript or client event is written.
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
      // Fall through to pending.
    }
  }

  return {
    state: 'pending',
    version: PIERROT_CONSENT_VERSION,
  };
}

export function setPierrotConsent(state: PierrotConsentState): PierrotConsent {
  const consent: PierrotConsent = {
    state: state === 'denied' ? 'denied' : state === 'pending' ? 'pending' : 'granted',
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
    visitorId: getPierrotVisitorId(),
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
