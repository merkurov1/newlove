import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/pierrot/serverStore');

import { createHash, randomUUID } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  PIERROT_RETENTION_DAYS,
  type PierrotConsentState,
  type PierrotEventName,
} from '@/lib/pierrot/conversation';
import { isMissingIdentityColumn, type PierrotIdentity } from '@/lib/pierrot/identity';

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
  identity?: PierrotIdentity;
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
function identityColumns(identity: PierrotIdentity | undefined): Record<string, unknown> {
  if (!identity) return {};

  return {
    identity_type: identity.type,
    visitor_id: identity.type === 'visitor' ? identity.visitorId : null,
    user_id: identity.type === 'owner' ? identity.userId : null,
    identity_verified_at:
      identity.type === 'owner' ? (identity.verifiedAt ?? new Date().toISOString()) : null,
    identity_source: identity.source,
  };
}

export async function ensurePierrotConversation(
  store: SupabaseClient,
  input: PierrotConversationInput
): Promise<void> {
  const now = new Date().toISOString();
  const expiresAt = retentionExpiry();
  const identity = input.identity;
  const baseInsert = {
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
  };

  const insertResult = await store
    .from('pierrot_conversations')
    .upsert(
      { ...baseInsert, ...identityColumns(identity) },
      { onConflict: 'id', ignoreDuplicates: true }
    );

  if (insertResult.error) {
    if (!identity || !isMissingIdentityColumn(insertResult.error)) {
      throw insertResult.error;
    }

    // Before the manual migration the new columns do not exist. Attribution
    // stays unknown, but the chat must continue to work.
    const legacyInsert = await store.from('pierrot_conversations').upsert(baseInsert, {
      onConflict: 'id',
      ignoreDuplicates: true,
    });

    if (legacyInsert.error) throw legacyInsert.error;
  }

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

  const attribution = identityColumns(identity);

  if (identity?.type === 'owner') {
    // Owner verification is an upgrade and may replace a previous visitor
    // pseudonym. The owner's private visitor id is never retained.
    Object.assign(update, attribution);
  } else if (identity?.type === 'visitor') {
    Object.assign(update, attribution);
  }

  const applyUpdate = async (payload: Record<string, unknown>, conditional: boolean) => {
    let query = store
      .from('pierrot_conversations')
      .update(payload)
      .eq('id', input.id)
      .eq('session_id', input.sessionId);

    // A visitor or anonymous signal must never overwrite an already verified
    // owner conversation. Owner updates above deliberately skip this guard.
    if (conditional) query = query.neq('identity_type', 'owner');

    return query;
  };

  const updateResult = await applyUpdate(
    update,
    identity?.type !== 'owner' && Object.keys(attribution).length > 0
  );

  if (updateResult.error) {
    if (!isMissingIdentityColumn(updateResult.error)) throw updateResult.error;

    const legacyUpdate = {
      status: update.status,
      updated_at: update.updated_at,
      expires_at: update.expires_at,
      ...(update.consent_state ? { consent_state: update.consent_state } : {}),
      ...(update.consent_version ? { consent_version: update.consent_version } : {}),
      ...(update.language ? { language: update.language } : {}),
    };
    const legacyResult = await store
      .from('pierrot_conversations')
      .update(legacyUpdate)
      .eq('id', input.id)
      .eq('session_id', input.sessionId);

    if (legacyResult.error) throw legacyResult.error;
  }
}

export type AppendPierrotMessageInput = {
  conversationId: string;
  sessionId: string;
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: string | null;
  /** Permanent history. When both history and episode are set, provenance is written. */
  historyId?: string | null;
  /** Episode/session inside the history. */
  episodeId?: string | null;
  /**
   * Optional structured payload (for example a validated PierrotResponse).
   * Stored next to the text so a restored conversation renders the same blocks
   * as the live answer. The Markdown content remains the fallback.
   */
  metadata?: Record<string, unknown> | null;
};

