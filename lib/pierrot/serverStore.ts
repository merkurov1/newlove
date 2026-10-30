import { createHash, randomUUID } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  PIERROT_RETENTION_DAYS,
  type PierrotConsentState,
  type PierrotEventName,
} from '@/lib/pierrot/conversation';

/**
 * Server-only persistence adapter for Pierrot Intelligence.
 *
 * The service-role client bypasses RLS. It must never be imported from a
 * Client Component or exposed through a public read endpoint.
 */
export function createPierrotStore(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export type PierrotConversationInput = {
  id: string;
  sessionId: string;
  startPage: string;
  referrer: string | null;
  language: 'ru' | 'en' | 'und';
  consentState: PierrotConsentState;
  consentVersion: string | null;
};

function retentionExpiry(): string {
  return new Date(Date.now() + PIERROT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function warn(operation: string, error: unknown): void {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : 'unknown';

  // Never log message text, referrers or provider responses here.
  console.warn(`[Pierrot persistence] ${operation} failed (${code})`);
}

/**
 * Creates the conversation on the first write and refreshes only the fields
 * that are safe to update on subsequent messages. Start page, referrer and
 * started_at are never overwritten.
 */
export async function ensurePierrotConversation(
  store: SupabaseClient,
  input: PierrotConversationInput
): Promise<void> {
  const now = new Date().toISOString();
  const expiresAt = retentionExpiry();

  const { error: insertError } = await store.from('pierrot_conversations').upsert(
    {
      id: input.id,
      session_id: input.sessionId,
      start_page: input.startPage,
      referrer: input.referrer,
      language: input.language,
      consent_state: input.consentState,
      consent_version: input.consentVersion,
      status: 'active',
      started_at: now,
      updated_at: now,
      expires_at: expiresAt,
    },
    { onConflict: 'id', ignoreDuplicates: true }
  );

  if (insertError) throw insertError;

  const update: Record<string, unknown> = {
    status: 'active',
    updated_at: now,
    expires_at: expiresAt,
  };

  // Granting can upgrade "pending" to "granted". A pending request must never
  // downgrade a previously granted conversation.
  if (input.consentState === 'granted') {
    update.consent_state = 'granted';
    update.consent_version = input.consentVersion;
  }

  // An event (for example, a navigation click) may arrive before any chat
  // text. Do not downgrade an already detected conversation language to
  // "und" in that case.
  if (input.language !== 'und') update.language = input.language;

  const { error: updateError } = await store
    .from('pierrot_conversations')
    .update(update)
    .eq('id', input.id)
    .eq('session_id', input.sessionId);

  if (updateError) throw updateError;
}

export type AppendPierrotMessageInput = {
  conversationId: string;
  sessionId: string;
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: string | null;
};

export type AppendPierrotMessageResult = {
  sequence: number;
  content: string;
  inserted: boolean;
};

function firstRpcRow(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return value[0] && typeof value[0] === 'object' ? (value[0] as Record<string, unknown>) : null;
  }

  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/**
 * Atomic, idempotent message insertion. The SQL function serialises writers
 * for one conversation, reuses an existing message_id and assigns the next
 * per-conversation sequence number.
 */
export async function appendPierrotMessage(
  store: SupabaseClient,
  input: AppendPierrotMessageInput
): Promise<AppendPierrotMessageResult> {
  const { data, error } = await store.rpc('pierrot_append_message', {
    p_conversation_id: input.conversationId,
    p_session_id: input.sessionId,
    p_message_id: input.messageId,
    p_role: input.role,
    p_content: input.content,
    p_provider: input.provider ?? null,
  });

  if (error) throw error;

  const row = firstRpcRow(data);

  if (!row) throw new Error('pierrot_append_message returned no row');

  return {
    sequence: Number(row.sequence),
    content: typeof row.content === 'string' ? row.content : input.content,
    inserted: row.inserted === true,
  };
}

export type RecordPierrotEventInput = {
  conversationId: string;
  sessionId: string;
  eventName: PierrotEventName;
  eventKey: string;
  payload?: Record<string, unknown>;
};

/**
 * Server-side variant for flows that only hold the opaque conversation id
 * (subscription confirmation links, checkout webhooks). The session id is read
 * from the conversation row and never accepted from the caller.
 */
export async function recordPierrotEventByConversationId(
  store: SupabaseClient,
  input: {
    conversationId: string;
    eventName: PierrotEventName;
    eventKey: string;
    payload?: Record<string, unknown>;
  }
): Promise<boolean> {
  try {
    const { data, error } = await store
      .from('pierrot_conversations')
      .select('session_id')
      .eq('id', input.conversationId)
      .maybeSingle();

    if (error || !data || typeof data.session_id !== 'string') return false;

    return await recordPierrotEvent(store, {
      conversationId: input.conversationId,
      sessionId: data.session_id,
      eventName: input.eventName,
      eventKey: input.eventKey,
      payload: input.payload,
    });
  } catch {
    return false;
  }
}

/**
 * Inserts an event at most once per conversation/event_key pair. The SQL
 * function also verifies that the caller knows the conversation's session id.
 */
export async function recordPierrotEvent(
  store: SupabaseClient,
  input: RecordPierrotEventInput
): Promise<boolean> {
  const { data, error } = await store.rpc('pierrot_record_event', {
    p_conversation_id: input.conversationId,
    p_session_id: input.sessionId,
    p_event_name: input.eventName,
    p_event_key: input.eventKey,
    p_payload: input.payload ?? {},
  });

  if (error) throw error;

  return data === true;
}

/**
 * Replay lookups are session-checked so knowing a conversation/message id is
 * never enough to read somebody else's stored reply through the public API.
 */
export async function conversationBelongsToSession(
  store: SupabaseClient,
  conversationId: string,
  sessionId: string
): Promise<boolean> {
  const { data, error } = await store
    .from('pierrot_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) throw error;

  return Boolean(data);
}

/**
 * Loads recent messages for a conversation after verifying that the caller
 * owns the session. Used by server-side adapters (Telegram) that do not have
 * a browser history to send.
 */
export async function loadPierrotHistory(
  store: SupabaseClient,
  conversationId: string,
  sessionId: string,
  limit = 20
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const ownsConversation = await conversationBelongsToSession(store, conversationId, sessionId);

  if (!ownsConversation) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 24);
  const { data, error } = await store
    .from('pierrot_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('message_index', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;

  return (Array.isArray(data) ? data : [])
    .reverse()
    .filter(
      (row): row is { role: 'user' | 'assistant'; content: string } =>
        (row.role === 'user' || row.role === 'assistant') && typeof row.content === 'string'
    )
    .map((row) => ({ role: row.role, content: row.content }));
}

export type PierrotCommercialSignal = {
  eventName: string;
  payload: Record<string, unknown> | null;
  createdAt: string | null;
};

const COMMERCIAL_EVENT_NAMES = [
  'interest_detected',
  'offer_eligible',
  'offer_selected',
  'offer_shown',
  'offer_viewed',
  'cta_shown',
  'commercial_declined',
  'commercial_returned',
  'intent_classified',
  'order_paid',
  'purchase_completed',
  'unframed_purchase_confirmed',
] as const;

function safePayload(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Reconstructs the commercial state from trusted events. The query is scoped
 * to one conversation and is only performed when the caller proves it owns
 * the session. Failure is non-fatal: the conversation falls back to the
 * browser transcript.
 */
export async function loadPierrotCommercialSignals(
  store: SupabaseClient,
  conversationId: string,
  sessionId: string
): Promise<{ events: PierrotCommercialSignal[]; subscriptionEvents: PierrotCommercialSignal[] }> {
  const empty: {
    events: PierrotCommercialSignal[];
    subscriptionEvents: PierrotCommercialSignal[];
  } = { events: [], subscriptionEvents: [] };

  try {
    const ownsConversation = await conversationBelongsToSession(store, conversationId, sessionId);

    if (!ownsConversation) return empty;

    const events: PierrotCommercialSignal[] = [];
    const subscriptionEvents: PierrotCommercialSignal[] = [];

    try {
      const { data, error } = await store
        .from('pierrot_events')
        .select('event_name, payload, created_at')
        .eq('conversation_id', conversationId)
        .in('event_name', [...COMMERCIAL_EVENT_NAMES])
        .order('created_at', { ascending: true })
        .limit(80);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          if (typeof row.event_name !== 'string') continue;
          events.push({
            eventName: row.event_name,
            payload: safePayload(row.payload),
            createdAt: typeof row.created_at === 'string' ? row.created_at : null,
          });
        }
      }
    } catch {
      // The transcript path remains available.
    }

    try {
      const { data, error } = await store
        .from('subscription_events')
        .select('event_name, payload, created_at')
        .eq('conversation_id', conversationId)
        .eq('event_name', 'subscription_confirmed')
        .limit(20);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          if (row.event_name !== 'subscription_confirmed') continue;
          subscriptionEvents.push({
            eventName: row.event_name,
            payload: safePayload(row.payload),
            createdAt: typeof row.created_at === 'string' ? row.created_at : null,
          });
        }
      }
    } catch {
      // A missing subscription-events table must not break chat.
    }

    return { events, subscriptionEvents };
  } catch {
    return empty;
  }
}

export async function getPierrotConversationConsent(
  store: SupabaseClient,
  conversationId: string,
  sessionId: string
): Promise<{ state: PierrotConsentState; version: string | null } | null> {
  const { data, error } = await store
    .from('pierrot_conversations')
    .select('consent_state, consent_version')
    .eq('id', conversationId)
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) throw error;

  if (
    !data ||
    (data.consent_state !== 'pending' &&
      data.consent_state !== 'granted' &&
      data.consent_state !== 'denied')
  ) {
    return null;
  }

  return {
    state: data.consent_state,
    version: typeof data.consent_version === 'string' ? data.consent_version : null,
  };
}

