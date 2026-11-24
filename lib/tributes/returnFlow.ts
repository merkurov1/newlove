export type TributeReturn =
  | { kind: 'success'; sessionId: string | null }
  | { kind: 'cancel'; sessionId: null }
  | { kind: 'pending'; sessionId: null };

const SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]{8,200}$/;

/**
 * The browser return is only a routing hint. `success` never means paid: the
 * session id must still be verified by the server against Stripe before any
 * Tribute is displayed as confirmed.
 */
export function parseTributeReturn(search: string | null): TributeReturn {
  const params = new URLSearchParams(search || '');
  const status = params.get('status');
  const rawSessionId = (params.get('session_id') || '').trim();
  const sessionId = SESSION_ID_PATTERN.test(rawSessionId)
    ? rawSessionId
    : null;

  if (status === 'success') {
    return { kind: 'success', sessionId };
  }

  if (status === 'cancel') {
    return { kind: 'cancel', sessionId: null };
  }

  return { kind: 'pending', sessionId: null };
}

export function isTributeSessionId(value: string | null): boolean {
  return Boolean(value && SESSION_ID_PATTERN.test(value));
}