export type AppendPierrotMessageResult = {
  sequence: number;
  content: string;
  inserted: boolean;
  historySequence?: number | null;
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
  const useHistory = Boolean(input.historyId && input.episodeId);
  const rpcName = useHistory ? 'pierrot_append_message_v2' : 'pierrot_append_message';
  const params: Record<string, unknown> = {
    p_conversation_id: input.conversationId,
    p_session_id: input.sessionId,
    p_message_id: input.messageId,
    p_role: input.role,
    p_content: input.content,
    p_provider: input.provider ?? null,
  };

  if (useHistory) {
    params.p_history_id = input.historyId;
    params.p_episode_id = input.episodeId;
  }

  const { data, error } = await store.rpc(rpcName, params);

  if (error) throw error;

  const row = firstRpcRow(data);

  if (!row) throw new Error(`${rpcName} returned no row`);

  const historySequence = Number(row.history_sequence);
  const inserted = row.inserted === true;

  // Structured metadata is written in a second, best-effort statement. Older
  // deployments without the metadata column keep the Markdown answer instead
  // of failing the whole turn.
  if (inserted && input.metadata && Object.keys(input.metadata).length > 0) {
    try {
      const { error: metadataError } = await store
        .from('pierrot_messages')
        .update({ metadata: input.metadata })
        .eq('id', input.messageId)
        .eq('conversation_id', input.conversationId);

      if (metadataError) {
        console.warn('[Pierrot persistence] message metadata unavailable', {
          code: metadataError.code || 'metadata_write_failed',
        });
      }
    } catch {
      // The text transcript is authoritative. Never fail a turn for optional
      // visual metadata.
    }
  }

  return {
    sequence: Number(row.sequence),
    content: typeof row.content === 'string' ? row.content : input.content,
    inserted,
    ...(Number.isFinite(historySequence) && historySequence > 0
      ? { historySequence }
      : {}),
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
  'donation_completed',
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

/**
 * Loads only the operational trace of the most recent assistant reply. It is
 * used to answer “Почему ты так ответил?” without exposing prompts, secrets or
 * retrieved passages.
 */
export async function loadLastPierrotAssistantTrace(
  store: SupabaseClient,
  conversationId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await store
    .from('pierrot_events')
    .select('payload,created_at')
    .eq('conversation_id', conversationId)
    .eq('event_name', 'assistant_replied')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.payload || typeof data.payload !== 'object') return null;
  return {
    ...(data.payload as Record<string, unknown>),
    created_at: data.created_at,
  };
}

export async function findPierrotAssistantReply(
  store: SupabaseClient,
  conversationId: string,
  messageId: string
): Promise<{
  content: string;
  provider: string | null;
  metadata: Record<string, unknown> | null;
} | null> {
  let result = await store
    .from('pierrot_messages')
    .select('content, provider, metadata')
    .eq('conversation_id', conversationId)
    .eq('id', messageId)
    .maybeSingle();

  if (
    result.error &&
    /metadata/i.test(String((result.error as { message?: unknown }).message || ''))
  ) {
    result = await store
      .from('pierrot_messages')
      .select('content, provider')
      .eq('conversation_id', conversationId)
      .eq('id', messageId)
      .maybeSingle();
  }

  const { data, error } = result;
  if (error) throw error;
  if (!data || typeof data.content !== 'string') return null;

  return {
    content: data.content,
    provider: typeof data.provider === 'string' ? data.provider : null,
    metadata:
      'metadata' in data &&
      data.metadata &&
      typeof data.metadata === 'object' &&
      !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : null,
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
): Promise<boolean> {
  // Permanent histories and session provenance own their conversations. A
  // browser delete must never cascade through preserved history messages.
  try {
    const [historyRef, sessionRef] = await Promise.all([
      store
        .from('pierrot_histories')
        .select('id')
        .eq('canonical_conversation_id', conversationId)
        .limit(1),
      store
        .from('pierrot_sessions')
        .select('id')
        .or(
          `conversation_id.eq.${conversationId},source_conversation_id.eq.${conversationId}`
        )
        .limit(1),
    ]);

    if (
      (Array.isArray(historyRef.data) && historyRef.data.length > 0) ||
      (Array.isArray(sessionRef.data) && sessionRef.data.length > 0)
    ) {
      return false;
    }
  } catch {
    // If the new tables do not exist yet, keep the legacy delete path.
  }

  const { error } = await store
    .from('pierrot_conversations')
    .delete()
    .eq('id', conversationId)
    .eq('session_id', sessionId);

  if (error) throw error;
  return true;
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