export async function setPierrotConversationConsent(
  store: SupabaseClient,
  conversationId: string,
  sessionId: string,
  state: PierrotConsentState,
  version: string | null
): Promise<void> {
  const { error } = await store
    .from('pierrot_conversations')
    .update({
      consent_state: state,
      consent_version: version,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .eq('session_id', sessionId);

  if (error) throw error;
}

export async function findPierrotAssistantReply(
  store: SupabaseClient,
  conversationId: string,
  messageId: string
): Promise<{ content: string; provider: string | null } | null> {
  const { data, error } = await store
    .from('pierrot_messages')
    .select('content, provider')
    .eq('conversation_id', conversationId)
    .eq('id', messageId)
    .maybeSingle();

  if (error) throw error;
  if (!data || typeof data.content !== 'string') return null;

  return {
    content: data.content,
    provider: typeof data.provider === 'string' ? data.provider : null,
  };
}

export async function markPierrotConversationEnded(
  store: SupabaseClient,
  conversationId: string,
  sessionId: string
): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await store
    .from('pierrot_conversations')
    .update({ status: 'ended', ended_at: now, updated_at: now })
    .eq('id', conversationId)
    .eq('session_id', sessionId);

  if (error) throw error;
}

/**
 * Deletion requires both random identifiers held by the browser. The public
 * endpoint returns no conversation data, so it cannot be used to enumerate or
 * read transcripts.
 */
export async function deletePierrotConversation(
  store: SupabaseClient,
  conversationId: string,
  sessionId: string
): Promise<void> {
  const { error } = await store
    .from('pierrot_conversations')
    .delete()
    .eq('id', conversationId)
    .eq('session_id', sessionId);

  if (error) throw error;
}

/**
 * Deterministic assistant message id: retrying the same user turn reuses the
 * same row instead of creating a second assistant reply.
 */
export function createAssistantMessageId(conversationId: string, userMessageId: string): string {
  const digest = createHash('sha256')
    .update(`pierrot-assistant:${conversationId}:${userMessageId}`)
    .digest('hex')
    .slice(0, 40);

  return `a_${digest}`;
}

export function createPierrotOpaqueId(): string {
  return randomUUID();
}

export function persistenceFailure(error: unknown, operation: string): void {
  warn(operation, error);
}
