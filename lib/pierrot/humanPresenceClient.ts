'use client';

import type {
  HumanPresenceMessageResponse,
  HumanPresenceStateResponse,
} from '@/lib/pierrot/humanPresenceShared';

const HUMAN_ACCESS_STORAGE_KEY = 'pierrot_human_access_v1';

export type SavedHumanAccess = {
  token: string;
  requestId: string;
  savedAt: string;
};

export function saveHumanAccessToken(token: string, requestId: string): void {
  if (typeof window === 'undefined') return;
  if (!token || !requestId) return;

  try {
    window.localStorage.setItem(
      HUMAN_ACCESS_STORAGE_KEY,
      JSON.stringify({ token, requestId, savedAt: new Date().toISOString() }),
    );
  } catch {
    // The current tab can still poll with conversation/session ids.
  }
}

export function loadHumanAccessToken(): SavedHumanAccess | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(HUMAN_ACCESS_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (
      typeof parsed.token !== 'string' ||
      typeof parsed.requestId !== 'string' ||
      typeof parsed.savedAt !== 'string'
    ) {
      return null;
    }

    return {
      token: parsed.token,
      requestId: parsed.requestId,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function hasSavedHumanAccessToken(): boolean {
  return loadHumanAccessToken() !== null;
}

export function clearHumanAccessToken(): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(HUMAN_ACCESS_STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

export type HumanApiResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
};

async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  keepalive = false,
): Promise<HumanApiResult<T>> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') {
    return { ok: false, status: 0, data: null };
  }

  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      ...(keepalive ? { keepalive: true } : {}),
      ...(signal ? { signal } : {}),
    });

    const data = (await response.json().catch(() => null)) as T | null;

    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export function fetchHumanPresenceState(input: {
  token?: string | null;
  conversationId?: string | null;
  sessionId?: string | null;
  signal?: AbortSignal;
}): Promise<HumanApiResult<HumanPresenceStateResponse>> {
  return postJson<HumanPresenceStateResponse>(
    '/api/pierrot/human/state',
    {
      ...(input.token ? { token: input.token } : {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    },
    input.signal,
  );
}

export function sendHumanPresenceMessage(input: {
  token?: string | null;
  conversationId?: string | null;
  sessionId?: string | null;
  messageId: string;
  content: string;
}): Promise<HumanApiResult<HumanPresenceMessageResponse>> {
  return postJson<HumanPresenceMessageResponse>(
    '/api/pierrot/human/message',
    {
      ...(input.token ? { token: input.token } : {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      messageId: input.messageId,
      content: input.content,
    },
    undefined,
    true,
  );
}

export function humanPresenceAction(input: {
  token?: string | null;
  conversationId?: string | null;
  sessionId?: string | null;
  action: 'cancel' | 'close';
}): Promise<HumanApiResult<HumanPresenceStateResponse>> {
  return postJson<HumanPresenceStateResponse>(
    '/api/pierrot/human/action',
    {
      ...(input.token ? { token: input.token } : {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      action: input.action,
    },
    undefined,
    true,
  );
}
